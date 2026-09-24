import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { LabResultsService } from './lab-results.service.js';
import { UpsertResultValueDto } from './dto/upsert-result-value.dto.js';

@Controller('lab/orders/:orderId/results')
@UseGuards(LabAuthGuard)
export class LabResultsController {
  constructor(private readonly results: LabResultsService) {}

  @Get()
  list(@Req() req: any, @Param('orderId') orderId: string) {
    return this.results.getRequiredParameters(req.lab.labId, orderId);
  }

  @Post()
  upsert(@Req() req: any, @Param('orderId') orderId: string, @Body() dto: UpsertResultValueDto) {
    return this.results.upsertValue(req.lab.labId, orderId, dto);
  }
}
