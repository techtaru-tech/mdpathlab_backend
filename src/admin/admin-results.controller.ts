import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveOrderParameterIds } from '../common/resolve-order-parameters.js';

// Read-only view of what a partner lab has entered for a booking's raw parameter values (see
// LabResultsController for the lab-side write path) — admin references these while preparing and
// uploading the actual Report PDF (POST /admin/orders/:id/reports). Same parameter-resolution
// logic as LabResultsService.getRequiredParameters, just without the labId ownership check since
// admin can see any order.
@Controller('admin/orders/:orderId/results')
@UseGuards(AdminAuthGuard)
export class AdminResultsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Param('orderId') orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const [parameterIds, existing] = await Promise.all([
      resolveOrderParameterIds(this.prisma, orderId),
      this.prisma.labResultValue.findMany({ where: { orderId } }),
    ]);

    const parameters = await this.prisma.parameter.findMany({ where: { id: { in: Array.from(parameterIds) } } });
    const existingByParameter = new Map(existing.map((v) => [v.parameterId, v]));

    return parameters.map((p) => ({
      parameterId: p.id,
      name: p.name,
      value: existingByParameter.get(p.id)?.value ?? null,
      unit: existingByParameter.get(p.id)?.unit ?? null,
      enteredAt: existingByParameter.get(p.id)?.enteredAt ?? null,
    }));
  }
}
