import { Injectable, Logger } from '@nestjs/common';
import type { NotificationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseService } from './firebase.service.js';

type Payload = { title: string; body: string; data?: Record<string, string> };

// Best-effort categorization of the existing push `data.type`/`status` values into the customer
// app's notification-feed filter (see Prisma's NotificationKind) — never a new field callers have
// to remember to pass; every notifyUser() call site stays exactly as it was.
function inferKind(data: Record<string, string> | undefined): NotificationKind {
  const type = data?.type;
  if (type === 'ORDER_STATUS') return data?.status === 'REPORT_READY' ? 'REPORT' : 'BOOKING';
  if (type === 'ASSIGNMENT' || type === 'ORDER_CREATED' || type === 'ORDER_ADDON_REQUEST' || type === 'ORDER_ADDON_UPDATE') return 'BOOKING';
  if (
    type === 'PRESCRIPTION_UPLOADED' ||
    type === 'PRESCRIPTION_REVIEWED' ||
    type === 'PRESCRIPTION_ACTION_REQUIRED' ||
    type === 'PINCODE_NOW_AVAILABLE'
  ) {
    return 'BOOKING';
  }
  return 'GENERAL';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  /**
   * Patient or phlebotomist — both are `User` rows, keyed the same way. Always writes a
   * persisted Notification row (the in-app feed's source of truth) alongside the best-effort
   * Firebase push — a missed/denied/no-device-token push must never mean the event is gone from
   * the app entirely, only that it wasn't delivered in real time.
   */
  async notifyUser(userId: string, payload: Payload) {
    await this.safely(async () => {
      await this.prisma.notification.create({
        data: {
          userId,
          title: payload.title,
          body: payload.body,
          kind: inferKind(payload.data),
          data: (payload.data ?? {}) as Prisma.InputJsonValue,
        },
      });
      const tokens = await this.prisma.deviceToken.findMany({ where: { userId }, select: { token: true } });
      await this.sendAndPrune(tokens.map((t) => t.token), payload);
    });
  }

  /** Every admin device currently registered — there's no per-admin targeting need yet. */
  async notifyAdmins(payload: Payload) {
    await this.safely(async () => {
      const tokens = await this.prisma.deviceToken.findMany({ where: { adminUserId: { not: null } }, select: { token: true } });
      await this.sendAndPrune(tokens.map((t) => t.token), payload);
    });
  }

  // Notifications are best-effort side effects of real actions (a booking placed, a status
  // changed) — a DB hiccup or Firebase/network failure here must never fail the action that
  // triggered it (and, just as importantly, must never stop a LATER notify call in the same
  // request — e.g. checkout() notifies admins then the booking patient; a failure in the first
  // call must not skip the second), so every failure at any point is swallowed and logged rather
  // than propagated to the caller.
  private async safely(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Notification failed: ${(err as Error).message}`);
    }
  }

  private async sendAndPrune(tokens: string[], payload: Payload) {
    if (tokens.length === 0) return;
    const dead = await this.firebase.sendToTokens(tokens, payload);
    if (dead.length > 0) {
      await this.prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
    }
  }
}
