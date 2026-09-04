import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSlotDto, UpdateSlotDto } from './dto/upsert-slot.dto.js';

// Separate from the public GET /slots (which is date/scope-aware and returns only active slots
// with computed availability) — admin tooling needs the raw slot definitions, including inactive
// ones, both to populate a dropdown when configuring SlotAvailability rows and, here, to manage
// those definitions themselves (label/time window/order/active).
@Controller('admin/slots')
@UseGuards(AdminAuthGuard)
export class AdminSlotsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.slot.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @Post()
  create(@Body() dto: CreateSlotDto) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }
    return this.prisma.slot.create({
      data: {
        label: dto.label,
        startTime: dto.startTime,
        endTime: dto.endTime,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSlotDto) {
    const existing = await this.prisma.slot.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Slot not found');

    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;
    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }

    return this.prisma.slot.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // Delete only when genuinely unused — Slot is referenced by Order.slotId and
  // SlotAvailability.slotId (no cascade), so deleting a used slot would either fail on the FK
  // constraint or leave dangling references. Deactivate instead when in use, same convention as
  // Category's delete guard.
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const [orderCount, availabilityCount] = await Promise.all([
      this.prisma.order.count({ where: { slotId: id } }),
      this.prisma.slotAvailability.count({ where: { slotId: id } }),
    ]);
    if (orderCount > 0 || availabilityCount > 0) {
      throw new BadRequestException(
        `Cannot delete — ${orderCount} booking(s) and ${availabilityCount} availability rule(s) still reference this slot. Deactivate it instead, or remove those first.`,
      );
    }
    await this.prisma.slot.delete({ where: { id } });
    return { deleted: true };
  }
}
