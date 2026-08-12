import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { CheckoutDto } from './dto/checkout.dto.js';

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
  ) {}

  /**
   * Only applied when both the address and the reference lab have coordinates — the client
   * hasn't yet provided the lab's precise lat/long (see the development plan's open items), so
   * this quietly falls back to a free home collection until that's resolved.
   */
  private computeHomeCollectionFee(address: { lat: number | null; lng: number | null } | null) {
    const labLat = Number(this.config.get('PRIMARY_LAB_LAT'));
    const labLng = Number(this.config.get('PRIMARY_LAB_LNG'));
    if (!address?.lat || !address?.lng || !labLat || !labLng) return 0;

    const km = haversineKm(address.lat, address.lng, labLat, labLng);
    const freeKm = Number(this.config.get('HOME_COLLECTION_FREE_KM', 5));
    const tier2Km = Number(this.config.get('HOME_COLLECTION_TIER2_KM', 10));
    const tier2Fee = Number(this.config.get('HOME_COLLECTION_TIER2_FEE', 100));
    const tier3Km = Number(this.config.get('HOME_COLLECTION_TIER3_KM', 20));
    const tier3Fee = Number(this.config.get('HOME_COLLECTION_TIER3_FEE', 200));

    if (km <= freeKm) return 0;
    if (km <= tier2Km) return tier2Fee;
    if (km <= tier3Km) return tier3Fee;
    return tier3Fee;
  }

  async checkout(userId: string, dto: CheckoutDto) {
    const cartItems = await this.prisma.cartItem.findMany({ where: { userId } });
    if (cartItems.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    let address: { lat: number | null; lng: number | null } | null = null;
    if (dto.collectionType === 'HOME') {
      if (!dto.addressId) throw new BadRequestException('addressId is required for home collection');
      const found = await this.prisma.address.findUnique({ where: { id: dto.addressId } });
      if (!found || found.userId !== userId) throw new BadRequestException('Address not found');
      address = found;
    } else if (!dto.collectionCenterId) {
      throw new BadRequestException('collectionCenterId is required for a center visit');
    }

    const slot = await this.prisma.slot.findUnique({ where: { id: dto.slotId } });
    if (!slot || !slot.isActive) throw new BadRequestException('Selected slot is not available');

    const resolvedItems = await Promise.all(
      cartItems.map(async (item) => ({
        cartItem: item,
        catalogueItem: await this.catalogue.resolveItem(item.itemType, item.itemId),
      })),
    );
    const subtotal = resolvedItems.reduce((sum, i) => sum + i.catalogueItem.price, 0);

    let discount = 0;
    let couponId: string | null = null;
    if (dto.couponCode) {
      const coupon = await this.coupons.validate(dto.couponCode, subtotal);
      discount = this.coupons.computeDiscount(coupon, subtotal);
      couponId = coupon.id;
    }

    const collectionFee = dto.collectionType === 'HOME' ? this.computeHomeCollectionFee(address) : 0;
    const total = subtotal - discount + collectionFee;

    const order = await this.prisma.$transaction(async (tx) => {
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
      include: { items: true, slot: true, address: true, collectionCenter: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, statusLogs: { orderBy: { createdAt: 'asc' } }, slot: true, address: true },
    });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    return order;
  }

  async cancel(userId: string, id: string) {
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

    return this.prisma.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        statusLogs: { create: { status: 'CANCELLED', note: 'Cancelled by patient', changedBy: userId } },
      },
    });
  }
}
