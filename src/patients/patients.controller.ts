import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PatientsService } from './patients.service.js';
import { UpsertFamilyMemberDto } from './dto/upsert-family-member.dto.js';
import { UpsertAddressDto } from './dto/upsert-address.dto.js';

@Controller('patients/me')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get('family-members')
  listFamilyMembers(@Req() req: any) {
    return this.patients.listFamilyMembers(req.user.sub);
  }

  @Post('family-members')
  createFamilyMember(@Req() req: any, @Body() dto: UpsertFamilyMemberDto) {
    return this.patients.createFamilyMember(req.user.sub, dto);
  }

  @Patch('family-members/:id')
  updateFamilyMember(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertFamilyMemberDto) {
    return this.patients.updateFamilyMember(req.user.sub, id, dto);
  }

  @Delete('family-members/:id')
  deleteFamilyMember(@Req() req: any, @Param('id') id: string) {
    return this.patients.deleteFamilyMember(req.user.sub, id);
  }

  @Get('addresses')
  listAddresses(@Req() req: any) {
    return this.patients.listAddresses(req.user.sub);
  }

  @Post('addresses')
  createAddress(@Req() req: any, @Body() dto: UpsertAddressDto) {
    return this.patients.createAddress(req.user.sub, dto);
  }

  @Patch('addresses/:id')
  updateAddress(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertAddressDto) {
    return this.patients.updateAddress(req.user.sub, id, dto);
  }

  @Delete('addresses/:id')
  deleteAddress(@Req() req: any, @Param('id') id: string) {
    return this.patients.deleteAddress(req.user.sub, id);
  }
}
