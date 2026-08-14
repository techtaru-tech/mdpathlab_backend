import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
  ) {}

  async list(userId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { familyMember: true },
      orderBy: { createdAt: 'asc' },
    });

    const resolved = await Promise.all(
      items.map(async (item) => {
        const catalogueItem = await this.catalogue.resolveItem(item.itemType, item.itemId).catch(() => null);
        return { ...item, catalogueItem };
      }),
    );

    const subtotal = resolved.reduce((sum, i) => sum + (i.catalogueItem?.price ?? 0), 0);
    return { items: resolved, subtotal };
  }

  async add(userId: string, dto: AddCartItemDto) {
    // Confirms the item genuinely exists and is bookable before it ever reaches the cart.
    await this.catalogue.resolveItem(dto.itemType, dto.itemId);

    if (dto.familyMemberId) {
      const member = await this.prisma.familyMember.findUnique({ where: { id: dto.familyMemberId } });
      if (!member || member.userId !== userId) {
        throw new BadRequestException('Family member not found');
      }
    }

    const familyMemberId = dto.familyMemberId ?? null;
    const dedupeKey = { userId, itemType: dto.itemType, itemId: dto.itemId, familyMemberId };

    // Fast path only — saves a round trip for the common case, but two concurrent requests can
    // both pass this check before either commits, so it is NOT what prevents duplicates. That
    // guarantee comes from the partial unique indexes on cart_items (see the migration) plus the
    // create()/P2002 handling below.
    const existing = await this.prisma.cartItem.findFirst({ where: dedupeKey });
    if (existing) return existing;

    try {
      return await this.prisma.cartItem.create({
        data: { userId, itemType: dto.itemType, itemId: dto.itemId, familyMemberId: dto.familyMemberId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Another concurrent request won the race and already created this exact row — return
        // it instead of surfacing a spurious conflict to the caller.
        const winner = await this.prisma.cartItem.findFirst({ where: dedupeKey });
        if (winner) return winner;
      }
      throw err;
    }
  }

  async update(userId: string, id: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    if (dto.familyMemberId) {
      const member = await this.prisma.familyMember.findUnique({ where: { id: dto.familyMemberId } });
      if (!member || member.userId !== userId) {
        throw new BadRequestException('Family member not found');
      }
    }

    return this.prisma.cartItem.update({
      where: { id },
      data: { familyMemberId: dto.familyMemberId || null },
    });
  }

  async remove(userId: string, id: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }
    await this.prisma.cartItem.delete({ where: { id } });
    return { deleted: true };
  }

  clear(userId: string) {
    return this.prisma.cartItem.deleteMany({ where: { userId } });
  }
}
