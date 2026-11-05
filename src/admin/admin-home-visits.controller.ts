import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { HomeVisitsService } from '../home-visits/home-visits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import {
  AddHomeVisitItemsDto,
  AdminCreateHomeVisitDto,
  AdminUpdateHomeVisitDto,
  AssignHomeVisitDto,
  UpdateHomeVisitStatusDto,
} from './dto/home-visit.dto.js';

@Controller('admin/home-collection-requests')
@UseGuards(AdminAuthGuard)
export class AdminHomeVisitsController {
  constructor(
    private readonly homeVisits: HomeVisitsService,
    private readonly prisma: PrismaService,
    private readonly bookings: AdminBookingsService,
  ) {}

  // Filters: ?city=Jaipur&date=2026-10-06&status=REQUESTED (all optional).
  @Get()
  list(@Query('city') city?: string, @Query('date') date?: string, @Query('status') status?: string) {
    return this.homeVisits.adminList({ city, date, status });
  }

  /** A home visit for an enquiry that came by phone, WhatsApp or walk-in — for an existing patient account. */
  @Post()
  async create(@Req() req: any, @Body() dto: AdminCreateHomeVisitDto) {
    const { userId, source, ...visit } = dto;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
    if (!user || user.role !== 'PATIENT') throw new NotFoundException('Patient not found');
    return this.homeVisits.create(userId, visit, { email: req.admin.email, source });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.homeVisits.adminGet(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AdminUpdateHomeVisitDto) {
    return this.homeVisits.adminUpdate(id, dto);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignHomeVisitDto) {
    return this.homeVisits.assign(id, dto.phlebotomistId, dto.eta);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateHomeVisitStatusDto) {
    return this.homeVisits.setStatus(id, dto.status, { eta: dto.eta, reason: dto.reason });
  }

  /**
   * Tests for the visit. The first time, this creates the visit's booking (pay on collection) — at any point before
   * the visit is over, not only once the phlebotomist is at the door. After that, more tests are added to that same
   * booking, and its total, the tests to collect and everything else that reads the booking follow.
   */
  @Post(':id/items')
  async addItems(@Req() req: any, @Param('id') id: string, @Body() dto: AddHomeVisitItemsDto) {
    const visit = await this.homeVisits.adminGet(id);
    if (!visit.orderId) return this.homeVisits.addItems(id, dto.items, req.admin.email);

    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: visit.orderId }, include: { items: true } });
    const current = order.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, ...(i.familyMemberId ? { familyMemberId: i.familyMemberId } : {}) }));
    const result = await this.bookings.edit(req.admin.email, order.id, {
      items: [...current, ...dto.items],
      note: 'Tests added to the home visit',
    });
    const updated = await this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    return { orderId: updated.id, orderNumber: updated.orderNumber, total: updated.total, items: updated.items.length, summary: result.summary };
  }
}
