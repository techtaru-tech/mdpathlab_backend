import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { CheckoutDto, CheckoutItemDto } from './dto/checkout.dto.js';
import { QuoteDto } from './dto/quote.dto.js';

function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MDP-${stamp}-${rand}`;
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
    items: { itemType: CheckoutItemDto['itemType']; itemId: string; familyMemberId?: string | null }[],
    collectionType: 'HOME' | 'CENTER',
    addressId: string | undefined,
    collectionCenterId: string | undefined,
    couponCode: string | undefined,
    useWallet: boolean | undefined,
    cityId: string | undefined,
    prescriptionId: string | undefined,
  ) {
    if (items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

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
    let address: { lat: number | null; lng: number | null; pincode: string } | null = null;
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

    const resolvedItems = await Promise.all(
      items.map(async (item) => ({
        cartItem: item,
        catalogueItem: await this.catalogue.resolveItem(item.itemType, item.itemId, cityId),
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
      walletBalance = user?.walletBalance ?? 0;
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

    const code = String(Math.floor(1000 + Math.random() * 9000));
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

  async checkout(userId: string, dto: CheckoutDto) {
    const settings = await this.settingsService.getOrCreate();
    if (dto.paymentMethod === 'ONLINE' && !settings.onlinePaymentEnabled) {
      throw new BadRequestException('Online payment is currently unavailable — please choose Cash on Delivery');
    }
    if (dto.paymentMethod === 'COD' && !settings.codEnabled) {
      throw new BadRequestException('Cash on Delivery is currently unavailable — please pay online');
    }

    const items = dto.items?.length
      ? dto.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, familyMemberId: i.familyMemberId ?? null }))
      : await this.prisma.cartItem.findMany({ where: { userId } });

    const slot = await this.prisma.slot.findUnique({ where: { id: dto.slotId } });
    if (!slot || !slot.isActive) throw new BadRequestException('Selected slot is not available');
    if (isPastIstSlot(dto.scheduledDate, slot.startTime)) {
      throw new BadRequestException('This slot has already passed — please choose an upcoming date or time');
    }

    const { resolvedItems, subtotal, discount, couponId, collectionFee, walletUsed, total, labId } = await this.priceOrder(
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

    // Wallet fully covering the order leaves nothing for Razorpay/COD to collect — that's a
    // confirmed, paid booking regardless of which paymentMethod the client sent.
    const fullyPaidByWallet = total === 0 && walletUsed > 0;

    const order = await this.prisma.$transaction(async (tx) => {
      // Atomic — see SlotsService.reserveCapacityOrThrow: a no-op when the slot/date/scope is
      // unconfigured (unlimited), otherwise a transaction-scoped advisory lock plus a fresh
      // occupancy re-count, so this can never race with another concurrent checkout the way an
      // unprotected count()-then-create() would.
      await this.slots.reserveCapacityOrThrow(tx, dto.slotId, dto.scheduledDate, dto.collectionType, dto.collectionCenterId);

      if (couponId) {
        const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
        if (coupon?.usageLimit !== null && coupon?.usageLimit !== undefined) {
          const updated = await tx.coupon.updateMany({
            where: { id: couponId, usedCount: { lt: coupon.usageLimit } },
            data: { usedCount: { increment: 1 } },
          });
          if (updated.count === 0) throw new BadRequestException('This coupon just reached its usage limit');
        } else {
          await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          status: dto.paymentMethod === 'COD' || fullyPaidByWallet ? 'CONFIRMED' : 'PENDING_PAYMENT',
          paymentStatus: fullyPaidByWallet ? 'PAID' : 'PENDING',
          paymentMethod: dto.paymentMethod,
          collectionType: dto.collectionType,
          addressId: dto.addressId,
          collectionCenterId: dto.collectionCenterId,
          labId,
          slotId: dto.slotId,
          scheduledDate: new Date(dto.scheduledDate),
          subtotal,
          discount,
          collectionFee,
          walletAmountUsed: walletUsed,
          total,
          couponId,
          items: {
            create: resolvedItems.map(({ cartItem, catalogueItem }) => ({
              itemType: cartItem.itemType,
              itemId: cartItem.itemId,
              itemName: catalogueItem.name,
              mrp: catalogueItem.mrp,
              price: catalogueItem.price,
              familyMemberId: cartItem.familyMemberId,
            })),
          },
          statusLogs: {
            create: {
              status: dto.paymentMethod === 'COD' || fullyPaidByWallet ? 'CONFIRMED' : 'PENDING_PAYMENT',
              note: fullyPaidByWallet
                ? 'Booking confirmed — paid fully from wallet'
                : dto.paymentMethod === 'COD'
                  ? 'Booking confirmed — pay on collection'
                  : 'Awaiting payment',
              changedBy: 'SYSTEM',
            },
          },
        },
        include: { items: true, statusLogs: true, slot: true, address: true },
      });

      if (walletUsed > 0) {
        await this.wallet.debit(tx, userId, walletUsed, `Used on order ${created.orderNumber}`, created.id);
      }

      await tx.cartItem.deleteMany({ where: { userId } });

      if (dto.prescriptionId) {
        await tx.prescription.update({
          where: { id: dto.prescriptionId },
          data: { orderId: created.id, labStage: 'BOOKING_CONFIRMED' },
        });
      }

      return created;
    });

    await this.notifications.notifyAdmins({
      title: 'New booking placed',
      body: `Order ${order.orderNumber} — ${dto.collectionType === 'HOME' ? 'home collection' : 'centre visit'}`,
      data: { type: 'ORDER_CREATED', orderId: order.id },
    });
    await this.notifications.notifyUser(userId, {
      title: order.status === 'CONFIRMED' ? 'Booking confirmed' : 'Booking placed — complete your payment',
      body: `Order ${order.orderNumber} — ${dto.collectionType === 'HOME' ? 'home collection' : 'centre visit'} scheduled`,
      data: { type: 'ORDER_STATUS', orderId: order.id, status: order.status },
    });
    // Online-payment orders are confirmed later, once Razorpay confirms the payment (PaymentsService).
    // Fire-and-forget: MailService never throws, and retries/SMTP slowness must not delay this response.
    if (order.status === 'CONFIRMED') {
      void this.mail.bookingConfirmedForOrder(order.id);
      void this.sms.bookingConfirmedForOrder(order.id);
    }
    // Fully covered by the wallet = already paid, so the receipt goes out with the confirmation.
    if (order.paymentStatus === 'PAID') void this.mail.paymentReceiptForOrder(order.id);

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
