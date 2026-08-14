import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { SlotsService } from '../slots/slots.service.js';
import { isPastIstSlot } from '../common/ist-time.js';
import { CheckoutDto, CheckoutItemDto } from './dto/checkout.dto.js';
import { QuoteDto } from './dto/quote.dto.js';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  ) {
    if (items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    let address: { lat: number | null; lng: number | null } | null = null;
    if (collectionType === 'HOME') {
      if (!addressId) throw new BadRequestException('addressId is required for home collection');
      const found = await this.prisma.address.findUnique({ where: { id: addressId } });
      if (!found || found.userId !== userId) throw new BadRequestException('Address not found');
      address = found;
    } else if (!collectionCenterId) {
      throw new BadRequestException('collectionCenterId is required for a center visit');
    }

    const resolvedItems = await Promise.all(
      items.map(async (item) => ({
        cartItem: item,
        catalogueItem: await this.catalogue.resolveItem(item.itemType, item.itemId),
      })),
    );
    const subtotal = resolvedItems.reduce((sum, i) => sum + i.catalogueItem.price, 0);

    let discount = 0;
    let couponId: string | null = null;
    if (couponCode) {
      const coupon = await this.coupons.validate(couponCode, subtotal);
      discount = this.coupons.computeDiscount(coupon, subtotal);
      couponId = coupon.id;
    }

    const feeResult =
      collectionType === 'HOME'
        ? await this.computeHomeCollectionFee(address)
        : { fee: 0, calculable: true, distanceKm: null, withinRange: true, nearestCentreName: null };
    const total = subtotal - discount + feeResult.fee;

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
      total,
    };
  }

  async quote(userId: string, dto: QuoteDto) {
    const { subtotal, discount, collectionFee, feeCalculable, distanceKm, withinRange, nearestCentreName, total } =
      await this.priceOrder(userId, dto.items, dto.collectionType, dto.addressId, dto.collectionCenterId, dto.couponCode);
    return { subtotal, discount, collectionFee, feeCalculable, distanceKm, withinRange, nearestCentreName, total };
  }

  async checkout(userId: string, dto: CheckoutDto) {
    const items = dto.items?.length
      ? dto.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, familyMemberId: i.familyMemberId ?? null }))
      : await this.prisma.cartItem.findMany({ where: { userId } });

    const slot = await this.prisma.slot.findUnique({ where: { id: dto.slotId } });
    if (!slot || !slot.isActive) throw new BadRequestException('Selected slot is not available');
    if (isPastIstSlot(dto.scheduledDate, slot.startTime)) {
      throw new BadRequestException('This slot has already passed — please choose an upcoming date or time');
    }

    const { resolvedItems, subtotal, discount, couponId, collectionFee, total } = await this.priceOrder(
      userId,
      items,
      dto.collectionType,
      dto.addressId,
      dto.collectionCenterId,
      dto.couponCode,
    );

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
          status: dto.paymentMethod === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT',
          paymentStatus: dto.paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
          paymentMethod: dto.paymentMethod,
          collectionType: dto.collectionType,
          addressId: dto.addressId,
          collectionCenterId: dto.collectionCenterId,
          slotId: dto.slotId,
          scheduledDate: new Date(dto.scheduledDate),
          subtotal,
          discount,
          collectionFee,
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
              status: dto.paymentMethod === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT',
              note: dto.paymentMethod === 'COD' ? 'Booking confirmed — pay on collection' : 'Awaiting payment',
              changedBy: 'SYSTEM',
            },
          },
        },
        include: { items: true, statusLogs: true, slot: true, address: true },
      });

      await tx.cartItem.deleteMany({ where: { userId } });
      return created;
    });

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
        phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
        reports: { where: { status: 'APPROVED' } },
        coupon: { select: { code: true } },
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

    await this.prisma.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        statusLogs: {
          create: {
            status: 'CANCELLED',
            note: reason ? `Cancelled by patient — ${reason}` : 'Cancelled by patient',
            changedBy: userId,
          },
        },
      },
    });
    return this.getOne(userId, id);
  }
}
