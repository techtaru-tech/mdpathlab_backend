import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';

@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class AdminOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.prisma.order.findMany({
      where: status ? { status: status as never } : {},
      include: {
        user: { select: { id: true, phone: true, name: true } },
        items: true,
        slot: true,
        address: true,
        phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
        reports: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phone: true, name: true } },
        items: true,
        slot: true,
        address: true,
        statusLogs: { orderBy: { createdAt: 'asc' } },
        phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
        reports: true,
      },
    });
  }

  /**
   * Manual status progression (and optional phlebotomist assignment) — this IS the interim
   * field-coordination mechanism for Phase 1, per the development plan: an operator moves a
   * booking through its lifecycle by phone/WhatsApp with the phlebotomist until the dedicated
   * field app ships in Phase 2.
   */
  @Patch(':id/status')
  async updateStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.phlebotomistId ? { phlebotomistId: dto.phlebotomistId } : {}),
        statusLogs: {
          create: { status: dto.status, note: dto.note, changedBy: req.admin.email },
        },
      },
      include: { items: true, statusLogs: { orderBy: { createdAt: 'asc' } } },
    });
  }
}
