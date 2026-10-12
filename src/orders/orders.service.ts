import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { SlotsService } from '../slots/slots.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { LabsService } from '../labs/labs.service.js';
import { MailService } from '../mail/mail.service.js';
import { cancelOrderOnce } from './cancel-order.js';
import { SmsService } from '../sms/sms.service.js';
import { isPastIstSlot } from '../common/ist-time.js';
import { haversineKm } from '../common/distance.js';
import { resolveOrderParameterIds } from '../common/resolve-order-parameters.js';
import { CheckoutDto, CheckoutItemDto, CheckoutRequestDto } from './dto/checkout.dto.js';
import { QuoteDto } from './dto/quote.dto.js';

function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MDP-${stamp}-${rand}`;
}

/** One priced line of a booking — what is shown, charged and stored on the order. */
export type CheckoutLine = {
  itemType: CheckoutItemDto['itemType'];
  itemId: string;
  familyMemberId: string | null;
  itemName: string;
  mrp: number;
  price: number;
};

/** Everything createOrderInTx() needs; amounts in rupees, as everywhere on Order. */
export type BookingToCreate = {
  collectionType: 'HOME' | 'CENTER';
  addressId?: string | undefined;
  collectionCenterId?: string | undefined;
  slotId: string;
  scheduledDate: string;
  prescriptionId?: string | undefined;
  labId: string | null;
  couponId: string | null;
  subtotal: number;
  discount: number;
  collectionFee: number;
  walletUsed: number;
  total: number;
  lines: CheckoutLine[];
  paymentMethod: 'ONLINE' | 'COD';
  razorpay?: { orderId: string; paymentId: string; signature: string | null };
  requireCart: boolean;
  excludeSessionId?: string;
  note: string;
};

export function bookingFields(
  dto: CheckoutRequestDto,
  priced: { labId: string | null; couponId: string | null; subtotal: number; discount: number; collectionFee: number; walletUsed: number; total: number },
  lines: CheckoutLine[],
) {
  return {
    collectionType: dto.collectionType,
    addressId: dto.addressId,
    collectionCenterId: dto.collectionCenterId,
    slotId: dto.slotId,
    scheduledDate: dto.scheduledDate,
    prescriptionId: dto.prescriptionId,
    labId: priced.labId,
    couponId: priced.couponId,
    subtotal: priced.subtotal,
    discount: priced.discount,
    collectionFee: priced.collectionFee,
    walletUsed: priced.walletUsed,
    total: priced.total,
    lines,
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly coupons: CouponsService,
    private readonly config: ConfigService,
    private readonly slots: SlotsService,
    private readonly settingsService: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly wallet: WalletService,
    private readonly labs: LabsService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Distance is measured to the nearest ACTIVE collection centre that actually has coordinates
   * — the real, admin-editable CollectionCenter table, not a static env var. `calculable: false`
   * tells the caller the fee genuinely can't be determined yet (missing patient coordinates, or
   * no centre has coordinates configured) rather than silently defaulting to free.
   */
  private async computeHomeCollectionFee(address: { lat: number | null; lng: number | null } | null) {
    if (!address?.lat || !address?.lng) {
      return { fee: 0, calculable: false, distanceKm: null as number | null, withinRange: true, nearestCentreName: null as string | null };
    }

    const centres = await this.prisma.collectionCenter.findMany({
      where: { status: 'ACTIVE', lat: { not: null }, lng: { not: null } },
    });
    if (centres.length === 0) {
      return { fee: 0, calculable: false, distanceKm: null as number | null, withinRange: true, nearestCentreName: null as string | null };
    }

    let nearest = centres[0]!;
    let minKm = haversineKm(address.lat, address.lng, nearest.lat!, nearest.lng!);
    for (const centre of centres.slice(1)) {
      const km = haversineKm(address.lat, address.lng, centre.lat!, centre.lng!);
      if (km < minKm) {
        minKm = km;
        nearest = centre;
      }
    }

    const freeKm = Number(this.config.get('HOME_COLLECTION_FREE_KM', 5));
    const tier2Km = Number(this.config.get('HOME_COLLECTION_TIER2_KM', 10));
    const tier2Fee = Number(this.config.get('HOME_COLLECTION_TIER2_FEE', 100));
    const tier3Km = Number(this.config.get('HOME_COLLECTION_TIER3_KM', 20));
    const tier3Fee = Number(this.config.get('HOME_COLLECTION_TIER3_FEE', 200));

    const fee = minKm <= freeKm ? 0 : minKm <= tier2Km ? tier2Fee : tier3Fee;
    // Beyond the top tier there's no client-specified fee to charge — we still use the existing
    // tier-3 amount as a ceiling rather than inventing a new number, but flag it so the UI can be
    // honest that this address is outside the normal serviceable range instead of implying ₹200
    // is a confirmed price for any distance.
    const withinRange = minKm <= tier3Km;
    return { fee, calculable: true, distanceKm: Math.round(minKm * 10) / 10, withinRange, nearestCentreName: nearest.name };
  }

  /**
   * Shared by checkout() and quote() so the price shown on the summary screen and the price
   * actually charged can never drift apart into two competing calculations.
   */
  private async priceOrder(
    userId: string,
    rawItems: { itemType: CheckoutItemDto['itemType']; itemId: string; familyMemberId?: string | null }[],
    collectionType: 'HOME' | 'CENTER',
    addressId: string | undefined,
    collectionCenterId: string | undefined,
    couponCode: string | undefined,
    useWallet: boolean | undefined,
    cityId: string | undefined,
    prescriptionId: string | undefined,
  ) {
    if (rawItems.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }
    // Accept an item's slug as well as its id (see CatalogueService.toItemId) — from here on only ids are used.
    const items = await Promise.all(rawItems.map(async (i) => ({ ...i, itemId: await this.catalogue.toItemId(i.itemType, i.itemId) })));

    // Radiology (X-Ray/CT/MRI/etc.) can only ever be fulfilled by the customer visiting a
    // partner Lab in person — never home-collected, and never mixed into the same order as a
    // regular test/package/parameter, since those two item groups have entirely different
    // fulfillment paths (phlebotomist home visit vs. a walk-in imaging appointment).
    const hasRadiology = items.some((i) => i.itemType === 'RADIOLOGY');
    const isRadiologyOnly = hasRadiology && items.every((i) => i.itemType === 'RADIOLOGY');
    if (hasRadiology && !isRadiologyOnly) {
      throw new BadRequestException('Radiology tests must be booked separately from other tests and packages');
    }
    if (isRadiologyOnly && collectionType !== 'CENTER') {
      throw new BadRequestException('Radiology tests are booked as a centre visit, not home collection');
    }

    let continuedPrescription: { id: string; labId: string | null } | null = null;
    if (prescriptionId) {
      const prescription = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
      if (!prescription || prescription.userId !== userId) throw new BadRequestException('Prescription not found');
      if (!prescription.labId) throw new BadRequestException('This prescription has no lab assigned yet');
      continuedPrescription = prescription;
    }

    // A radiology visit still routes by the customer's address pincode (same as HOME collection
    // below) to find a partner Lab that actually offers it — it just doesn't collect anything
    // there, so it asks for an address instead of an admin-managed CollectionCenter.
    let address: { lat: number | null; lng: number | null; pincode: string; city: string } | null = null;
    if (collectionType === 'HOME' || isRadiologyOnly) {
      if (!addressId) {
        throw new BadRequestException(isRadiologyOnly ? 'addressId is required to match a nearby lab' : 'addressId is required for home collection');
      }
      const found = await this.prisma.address.findUnique({ where: { id: addressId } });
      if (!found || found.userId !== userId) throw new BadRequestException('Address not found');
      address = found;
    } else if (!collectionCenterId) {
      throw new BadRequestException('collectionCenterId is required for a center visit');
    }

    // Every test/package in a booking must be for the patient or one of THEIR family members.
    const memberIds = [...new Set(items.map((i) => i.familyMemberId).filter((id): id is string => Boolean(id)))];
    if (memberIds.length > 0) {
      const owned = await this.prisma.familyMember.count({ where: { id: { in: memberIds }, userId } });
      if (owned !== memberIds.length) throw new BadRequestException('Family member not found');
    }

    // The price list used is decided HERE from where the sample is collected (the address's city, or the
    // collection centre's city) — never from a cityId the client sends, which could name any city with a
    // cheaper override. The cityId parameter is kept only so callers/DTOs stay compatible.
    void cityId;
    let priceCityId: string | undefined;
    if (address?.city) {
      priceCityId = (await this.prisma.city.findFirst({ where: { name: { equals: address.city, mode: 'insensitive' } }, select: { id: true } }))?.id;
    } else if (collectionCenterId) {
      priceCityId = (await this.prisma.collectionCenter.findUnique({ where: { id: collectionCenterId }, select: { cityId: true } }))?.cityId ?? undefined;
    }

    const resolvedItems = await Promise.all(
      items.map(async (item) => ({
        cartItem: item,
        catalogueItem: await this.catalogue.resolveItem(item.itemType, item.itemId, priceCityId),
      })),
    );
    const subtotal = resolvedItems.reduce((sum, i) => sum + i.catalogueItem.price, 0);

    // Multi-lab routing (HOME collection, and radiology's CENTER-but-address-routed visit —
    // a regular CENTER visit already has its own admin-managed CollectionCenter, so it never
    // needs a partner-lab match). No lab covering this address's pincode + every item in the
    // cart -> block checkout rather than silently falling back to the central operation
    // (deliberate product choice, see PincodeNotifyRequest for the "let me know when you're
    // available here" capture on the frontend).
    let labId: string | null = null;
    let matchedLabName: string | null = null;
    if (continuedPrescription) {
      labId = continuedPrescription.labId;
      matchedLabName = (await this.prisma.lab.findUnique({ where: { id: labId! }, select: { name: true } }))?.name ?? null;
    } else if ((collectionType === 'HOME' || isRadiologyOnly) && address) {
      const matchedLab = await this.labs.findMatchingLab(
        address.pincode,
        items.map((i) => ({ itemType: i.itemType, itemId: i.itemId })),
      );
      if (!matchedLab) {
        throw new BadRequestException('We are not yet available at this address — please try a different address or ask to be notified.');
      }
      labId = matchedLab.id;
      matchedLabName = matchedLab.name;
    }

    let discount = 0;
    let couponId: string | null = null;
    if (couponCode) {
      const coupon = await this.coupons.validate(couponCode, userId, subtotal);
      discount = this.coupons.computeDiscount(coupon, subtotal);
      couponId = coupon.id;
    }

    // Once a partner lab has matched this address's pincode, the old "nearest CollectionCenter
    // in the whole system" distance search is meaningless (and actively misleading — e.g.
    // showing a 450km distance to an unrelated central lab) since the whole point of pincode
    // coverage is that this lab IS local to the address. Free for now — a lab-specific fee model
    // (e.g. a flat rate per lab) is a real gap, but not one this feature is scoped to invent.
    const feeResult = labId
      ? { fee: 0, calculable: true, distanceKm: null, withinRange: true, nearestCentreName: matchedLabName }
      : collectionType === 'HOME'
        ? await this.computeHomeCollectionFee(address)
        : { fee: 0, calculable: true, distanceKm: null, withinRange: true, nearestCentreName: null };
    const preWalletTotal = subtotal - discount + feeResult.fee;

    let walletBalance = 0;
    let walletUsed = 0;
    if (useWallet) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
      // Money reserved by a checkout that is still being paid for is not available a second time.
      walletBalance = Math.max(0, (user?.walletBalance ?? 0) - (await this.heldWalletRupees(userId)));
      walletUsed = Math.min(walletBalance, preWalletTotal);
    }
    const total = preWalletTotal - walletUsed;

    return {
      resolvedItems,
      subtotal,
      discount,
      couponId,
      collectionFee: feeResult.fee,
      feeCalculable: feeResult.calculable,
      distanceKm: feeResult.distanceKm,
      withinRange: feeResult.withinRange,
      nearestCentreName: feeResult.nearestCentreName,
      walletBalance,
      walletUsed,
      total,
      labId,
    };
  }

  async quote(userId: string, dto: QuoteDto) {
    const { subtotal, discount, collectionFee, feeCalculable, distanceKm, withinRange, nearestCentreName, walletBalance, walletUsed, total } =
      await this.priceOrder(
        userId,
        dto.items,
        dto.collectionType,
        dto.addressId,
        dto.collectionCenterId,
        dto.couponCode,
        dto.useWallet,
        dto.cityId,
        dto.prescriptionId,
      );
    return { subtotal, discount, collectionFee, feeCalculable, distanceKm, withinRange, nearestCentreName, walletBalance, walletUsed, total };
  }

  /**
   * Turns a home-visit request into an ordinary Order once the phlebotomist, already at the
   * door, has decided which tests to run. Reuses priceOrder() so the price, lab routing and
   * collection-fee rules are exactly what checkout() would apply — but skips the slot, coupon,
   * wallet and cart steps (there is no slot to pick: the visit is happening now). Payment is Cash
   * on Collection, taken by the phlebotomist through the existing payment-collection endpoint.
   * The order starts with reachedAt + a doorstep code already set, since arrival came first.
   */
  async createFromHomeVisit(opts: {
    userId: string;
    items: { itemType: CheckoutItemDto['itemType']; itemId: string }[];
    addressId: string;
    scheduledDate: Date;
    phlebotomistId: string;
    cityId?: string;
  }) {
    const { resolvedItems, subtotal, collectionFee, total, labId } = await this.priceOrder(
      opts.userId,
      opts.items.map((i) => ({ ...i, familyMemberId: null })),
      'HOME',
      opts.addressId,
      undefined,
      undefined,
      false,
      opts.cityId,
      undefined,
    );

    const code = String(randomInt(1000, 10000));
    const order = await this.prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: opts.userId,
        status: 'PHLEBOTOMIST_ASSIGNED',
        paymentStatus: 'PENDING',
        paymentMethod: 'COD',
        collectionType: 'HOME',
        addressId: opts.addressId,
        labId,
        scheduledDate: opts.scheduledDate,
        phlebotomistId: opts.phlebotomistId,
        assignmentStatus: 'ACCEPTED',
        reachedAt: new Date(),
        collectionOtp: code,
        subtotal,
        discount: 0,
        collectionFee,
        walletAmountUsed: 0,
        total,
        items: {
          create: resolvedItems.map(({ cartItem, catalogueItem }) => ({
            itemType: cartItem.itemType,
            itemId: cartItem.itemId,
            itemName: catalogueItem.name,
            mrp: catalogueItem.mrp,
            price: catalogueItem.price,
            familyMemberId: null,
          })),
        },
        statusLogs: {
          create: {
            status: 'PHLEBOTOMIST_ASSIGNED',
            note: 'Tests added during home visit — pay on collection',
            changedBy: 'SYSTEM',
          },
        },
      },
      include: { items: true },
    });

    void this.sms.orderSms(order.id, 'sampleOtp', { code });
    await this.notifications.notifyUser(opts.userId, {
      title: 'Tests added to your home visit',
      body: `Order ${order.orderNumber} — total ₹${order.total}, pay on collection. Share this code with your phlebotomist: ${code}`,
      data: { type: 'ORDER_STATUS', orderId: order.id, status: order.status },
    });
    await this.notifications.notifyAdmins({
      title: 'Home visit converted to booking',
      body: `Order ${order.orderNumber} created from a home visit request`,
      data: { type: 'ORDER_CREATED', orderId: order.id },
    });

    return order;
  }

  /** Wallet money reserved by this patient's online checkouts that are still being paid for (rupees). */
  async heldWalletRupees(userId: string, excludeSessionId?: string) {
    const held = await this.prisma.checkoutSession.aggregate({
      where: { userId, status: 'PENDING', expiresAt: { gt: new Date() }, ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}) },
      _sum: { walletHold: true },
    });
    return Math.ceil((held._sum.walletHold ?? 0) / 100);
  }

  /**
   * Validates and prices a booking request — the single path for pay at collection, wallet-paid and the pay-first
   * online checkout. Nothing is held or created here.
   */
  async prepareCheckout(userId: string, dto: CheckoutRequestDto, paymentMethod: 'ONLINE' | 'COD') {
    const settings = await this.settingsService.getOrCreate();
    if (paymentMethod === 'ONLINE' && !settings.onlinePaymentEnabled) {
      throw new BadRequestException('Online payment is currently unavailable — please choose Pay at collection');
    }
    if (paymentMethod === 'COD' && !settings.codEnabled) {
      throw new BadRequestException('Pay at collection is currently unavailable — please pay online');
    }

    const fromCart = !dto.items?.length;
    const items = !fromCart
      ? dto.items!.map((i) => ({ itemType: i.itemType, itemId: i.itemId, familyMemberId: i.familyMemberId ?? null }))
      : (await this.prisma.cartItem.findMany({ where: { userId } })).map((i) => ({
          itemType: i.itemType as CheckoutItemDto['itemType'],
          itemId: i.itemId,
          familyMemberId: i.familyMemberId ?? null,
        }));

    const slot = await this.prisma.slot.findUnique({ where: { id: dto.slotId } });
    if (!slot || !slot.isActive) throw new BadRequestException('Selected slot is not available');
    if (isPastIstSlot(dto.scheduledDate, slot.startTime)) {
      throw new BadRequestException('This slot has already passed — please choose an upcoming date or time');
    }

    const priced = await this.priceOrder(
      userId,
      items,
      dto.collectionType,
      dto.addressId,
      dto.collectionCenterId,
      dto.couponCode,
      dto.useWallet,
      dto.cityId,
      dto.prescriptionId,
    );
    const lines: CheckoutLine[] = priced.resolvedItems.map(({ cartItem, catalogueItem }) => ({
      itemType: cartItem.itemType,
      itemId: cartItem.itemId,
      familyMemberId: cartItem.familyMemberId ?? null,
      itemName: catalogueItem.name,
      mrp: catalogueItem.mrp,
      price: catalogueItem.price,
    }));
    return { fromCart, lines, priced };
  }

  /**
   * Creates the order inside the caller's transaction: slot capacity, coupon limits, wallet debit, cart and
   * prescription — all or nothing. Used by checkout() (pay at collection / nothing to pay) and by
   * CheckoutSessionsService once an online payment has been verified.
   */
  async createOrderInTx(tx: Prisma.TransactionClient, userId: string, b: BookingToCreate) {
    // One checkout at a time per patient: a double-tapped button or a parallel request waits here, then sees the
    // cart already emptied / the coupon already used instead of creating a second order or a second discount.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'checkout:' + userId}, 0))`;
    if (b.requireCart && (await tx.cartItem.count({ where: { userId } })) === 0) {
      throw new ConflictException('This cart was already checked out');
    }
    if (b.couponId) {
      const c = await tx.coupon.findUnique({ where: { id: b.couponId } });
      if (c?.perUserLimit !== null && c?.perUserLimit !== undefined) {
        const usedByUser = await tx.order.count({ where: { couponId: b.couponId, userId, status: { not: 'CANCELLED' } } });
        if (usedByUser >= c.perUserLimit) throw new ConflictException('You have already used this coupon');
      }
    }

    // Atomic — see SlotsService.reserveCapacityOrThrow. A paid checkout's own hold is left out of the count.
    await this.slots.reserveCapacityOrThrow(tx, b.slotId, b.scheduledDate, b.collectionType, b.collectionCenterId, b.excludeSessionId);

    if (b.couponId) {
      const coupon = await tx.coupon.findUnique({ where: { id: b.couponId } });
      if (coupon?.usageLimit !== null && coupon?.usageLimit !== undefined) {
        const updated = await tx.coupon.updateMany({
          where: { id: b.couponId, usedCount: { lt: coupon.usageLimit } },
          data: { usedCount: { increment: 1 } },
        });
        if (updated.count === 0) throw new ConflictException('This coupon just reached its usage limit');
      } else {
        await tx.coupon.update({ where: { id: b.couponId }, data: { usedCount: { increment: 1 } } });
      }
    }

    // Online money is verified before this runs; nothing to pay (wallet / 100% coupon) is paid too.
    const paid = b.paymentMethod === 'ONLINE' || b.total === 0;
    const created = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId,
        status: 'CONFIRMED',
        paymentStatus: paid ? 'PAID' : 'PENDING',
        paymentMethod: b.paymentMethod,
        collectionType: b.collectionType,
        addressId: b.addressId,
        collectionCenterId: b.collectionCenterId,
        labId: b.labId,
        slotId: b.slotId,
        scheduledDate: new Date(b.scheduledDate),
        subtotal: b.subtotal,
        discount: b.discount,
        collectionFee: b.collectionFee,
        walletAmountUsed: b.walletUsed,
        total: b.total,
        couponId: b.couponId,
        ...(b.razorpay
          ? { razorpayOrderId: b.razorpay.orderId, razorpayPaymentId: b.razorpay.paymentId, razorpaySignature: b.razorpay.signature }
          : {}),
        items: {
          create: b.lines.map((l) => ({
            itemType: l.itemType,
            itemId: l.itemId,
            itemName: l.itemName,
            mrp: l.mrp,
            price: l.price,
            familyMemberId: l.familyMemberId,
          })),
        },
        statusLogs: { create: { status: 'CONFIRMED', note: b.note, changedBy: 'SYSTEM' } },
      },
      include: { items: true, statusLogs: true, slot: true, address: true },
    });

    if (b.walletUsed > 0) {
      await this.wallet.debit(tx, userId, b.walletUsed, `Used on order ${created.orderNumber}`, created.id);
    }
    await tx.cartItem.deleteMany({ where: { userId } });
    if (b.prescriptionId) {
      await tx.prescription.update({ where: { id: b.prescriptionId }, data: { orderId: created.id, labStage: 'BOOKING_CONFIRMED' } });
    }
    return created;
  }

  /** Everything that follows a new booking, after the transaction has committed. Never throws. */
  async announceNewOrder(orderId: string, how: 'COD' | 'WALLET' | 'ONLINE') {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    const where = order.collectionType === 'HOME' ? 'home collection' : 'centre visit';
    await this.notifications.notifyAdmins({
      title: 'New booking placed',
      body: `Order ${order.orderNumber} — ${where}${how === 'ONLINE' ? ' — paid online' : ''}`,
      data: { type: 'ORDER_CREATED', orderId: order.id },
    });
    await this.notifications.notifyUser(
      order.userId,
      how === 'ONLINE'
        ? {
            title: 'Payment received — booking confirmed',
            body: `Order ${order.orderNumber} — ₹${order.total} paid online. Your ${where} is scheduled.`,
            data: { type: 'PAYMENT', orderId: order.id, status: 'PAID' },
          }
        : {
            title: 'Booking confirmed',
            body: `Order ${order.orderNumber} — ${where} scheduled`,
            data: { type: 'ORDER_STATUS', orderId: order.id, status: order.status },
          },
    );
    // Fire-and-forget: MailService/SmsService never throw, and must not delay the response.
    void this.mail.bookingConfirmedForOrder(order.id);
    void this.sms.bookingConfirmedForOrder(order.id);
    if (order.paymentStatus === 'PAID') void this.mail.paymentReceiptForOrder(order.id);
  }

  /**
   * Pay at collection, or an online booking with nothing left to pay (wallet / coupon cover it). An online booking
   * with something to pay is never created here without a verified payment — see CheckoutSessionsService.
   */
  async checkout(userId: string, dto: CheckoutDto) {
    const method = dto.paymentMethod === 'CASH' ? 'COD' : dto.paymentMethod;
    const { fromCart, lines, priced } = await this.prepareCheckout(userId, dto, method);
    if (method === 'ONLINE' && priced.total > 0) {
      throw new HttpException({ statusCode: 402, message: 'Please complete the payment to book.' }, 402);
    }

    const order = await this.prisma.$transaction((tx) =>
      this.createOrderInTx(tx, userId, {
        ...bookingFields(dto, priced, lines),
        paymentMethod: method === 'ONLINE' ? 'ONLINE' : 'COD',
        requireCart: fromCart,
        note:
          method === 'COD'
            ? 'Booking confirmed — pay on collection'
            : priced.walletUsed > 0
              ? 'Booking confirmed — paid fully from wallet'
              : 'Booking confirmed — nothing to pay',
      }),
    );
    await this.announceNewOrder(order.id, method === 'COD' ? 'COD' : 'WALLET');
    return order;
  }

  list(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      // Only APPROVED reports are patient-visible — an uploaded-but-unapproved report is still
      // pending admin review and shouldn't show up before it's actually released. statusLogs is
      // included so the frontend's notification feed can derive real events (assigned, sample
      // collected, etc.) without a second round-trip per order.
      include: {
        items: true,
        slot: true,
        address: true,
        collectionCenter: true,
        lab: { select: { id: true, name: true, address: true } },
        statusLogs: { orderBy: { createdAt: 'asc' } },
        reports: { where: { status: 'APPROVED' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { familyMember: { select: { name: true, relation: true } } } },
        statusLogs: { orderBy: { createdAt: 'asc' } },
        slot: true,
        address: true,
        collectionCenter: true,
        lab: { select: { id: true, name: true, address: true } },
        phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
        reports: { where: { status: 'APPROVED' } },
        coupon: { select: { code: true } },
        review: { select: { id: true, rating: true, comment: true, status: true } },
        addOns: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    return order;
  }

  async cancel(userId: string, id: string, reason?: string) {
    const order = await this.getOne(userId, id);
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Order is already cancelled');
    }

    const windowHours = Number(this.config.get('CANCELLATION_WINDOW_HOURS', 2));
    if (order.scheduledDate && order.slot) {
      const [h, m] = order.slot.startTime.split(':').map(Number);
      const cutoff = new Date(order.scheduledDate);
      cutoff.setHours(h, m, 0, 0);
      cutoff.setHours(cutoff.getHours() - windowHours);
      if (new Date() > cutoff) {
        throw new ForbiddenException(
          `Cancellation window has passed — orders can only be cancelled up to ${windowHours}h before the slot`,
        );
      }
    }

    const outcome = await cancelOrderOnce(this.prisma, this.wallet, {
      orderId: id,
      note: reason ? 'Cancelled by patient — ' + reason : 'Cancelled by patient',
      changedBy: userId,
    });
    // A second simultaneous cancel loses the race here and must not refund again.
    if (!outcome.changed) throw new BadRequestException('Order is already cancelled');
    // Fire-and-forget: MailService never throws, and email must never slow this response.
    void this.mail.orderCancelledForOrder(id, { reason, walletRefunded: outcome.walletRefunded });
    void this.sms.orderSms(id, 'bookingCancelled');
    if (outcome.phlebotomistId) {
      void this.sms.phlebotomistSms(outcome.phlebotomistId, 'cancelled', id);
      await this.notifications.notifyPhlebotomist(outcome.phlebotomistId, {
        title: 'Booking cancelled',
        body: `Order ${order.orderNumber} was cancelled by the customer — please do not visit.`,
        data: { type: 'ORDER_STATUS', orderId: id, status: 'CANCELLED' },
      });
    }
    await this.notifications.notifyUser(userId, {
      title: 'Booking cancelled',
      body: `Order ${order.orderNumber} has been cancelled${outcome.walletRefunded > 0 ? ` — ₹${outcome.walletRefunded} returned to your wallet` : ''}.`,
      data: { type: 'ORDER_STATUS', orderId: id, status: 'CANCELLED' },
    });
    return this.getOne(userId, id);
  }

  /**
   * Structured per-parameter results for the customer's own booking — the same LabResultValue
   * rows AdminResultsController already reads (entered by the lab), joined with each Parameter's
   * free-text referenceRange. Deliberately gated on the order having at least one APPROVED
   * report: raw lab-entered values are provisional until admin reviews and releases the actual
   * report, and this must never leak them earlier than the PDF itself is released (see Report's
   * PENDING → UPLOADED → APPROVED lifecycle).
   *
   * `flag` is best-effort only — referenceRange is free text (see the schema's own comment on
   * why: many real ranges aren't a plain numeric span, e.g. "Negative" or "Male: 13-17, Female:
   * 12-15"), so a High/Low flag is only ever attempted when both the range parses as a plain
   * "low - high" numeric span AND the entered value itself parses as a number; anything else
   * returns `flag: null` rather than a guess.
   */
  async getResults(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { reports: true } });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    if (!order.reports.some((r) => r.status === 'APPROVED')) {
      throw new BadRequestException('Results are not released yet — they appear once your report is approved');
    }

    const [parameterIds, values] = await Promise.all([
      resolveOrderParameterIds(this.prisma, orderId),
      this.prisma.labResultValue.findMany({ where: { orderId } }),
    ]);
    const parameters = await this.prisma.parameter.findMany({ where: { id: { in: Array.from(parameterIds) } } });
    const valueByParameter = new Map(values.map((v) => [v.parameterId, v]));

    return parameters.map((p) => {
      const entered = valueByParameter.get(p.id);
      return {
        parameter: p.name,
        value: entered?.value ?? null,
        unit: entered?.unit ?? null,
        range: p.referenceRange,
        flag: computeFlag(entered?.value, p.referenceRange),
      };
    });
  }

  /**
   * Live-ish phlebotomist position for the customer's tracking screen — "live-ish" because it's
   * the phlebotomist app's last self-reported ping (PhlebotomistOrdersController has no push
   * mechanism of its own), not a websocket stream. Only meaningful once `onTheWayAt` is set —
   * before that there's nowhere to point a map at, and after sample collection there's nothing
   * left to track.
   */
  async getTracking(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { phlebotomist: { include: { user: { select: { name: true, phone: true } } } } },
    });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    if (!order.onTheWayAt || !order.phlebotomist) {
      return { tracking: false as const, phlebotomist: null, lat: null, lng: null, updatedAt: null };
    }
    return {
      tracking: true as const,
      phlebotomist: { name: order.phlebotomist.user.name, phone: order.phlebotomist.user.phone },
      lat: order.phlebotomist.lastLat,
      lng: order.phlebotomist.lastLng,
      updatedAt: order.phlebotomist.lastLocationAt,
    };
  }
}

// See getResults()'s own comment on why this is deliberately conservative — a plain "low - high"
// numeric range and a numeric value are both required, or the flag is null rather than a guess.
function computeFlag(value: string | null | undefined, range: string | null): 'High' | 'Low' | null {
  if (!value || !range) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const match = range.match(/^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const [, lowRaw, highRaw] = match;
  const low = Number(lowRaw);
  const high = Number(highRaw);
  if (numericValue < low) return 'Low';
  if (numericValue > high) return 'High';
  return null;
}
