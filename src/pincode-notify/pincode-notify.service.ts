import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MailService } from '../mail/mail.service.js';
import { CreatePincodeNotifyRequestDto } from './dto/create-pincode-notify-request.dto.js';

@Injectable()
export class PincodeNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async create(dto: CreatePincodeNotifyRequestDto) {
    const request = await this.prisma.pincodeNotifyRequest.create({
      data: { phone: dto.phone, pincode: dto.pincode },
    });

    await this.notifications.notifyAdmins({
      title: 'Service-area request',
      body: `${dto.phone} wants to book from pincode ${dto.pincode} — not covered by any lab yet`,
      data: { type: 'PINCODE_NOTIFY_REQUEST', requestId: request.id },
    });

    return request;
  }

  /**
   * Called after admin adds/edits a Lab's servicePincodes — best-effort push to any existing
   * User at each newly-covered phone, then marks the request NOTIFIED. Never throws: matches
   * NotificationsService's own swallow-and-log convention, since a missed notification should
   * never block the admin action that triggered it.
   */
  async notifyPendingForPincode(pincode: string) {
    const pending = await this.prisma.pincodeNotifyRequest.findMany({
      where: { pincode, status: 'PENDING' },
    });
    if (pending.length === 0) return;

    for (const req of pending) {
      const user = await this.prisma.user.findUnique({ where: { phone: req.phone } });
      if (user) {
        await this.notifications.notifyUser(user.id, {
          title: 'Now serving your area!',
          body: `MD Path Lab is now available at pincode ${pincode} — book your test now.`,
          data: { type: 'PINCODE_NOW_AVAILABLE', pincode },
        });
        void this.mail.pincodeAvailable(user.id, pincode);
      }
    }

    await this.prisma.pincodeNotifyRequest.updateMany({
      where: { pincode, status: 'PENDING' },
      data: { status: 'NOTIFIED' },
    });
  }
}
