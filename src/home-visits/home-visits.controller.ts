import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { HomeVisitsService } from './home-visits.service.js';
import { CancelHomeCollectionRequestDto, CreateHomeCollectionRequestDto } from './dto/create-home-collection-request.dto.js';

// "Send a phlebotomist" requests — no tests picked up front; an admin assigns a phlebotomist and
// tests are added at the visit, which turns the request into an ordinary order (see /orders).
@Controller('home-collection-requests')
@UseGuards(JwtAuthGuard)
export class HomeVisitsController {
  constructor(private readonly homeVisits: HomeVisitsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateHomeCollectionRequestDto) {
    return this.homeVisits.create(req.user.sub, dto);
  }

  // Declared before ':id' so "me" is never read as an id.
  @Get('me')
  listMine(@Req() req: any) {
    return this.homeVisits.listMine(req.user.sub);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.homeVisits.getMine(req.user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@Req() req: any, @Param('id') id: string, @Body() dto: CancelHomeCollectionRequestDto) {
    return this.homeVisits.cancelMine(req.user.sub, id, dto?.reason);
  }
}
