import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CollectionCenter, Slot, SlotAvailability } from '@prisma/client';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlotsService } from '../slots/slots.service.js';
import { CreateSlotAvailabilityDto, UpdateSlotAvailabilityDto } from './dto/upsert-slot-availability.dto.js';

type RowWithRelations = SlotAvailability & { slot: Slot; collectionCenter: CollectionCenter | null };

@Controller('admin/slot-availability')
@UseGuards(AdminAuthGuard)
export class AdminSlotAvailabilityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
  ) {}

  @Get()
  async list(
    @Query('date') date?: string,
    @Query('collectionType') collectionType?: string,
    @Query('collectionCenterId') collectionCenterId?: string,
    @Query('slotId') slotId?: string,
  ) {
    // Fetches everything unfiltered first so fallback/precedence notes (see toView) can be
    // computed from sibling rows for the same (slot, date) even when the admin's own filter
    // would otherwise hide them — e.g. viewing only CENTER rows should still be able to say
    // "falls back to Global (10)" for a centre-specific row.
    const all = await this.prisma.slotAvailability.findMany({
      include: { slot: true, collectionCenter: true },
      orderBy: [{ date: 'asc' }, { slotId: 'asc' }],
    });

    const siblingsByScopeKey = new Map<string, RowWithRelations[]>();
    for (const row of all) {
      const key = `${row.slotId}|${row.date.toISOString()}`;
      const bucket = siblingsByScopeKey.get(key);
      if (bucket) bucket.push(row);
      else siblingsByScopeKey.set(key, [row]);
    }

    const filtered = all.filter(
      (row) =>
        (!date || row.date.toISOString().slice(0, 10) === date) &&
        (!collectionType || row.collectionType === collectionType) &&
        (!collectionCenterId || row.collectionCenterId === collectionCenterId) &&
        (!slotId || row.slotId === slotId),
    );

    return Promise.all(
      filtered.map(async (row) => {
        const booked = await this.slots.getOccupancyForRow(row);
        const siblings = siblingsByScopeKey.get(`${row.slotId}|${row.date.toISOString()}`) ?? [];
        return this.toView(row, booked, siblings);
      }),
    );
  }

  @Post()
  async create(@Body() dto: CreateSlotAvailabilityDto) {
    await this.validateScope(dto.slotId, dto.collectionType, dto.collectionCenterId);

    try {
      const row = await this.prisma.slotAvailability.create({
        data: {
          slotId: dto.slotId,
          date: new Date(`${dto.date}T00:00:00.000Z`),
          collectionType: dto.collectionType,
          collectionCenterId: dto.collectionCenterId,
          capacity: dto.capacity,
        },
        include: { slot: true, collectionCenter: true },
      });
      return this.toView(row, 0, [row]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A configuration already exists for this exact slot, date, and scope — edit or delete it instead.');
      }
      throw err;
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSlotAvailabilityDto) {
    const row = await this.prisma.slotAvailability.update({
      where: { id },
      data: { capacity: dto.capacity },
      include: { slot: true, collectionCenter: true },
    });
    const booked = await this.slots.getOccupancyForRow(row);
    return this.toView(row, booked, [row]);
  }

  // Deleting a row requires no special handling to "restore unlimited" — availability/capacity
  // are always computed live from whatever SlotAvailability rows currently exist (see
  // SlotsService.resolveApplicableConfig), so once this row is gone, the next precedence level
  // (or unlimited, if none) simply applies on the very next request. Existing Order rows are
  // untouched either way.
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.slotAvailability.delete({ where: { id } });
    return { deleted: true };
  }

  private async validateScope(slotId: string, collectionType: 'HOME' | 'CENTER' | undefined, collectionCenterId: string | undefined) {
    const slot = await this.prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot) throw new BadRequestException('Slot not found');
    if (!slot.isActive) throw new BadRequestException('Cannot configure capacity for an inactive slot');

    if (collectionCenterId) {
      if (collectionType !== 'CENTER') {
        throw new BadRequestException('collectionCenterId can only be set when collectionType is CENTER');
      }
      const centre = await this.prisma.collectionCenter.findUnique({ where: { id: collectionCenterId } });
      if (!centre) throw new BadRequestException('Collection centre not found');
    }
  }

  private scopeLabel(row: RowWithRelations): string {
    if (!row.collectionType) return 'Global';
    if (row.collectionType === 'HOME') return 'Home';
    return row.collectionCenter ? `Centre: ${row.collectionCenter.name}` : 'Centre (all)';
  }

  /** Explains what this row's scope would fall back to if it were deleted — makes the
   * HOME/CENTER-wide/centre-specific -> global -> unlimited precedence visible in the UI instead
   * of implicit. */
  private fallbackNote(row: RowWithRelations, siblings: RowWithRelations[]): string | null {
    const global = siblings.find((s) => !s.collectionType && s.id !== row.id);
    const centerWide = siblings.find((s) => s.collectionType === 'CENTER' && !s.collectionCenterId && s.id !== row.id);

    if (!row.collectionType) return null; // global has nothing broader to fall back to
    if (row.collectionType === 'HOME') {
      return global ? `Without this row, HOME falls back to Global (${global.capacity}).` : 'Without this row, HOME would be unlimited.';
    }
    if (row.collectionCenterId) {
      if (centerWide) return `Without this row, this centre falls back to Centre-wide (${centerWide.capacity}).`;
      return global ? `Without this row, this centre falls back to Global (${global.capacity}).` : 'Without this row, this centre would be unlimited.';
    }
    // CENTER-wide row
    return global ? `Without this row, all centres fall back to Global (${global.capacity}).` : 'Without this row, all centres would be unlimited.';
  }

  private toView(row: RowWithRelations, booked: number, siblings: RowWithRelations[]) {
    const remaining = Math.max(0, row.capacity - booked);
    return {
      id: row.id,
      slotId: row.slotId,
      slotLabel: row.slot.label,
      startTime: row.slot.startTime,
      endTime: row.slot.endTime,
      date: row.date.toISOString().slice(0, 10),
      collectionType: row.collectionType,
      collectionCenterId: row.collectionCenterId,
      collectionCenterName: row.collectionCenter?.name ?? null,
      scopeLabel: this.scopeLabel(row),
      fallbackNote: this.fallbackNote(row, siblings),
      capacity: row.capacity,
      booked,
      remaining,
      available: remaining > 0,
    };
  }
}
