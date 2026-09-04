import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCouponDto, UpdateCouponDto } from './dto/upsert-coupon.dto.js';

@Controller('admin/coupons')
@UseGuards(AdminAuthGuard)
export class AdminCouponsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post()
  async create(@Body() dto: CreateCouponDto) {
    const code = dto.code.toUpperCase();
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) throw new ConflictException('A coupon with this code already exists');

    if (dto.startsAt && dto.endsAt && new Date(dto.startsAt) > new Date(dto.endsAt)) {
      throw new BadRequestException('Start date must be before end date');
    }
    if (dto.type === 'PERCENT' && dto.value > 100) {
      throw new BadRequestException('Percent discount cannot exceed 100');
    }

    return this.prisma.coupon.create({
      data: {
        code,
        type: dto.type,
        value: dto.value,
        minOrderValue: dto.minOrderValue,
        maxDiscount: dto.maxDiscount,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        usageLimit: dto.usageLimit,
        status: dto.status ?? 'ACTIVE',
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');

    const nextType = dto.type ?? existing.type;
    const nextValue = dto.value ?? existing.value;
    if (nextType === 'PERCENT' && nextValue > 100) {
      throw new BadRequestException('Percent discount cannot exceed 100');
    }

    const nextStartsAt = dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : existing.startsAt;
    const nextEndsAt = dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : existing.endsAt;
    if (nextStartsAt && nextEndsAt && nextStartsAt > nextEndsAt) {
      throw new BadRequestException('Start date must be before end date');
    }

    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.minOrderValue !== undefined ? { minOrderValue: dto.minOrderValue } : {}),
        ...(dto.maxDiscount !== undefined ? { maxDiscount: dto.maxDiscount } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
        ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  // Delete only when never used — Coupon is referenced by Order.couponId (no cascade), so
  // deleting a used coupon would leave a dangling reference on past orders. Deactivate instead.
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Coupon not found');

    const orderCount = await this.prisma.order.count({ where: { couponId: id } });
    if (orderCount > 0) {
      throw new BadRequestException(`Cannot delete — ${orderCount} order(s) used this coupon. Deactivate it instead.`);
    }

    await this.prisma.coupon.delete({ where: { id } });
    return { deleted: true };
  }
}
