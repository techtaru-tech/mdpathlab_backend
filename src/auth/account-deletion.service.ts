import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// A booking or home visit in one of these states is still being worked on, so the account can't go yet.
const OPEN_ORDER_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'PHLEBOTOMIST_ASSIGNED', 'SAMPLE_COLLECTED', 'IN_LAB'] as const;
const OPEN_HOME_VISIT_STATUSES = ['REQUESTED', 'ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'TESTS_ADDED', 'COLLECTED'] as const;
const PRESCRIPTION_DIR = join(process.cwd(), 'uploads', 'prescriptions');
const REMOVED = 'Removed';

/**
 * A customer deleting their own account (website /delete-account and the app's "Delete account", as Play Store
 * requires). Everything that identifies the person is removed: name, email, date of birth, family members,
 * addresses, cart, notifications, push tokens, prescriptions not tied to a booking. The phone number is freed, so
 * the same number can sign up again as a brand-new account.
 *
 * Bookings, payments and lab reports stay — the lab and the accounts need those records — but with nothing left
 * that points to who the person was. Refused while a booking or home visit is still open, so a sample in the lab
 * never loses the patient it belongs to.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** What stands in the way of deleting this account right now (empty = it can be deleted). */
  async blockers(userId: string) {
    const [orders, homeVisits, checkouts] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId, status: { in: [...OPEN_ORDER_STATUSES] } },
        select: { orderNumber: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.homeCollectionRequest.count({ where: { userId, status: { in: [...OPEN_HOME_VISIT_STATUSES] } } }),
      this.prisma.checkoutSession.count({ where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } } }),
    ]);
    return { openBookings: orders, openHomeVisits: homeVisits, paymentInProgress: checkouts > 0 };
  }

  async check(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, walletBalance: true } });
    if (!user) throw new NotFoundException('Account not found');
    const b = await this.blockers(userId);
    return {
      canDelete: user.role === 'PATIENT' && b.openBookings.length === 0 && b.openHomeVisits === 0 && !b.paymentInProgress,
      reason: this.reason(user.role, b),
      walletBalance: user.walletBalance,
      ...b,
    };
  }

  private reason(role: string, b: Awaited<ReturnType<AccountDeletionService['blockers']>>): string | null {
    if (role !== 'PATIENT') return 'This account is used by MD Path Lab staff — please contact support to close it';
    if (b.openBookings.length) {
      const list = b.openBookings.map((o) => o.orderNumber).join(', ');
      return `You have a booking that is still in progress (${list}). Cancel it, or wait until its report is ready, then delete your account.`;
    }
    if (b.openHomeVisits) return 'You have a home visit that is still open. Cancel it, or wait until it is completed, then delete your account.';
    if (b.paymentInProgress) return 'A payment is in progress on your account. Please try again in a few minutes.';
    return null;
  }

  async deleteAccount(userId: string) {
    const status = await this.check(userId);
    if (!status.canDelete) throw new BadRequestException(status.reason ?? 'This account cannot be deleted right now');

    const now = new Date();
    const looseFiles: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction so a booking made a moment ago can't slip past.
      const open = await tx.order.count({ where: { userId, status: { in: [...OPEN_ORDER_STATUSES] } } });
      if (open > 0) throw new BadRequestException('You have a booking that is still in progress — please try again once it is done');

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true, walletBalance: true } });
      if (user.walletBalance > 0) {
        await tx.walletTransaction.create({
          data: { userId, type: 'DEBIT', amount: user.walletBalance, reason: 'Account deleted — wallet balance closed' },
        });
      }

      // Prescriptions that never became a booking are only the person's medical papers — remove them and their files.
      const loose = await tx.prescription.findMany({ where: { userId, orderId: null }, select: { id: true, fileUrl: true } });
      looseFiles.push(...loose.map((p) => p.fileUrl));
      await tx.prescription.deleteMany({ where: { id: { in: loose.map((p) => p.id) } } });
      await tx.prescription.updateMany({ where: { userId }, data: { note: null, patientReply: null } });

      await tx.cartItem.deleteMany({ where: { userId } });
      // Bookings keep their tests; the family member they were for just becomes blank (order_items.familyMemberId SET NULL).
      await tx.familyMember.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.otpChallenge.deleteMany({ where: { phone: user.phone } });

      // Addresses are kept only as city + pincode, so past bookings still show where they were.
      await tx.address.updateMany({
        where: { userId },
        data: {
          label: null, houseNo: null, line1: REMOVED, line2: null, landmark: null, state: null,
          lat: null, lng: null, phone: null, receiverName: null, receiverPhone: null, isDefault: false, deletedAt: now,
        },
      });
      await tx.homeCollectionRequest.updateMany({
        where: { userId },
        data: { patientName: REMOVED, phone: '', age: null, gender: null, concern: null, address: REMOVED, lat: null, lng: null },
      });
      await tx.checkoutSession.updateMany({ where: { userId }, data: { snapshot: {} } });
      await tx.emailLog.updateMany({ where: { userId }, data: { toEmail: REMOVED } });

      await tx.user.update({
        where: { id: userId },
        data: {
          // Unique and never a real mobile number, so the person's own number can open a new account later.
          phone: `deleted:${userId}`,
          name: null,
          email: null,
          dob: null,
          gender: null,
          city: null,
          emailNotifications: false,
          walletBalance: 0,
          status: 'INACTIVE',
          deletedAt: now,
        },
      });
    });

    for (const url of looseFiles) {
      if (url.startsWith('/uploads/prescriptions/')) await unlink(join(PRESCRIPTION_DIR, basename(url))).catch(() => undefined);
    }
    this.logger.log(`Account ${userId} deleted by its owner`);
    return { deleted: true };
  }
}
