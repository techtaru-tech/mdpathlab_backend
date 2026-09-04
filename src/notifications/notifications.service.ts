import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseService } from './firebase.service.js';

type Payload = { title: string; body: string; data?: Record<string, string> };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  /** Patient or phlebotomist — both are `User` rows, keyed the same way. */
  async notifyUser(userId: string, payload: Payload) {
    await this.safely(async () => {
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
