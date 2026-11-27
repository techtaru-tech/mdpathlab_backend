import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service.js';
import { isPastIstSlot } from '../common/ist-time.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REFERRAL_POLICY_VERSION } from '../referrals/referral-policy.js';
import type { UpsertAddressDto } from '../patients/dto/upsert-address.dto.js';
import type { PartnerCreateBookingDto, PartnerQuoteDto } from './dto/partner-booking.dto.js';

/** The patient's consent, as a token: which partner, which patient, for how long. */
type PatientTokenPayload = { type: 'partner-patient'; sub: string; userId: string; phone: string };
const PATIENT_TOKEN_SECONDS = 30 * 60;

const masked = (phone: string) => `••••••${phone.slice(-4)}`;
const PARTNER_TYPE_LABEL: Record<string, string> = { DOCTOR: 'doctor', CLINIC: 'clinic / centre' };

/**
 * An approved partner (doctor, clinic, collection centre) books tests for a patient — e.g. the patient is in the
 * clinic and the doctor books for them. The patient's own mobile number must be verified first with an OTP sent to
 * it (the patient reads it out), which proves the patient agreed; the booking then goes through the same pricing,
 * lab routing and slot checks as the patient's own checkout, is paid at collection, and earns the booking partner
 * commission (OrderReferralAttribution.bookedByPartner) whatever referral link the patient otherwise has.
 */
@Injectable()
export class PartnerBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly orders: OrdersService,
    private readonly jwt: JwtService,
  ) {}

  private async requireApproved(partnerId: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, status: true, type: true, displayName: true } });
    if (!partner) throw new NotFoundException('Account not found');
    if (partner.status !== 'APPROVED') throw new ForbiddenException('Only an approved account can book tests for patients');
    return partner;
  }

  /** Step 1: an OTP to the patient's mobile (the same message the patient gets to log in). */
  async sendPatientOtp(partnerId: string, phone: string) {
    await this.requireApproved(partnerId);
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { status: true, role: true } });
    if (user && user.status !== 'ACTIVE') throw new ForbiddenException('This patient account is not active — please contact MD Path Lab');
    if (user && user.role !== 'PATIENT') throw new BadRequestException('This number cannot be used for a patient booking');
    const sent = await this.auth.requestOtp(phone);
    return { ...sent, message: `OTP sent to ${masked(phone)}. Ask the patient to read it out.` };
  }

  /** Step 2: the patient's OTP → their account (opened if new) and a 30-minute token to book for them. */
  async verifyPatient(partnerId: string, phone: string, otp: string, name?: string) {
    const partner = await this.requireApproved(partnerId);
    await this.auth.verifyPhoneOtp(phone, otp);
    let { user, created } = await this.auth.findOrCreatePatient(phone);
    if (user.role !== 'PATIENT') throw new BadRequestException('This number cannot be used for a patient booking');
    if (name && !user.name) user = await this.prisma.user.update({ where: { id: user.id }, data: { name } });
    await this.prisma.referralPartnerEvent.create({
      data: {
        partnerId: partner.id,
        event: 'PATIENT_OTP_VERIFIED',
        reason: `Patient ${masked(phone)} verified by OTP to book${created ? ' (new account)' : ''}`,
        actorType: 'PARTNER',
        actorId: partner.id,
      },
    });
    const payload: PatientTokenPayload = { type: 'partner-patient', sub: partner.id, userId: user.id, phone };
    const patientToken = await this.jwt.signAsync(payload, { expiresIn: PATIENT_TOKEN_SECONDS });
    return {
      patientToken,
      expiresInSeconds: PATIENT_TOKEN_SECONDS,
      patient: { name: user.name, phone, newAccount: created },
      addresses: await this.addresses(user.id),
    };
  }

  private async patientFrom(partnerId: string, token: string): Promise<{ userId: string; phone: string }> {
    let payload: PatientTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<PatientTokenPayload>(token);
    } catch {
      throw new ForbiddenException("The patient's verification has expired — send a new OTP");
    }
    if (payload.type !== 'partner-patient' || payload.sub !== partnerId) throw new ForbiddenException("Verify the patient's mobile number again");
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId }, select: { status: true, deletedAt: true } });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) throw new ForbiddenException('This patient account is not active');
    return { userId: payload.userId, phone: payload.phone };
  }

  private addresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, label: true, houseNo: true, line1: true, line2: true, landmark: true, city: true, state: true, pincode: true, phone: true, isDefault: true },
    });
  }

  /** A new address on the patient's account (they see it in their own app too). */
  async addAddress(partnerId: string, token: string, dto: UpsertAddressDto) {
    await this.requireApproved(partnerId);
    const { userId } = await this.patientFrom(partnerId, token);
    if (dto.isDefault) await this.prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    const created = await this.prisma.address.create({ data: { ...dto, phone: dto.phone ?? dto.receiverPhone, userId } });
    return { address: created, addresses: await this.addresses(userId) };
  }

  private price(userId: string, dto: PartnerQuoteDto) {
    return this.orders.priceOrder(userId, dto.items, dto.collectionType, dto.addressId, dto.collectionCenterId, undefined, false, undefined, undefined, {
      printedReport: dto.printedReport,
    });
  }

  async quote(partnerId: string, dto: PartnerQuoteDto) {
    await this.requireApproved(partnerId);
    const { userId } = await this.patientFrom(partnerId, dto.patientToken);
    const p = await this.price(userId, dto);
    const lab = p.labId ? await this.prisma.lab.findUnique({ where: { id: p.labId }, select: { name: true } }) : null;
    return {
      items: p.resolvedItems.map(({ cartItem, catalogueItem }) => ({ itemType: cartItem.itemType, itemId: cartItem.itemId, name: catalogueItem.name, mrp: catalogueItem.mrp, price: catalogueItem.price })),
      subtotal: p.subtotal,
      discount: p.discount,
      collectionFee: p.collectionFee,
      collectionDistanceKm: p.collectionDistanceKm,
      printedReport: p.printedReport,
      printedReportTerms: p.printedReportTerms,
      withinRange: p.withinRange,
      total: p.total,
      labName: lab?.name ?? null,
    };
  }

  async create(partnerId: string, dto: PartnerCreateBookingDto) {
    const partner = await this.requireApproved(partnerId);
    const { userId } = await this.patientFrom(partnerId, dto.patientToken);
    const slot = await this.prisma.slot.findUnique({ where: { id: dto.slotId } });
    if (!slot || !slot.isActive) throw new BadRequestException('Selected slot is not available');
    if (isPastIstSlot(dto.scheduledDate, slot.startTime)) throw new BadRequestException('This slot has already passed — choose an upcoming date or time');
    const p = await this.price(userId, dto);
    if (p.printedReport && dto.printedReportTermsAccepted !== true) {
      throw new BadRequestException('The patient must agree to pay the courier / postage charges for printed reports, or choose Go Green');
    }
    const who = `${partner.displayName ?? 'Partner'} (${PARTNER_TYPE_LABEL[partner.type] ?? 'partner'})`;
    const note = [`Booked by ${who} with the patient's OTP — pay on collection`, dto.note?.trim()].filter(Boolean).join(' — ');

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await this.orders.createOrderInTx(tx, userId, {
        collectionType: dto.collectionType,
        addressId: dto.collectionType === 'HOME' || p.labId ? dto.addressId : undefined,
        collectionCenterId: dto.collectionType === 'CENTER' ? dto.collectionCenterId : undefined,
        slotId: dto.slotId,
        scheduledDate: dto.scheduledDate,
        labId: p.labId,
        couponId: null,
        subtotal: p.subtotal,
        discount: p.discount,
        collectionFee: p.collectionFee,
        collectionDistanceKm: p.collectionDistanceKm,
        printedReport: p.printedReport,
        printedReportTermsAcceptedAt: p.printedReport ? new Date().toISOString() : null,
        printingCharge: p.printingCharge,
        walletUsed: 0,
        total: p.total,
        lines: p.resolvedItems.map(({ cartItem, catalogueItem }) => ({
          itemType: cartItem.itemType,
          itemId: cartItem.itemId,
          familyMemberId: null,
          itemName: catalogueItem.name,
          mrp: catalogueItem.mrp,
          price: catalogueItem.price,
        })),
        paymentMethod: 'COD',
        requireCart: false,
        keepCart: true,
        note,
        changedBy: `partner:${partner.displayName ?? partner.id}`,
      });
      // This booking is the booking partner's (commission included), whoever the patient is otherwise linked to.
      // Written with the order, so the referral snapshot job never attributes it to anyone else.
      await tx.orderReferralAttribution.create({
        data: {
          orderId: created.id,
          userId,
          partnerId: partner.id,
          patientReferralId: null,
          bookedByPartner: true,
          referralStatusAtBooking: 'ACTIVE',
          partnerStatusAtBooking: 'APPROVED',
          policyVersion: REFERRAL_POLICY_VERSION,
          orderCreatedAt: created.createdAt,
          recordedBy: 'PARTNER_BOOKING',
        },
      });
      return created;
    });
    // The usual confirmation to the patient (app, SMS, email) and the admin alert.
    await this.orders.announceNewOrder(order.id, 'COD');
    return { id: order.id, orderNumber: order.orderNumber, total: order.total, scheduledDate: order.scheduledDate };
  }

  /** Bookings this partner made — status only; reports stay with the patient. */
  async list(partnerId: string) {
    const rows = await this.prisma.orderReferralAttribution.findMany({
      where: { partnerId, bookedByPartner: true },
      orderBy: { orderCreatedAt: 'desc' },
      take: 100,
      select: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            total: true,
            scheduledDate: true,
            collectionType: true,
            createdAt: true,
            slot: { select: { label: true } },
            items: { select: { itemName: true } },
            user: { select: { name: true, phone: true } },
          },
        },
      },
    });
    return rows.map(({ order: o }) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      scheduledDate: o.scheduledDate,
      slotLabel: o.slot?.label ?? null,
      collectionType: o.collectionType,
      createdAt: o.createdAt,
      tests: o.items.map((i) => i.itemName),
      patient: { name: o.user.name, phone: masked(o.user.phone) },
    }));
  }
}
