import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';

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

    const existing = await this.prisma.cartItem.findFirst({
      where: {
        userId,
        itemType: dto.itemType,
        itemId: dto.itemId,
        familyMemberId: dto.familyMemberId ?? null,
      },
    });
    if (existing) return existing;

    return this.prisma.cartItem.create({
      data: { userId, itemType: dto.itemType, itemId: dto.itemId, familyMemberId: dto.familyMemberId },
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
