import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { AddHomeVisitItemsDto, AssignHomeVisitDto, UpdateHomeVisitStatusDto } from '../admin/dto/home-visit.dto.js';
import { HomeVisitsService } from './home-visits.service.js';

class HomeVisitNoShowDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

// Phlebotomist app: the home visits assigned to me, and the steps I take at the visit. Adding the tests creates a
// normal booking, which then continues in the usual phlebotomist flow (collection code, samples, payment, handover).
@Controller('phlebotomist/home-visits')
@UseGuards(PhlebotomistAuthGuard)
export class PhlebotomistHomeVisitsController {
  constructor(private readonly homeVisits: HomeVisitsService) {}

  // ?scope=today (default) | upcoming | past | all
  @Get()
  list(@Req() req: any, @Query('scope') scope?: string) {
    return this.homeVisits.phlebotomistList(req.phlebotomist.phlebotomistId, scope);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.homeVisits.phlebotomistGet(req.phlebotomist.phlebotomistId, id);
  }

  @Post(':id/on-the-way')
  onTheWay(@Req() req: any, @Param('id') id: string) {
    return this.homeVisits.phlebotomistSetStatus(req.phlebotomist.phlebotomistId, id, 'ON_THE_WAY');
  }

  @Post(':id/arrived')
  arrived(@Req() req: any, @Param('id') id: string) {
    return this.homeVisits.phlebotomistSetStatus(req.phlebotomist.phlebotomistId, id, 'ARRIVED');
  }

  // The customer was not there / refused — closes the visit.
  @Post(':id/no-show')
  noShow(@Req() req: any, @Param('id') id: string, @Body() dto: HomeVisitNoShowDto) {
    return this.homeVisits.phlebotomistSetStatus(req.phlebotomist.phlebotomistId, id, 'NO_SHOW', dto.reason);
  }

  // Tests decided on at the door -> creates the booking (pay after collection) linked to this visit.
  @Post(':id/tests')
  addTests(@Req() req: any, @Param('id') id: string, @Body() dto: AddHomeVisitItemsDto) {
    return this.homeVisits.phlebotomistAddItems(req.phlebotomist.phlebotomistId, id, dto.items);
  }
}

// Lab dashboard: home visit requests routed to this lab, assigned to the lab's own phlebotomists.
@Controller('lab/home-visits')
@UseGuards(LabAuthGuard)
export class LabHomeVisitsController {
  constructor(private readonly homeVisits: HomeVisitsService) {}

  // Filters: ?date=2026-10-12&status=REQUESTED (both optional).
  @Get()
  list(@Req() req: any, @Query('date') date?: string, @Query('status') status?: string) {
    return this.homeVisits.labList(req.lab.labId, { date, status });
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.homeVisits.labGet(req.lab.labId, id);
  }

  @Patch(':id/assign')
  assign(@Req() req: any, @Param('id') id: string, @Body() dto: AssignHomeVisitDto) {
    return this.homeVisits.labAssign(req.lab.labId, id, dto.phlebotomistId, dto.eta);
  }

  @Patch(':id/status')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateHomeVisitStatusDto) {
    return this.homeVisits.labSetStatus(req.lab.labId, id, dto.status, { eta: dto.eta, reason: dto.reason });
  }
}
