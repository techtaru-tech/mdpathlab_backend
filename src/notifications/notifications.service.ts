import { Injectable, Logger } from '@nestjs/common';
import type { NotificationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseService } from './firebase.service.js';

type Payload = { title: string; body: string; data?: Record<string, string> };

/**
 * The push data as the apps read it. Home-visit events carry their id as `requestId`; the apps look for
 * `homeVisitId`, so both are sent. Values are always strings (FCM data must be).
 */
export function pushData(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) if (v !== null && v !== undefined) out[k] = String(v);
  if (out.type?.startsWith('HOME_VISIT') && out.requestId && !out.homeVisitId) out.homeVisitId = out.requestId;
  return out;
}

/**
 * One entry of an in-app notification list (customer app and phlebotomist app): the stored row plus the same
 * data its push carried — as `data` and, for convenience, `type`, `status` and every id at the top level.
 */
export function toFeedItem(row: { id: string; userId: string; title: string; body: string; kind: string; data: unknown; readAt: Date | null; createdAt: Date }) {
  const data = pushData(row.data as Record<string, unknown> | null);
  const { type, status, ...rest } = data;
  const ids = Object.fromEntries(Object.entries(rest).filter(([k]) => k.endsWith('Id')));
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    body: row.body,
    kind: row.kind,
    type: type ?? null,
    status: status ?? null,
    ...ids,
    data,
    read: row.readAt !== null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

// Best-effort categorization of the existing push `data.type`/`status` values into the customer
// app's notification-feed filter (see Prisma's NotificationKind) — never a new field callers have
// to remember to pass; every notifyUser() call site stays exactly as it was.
function inferKind(data: Record<string, string> | undefined): NotificationKind {
  const type = data?.type;
  if (type === 'ORDER_STATUS') return data?.status === 'REPORT_READY' ? 'REPORT' : 'BOOKING';
  if (type === 'ASSIGNMENT' || type === 'ORDER_CREATED' || type === 'ORDER_ADDON_REQUEST' || type === 'ORDER_ADDON_UPDATE' || type === 'PAYMENT') return 'BOOKING';
  if (type === 'WALLET') return 'WALLET';
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
  async notifyUser(userId: string, raw: Payload) {
    const payload = { ...raw, data: pushData(raw.data) };
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

  /** Same as notifyUser(), for a phlebotomist known by their phlebotomist id. Never throws. */
  async notifyPhlebotomist(phlebotomistId: string, payload: Payload) {
    await this.safely(async () => {
      const p = await this.prisma.phlebotomist.findUnique({ where: { id: phlebotomistId }, select: { userId: true } });
      if (p) await this.notifyUser(p.userId, payload);
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
