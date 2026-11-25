import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { istInstant, todayIstDateString } from '../common/ist-time.js';
import { MessageTemplatesService } from '../notifications/message-templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { SmsService } from '../sms/sms.service.js';

const RUN_EVERY_MS = 5 * 60_000;

/**
 * Appointment time reminder: every 5 minutes, each active booking whose slot starts within
 * SiteSetting.reminderHoursBefore hours gets one reminder (push + SMS once its DLT template is approved).
 * Order.reminderSentAt is claimed with a conditional update first, so a reminder is never sent twice; changing the
 * date or slot (admin edit, lab reactivation) clears it so the new time is reminded too.
 */
@Injectable()
export class AppointmentReminderSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AppointmentReminder');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly templates: MessageTemplatesService,
    private readonly sms: SmsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const tick = () => void this.runOnce().catch((err) => this.logger.error(`Reminder run failed: ${(err as Error).message}`));
    setTimeout(tick, 20_000).unref();
    this.timer = setInterval(tick, RUN_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now: Date = new Date()): Promise<{ sent: number }> {
    if (this.running) return { sent: 0 };
    this.running = true;
    try {
      const { reminderHoursBefore } = await this.settings.getOrCreate();
      if (!(reminderHoursBefore > 0)) return { sent: 0 };
      const leadMs = reminderHoursBefore * 3_600_000;
      // Slots that start between now and now + lead fall on today's or (for a long lead) the next IST dates.
      const from = new Date(`${todayIstDateString(now)}T00:00:00.000Z`);
      const to = new Date(`${todayIstDateString(new Date(now.getTime() + leadMs))}T00:00:00.000Z`);

      const due = await this.prisma.order.findMany({
        where: {
          reminderSentAt: null,
          status: { in: ['CONFIRMED', 'PHLEBOTOMIST_ASSIGNED'] },
          scheduledDate: { gte: from, lte: to },
          slotId: { not: null },
        },
        select: { id: true, collectionType: true, scheduledDate: true, slot: { select: { startTime: true } } },
        take: 500,
      });

      let sent = 0;
      for (const o of due) {
        if (!o.scheduledDate || !o.slot) continue;
        let start: Date;
        try {
          start = istInstant(o.scheduledDate.toISOString().slice(0, 10), o.slot.startTime);
        } catch {
          continue;
        }
        const msLeft = start.getTime() - now.getTime();
        if (msLeft > leadMs) continue;
        // Claim first: only one run (or server) sends it. A slot already started is marked without a message.
        const claimed = await this.prisma.order.updateMany({ where: { id: o.id, reminderSentAt: null }, data: { reminderSentAt: now } });
        if (claimed.count !== 1 || msLeft <= 0) continue;
        await this.templates.notifyOrder('appointmentReminder', o.id, {}, { reminder: 'true' });
        if (o.collectionType === 'HOME') void this.sms.orderSms(o.id, 'appointmentReminder');
        sent++;
      }
      if (sent) this.logger.log(`Sent ${sent} appointment reminder(s)`);
      return { sent };
    } finally {
      this.running = false;
    }
  }
}
