import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { LabOrdersService } from './lab-orders.service.js';
import { LabUpdateOrderStatusDto } from './dto/lab-update-order-status.dto.js';

@Controller('lab/orders')
@UseGuards(LabAuthGuard)
export class LabOrdersController {
  constructor(private readonly orders: LabOrdersService) {}

  @Get()
  list(@Req() req: any, @Query('status') status?: string) {
    return this.orders.list(req.lab.labId, status);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.orders.get(req.lab.labId, id);
  }

  @Get(':id/available-phlebotomists')
  listAvailablePhlebotomists(@Req() req: any, @Param('id') id: string) {
    return this.orders.listAvailablePhlebotomists(req.lab.labId, id);
  }

  @Patch(':id/status')
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() dto: LabUpdateOrderStatusDto) {
    return this.orders.updateStatus(req.lab.labId, id, dto.status, dto.note, dto.phlebotomistId);
  }

  @Patch(':id/receive-sample')
  receiveSample(@Req() req: any, @Param('id') id: string) {
    return this.orders.receiveSample(req.lab.labId, id);
  }
}
