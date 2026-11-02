import { BadRequestException, Injectable, Module, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MailModule } from '../mail/mail.module.js';
import { MailService } from '../mail/mail.service.js';
import { SmsModule } from '../sms/sms.module.js';
import { SmsService } from '../sms/sms.service.js';

/**
 * Releasing a report to the patient: the report becomes APPROVED, the booking REPORT_READY (with a status log), and
 * the patient is told — app/website notification, email (with the PDF when possible) and SMS. Used by admin's
 * "Approve & release" and by a lab's upload, which releases straight away. A booking that already had a released
 * report is told an updated report is available instead.
 */
@Injectable()
export class ReportReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  async release(reportId: string, releasedBy: 'ADMIN' | 'LAB') {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    const order = await this.prisma.order.findUnique({ where: { id: report.orderId } });
    if (!order) throw new NotFoundException('Order not found');
    // A cancelled order must stay cancelled — releasing a report against it would silently overwrite that back to
    // REPORT_READY with no warning.
    if (order.status === 'CANCELLED') throw new BadRequestException('This report belongs to a cancelled order and cannot be released');
    const isUpdate = order.status === 'REPORT_READY';

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedReport = await tx.report.update({ where: { id: reportId }, data: { status: 'APPROVED', approvedAt: new Date() } });
      await tx.order.update({
        where: { id: report.orderId },
        data: {
          status: 'REPORT_READY',
          statusLogs: {
            create: {
              status: 'REPORT_READY',
              note: isUpdate ? 'Updated report released' : releasedBy === 'LAB' ? 'Report uploaded by the lab and released' : 'Report approved and released',
              changedBy: releasedBy,
            },
          },
        },
      });
      return updatedReport;
    });

    await this.notifications.notifyUser(order.userId, {
      title: isUpdate ? 'Your updated report is ready' : 'Your report is ready',
      body: `Order ${order.orderNumber} — ${isUpdate ? 'an updated report has been released' : 'your report has been released'}`,
      // Still an ORDER_STATUS push (the booking timeline reads it); event + reportId let the app open the report itself.
      data: { type: 'ORDER_STATUS', event: 'REPORT', orderId: order.id, reportId, status: 'REPORT_READY' },
    });
    // Fire-and-forget: MailService never throws, and retries/SMTP slowness must not delay the response.
    void this.mail.reportReady(order.userId, { orderNumber: order.orderNumber, orderId: order.id, reportId });
    void this.sms.orderSms(order.id, 'reportReady');
    return updated;
  }
}

@Module({
  imports: [NotificationsModule, MailModule, SmsModule],
  providers: [ReportReleaseService],
  exports: [ReportReleaseService],
})
export class ReportReleaseModule {}
