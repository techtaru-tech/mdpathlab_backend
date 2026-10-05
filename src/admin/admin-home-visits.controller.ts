import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { HomeVisitsService } from '../home-visits/home-visits.service.js';
import { AddHomeVisitItemsDto, AssignHomeVisitDto, UpdateHomeVisitStatusDto } from './dto/home-visit.dto.js';

@Controller('admin/home-collection-requests')
@UseGuards(AdminAuthGuard)
export class AdminHomeVisitsController {
  constructor(private readonly homeVisits: HomeVisitsService) {}

  // Filters: ?city=Jaipur&date=2026-10-06&status=REQUESTED (all optional).
  @Get()
  list(@Query('city') city?: string, @Query('date') date?: string, @Query('status') status?: string) {
    return this.homeVisits.adminList({ city, date, status });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.homeVisits.adminGet(id);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignHomeVisitDto) {
    return this.homeVisits.assign(id, dto.phlebotomistId, dto.eta);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateHomeVisitStatusDto) {
    return this.homeVisits.setStatus(id, dto.status, { eta: dto.eta, reason: dto.reason });
  }

  // Tests decided on at the visit -> creates a normal Order and links it to this request.
  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddHomeVisitItemsDto) {
    return this.homeVisits.addItems(id, dto.items);
  }
}
