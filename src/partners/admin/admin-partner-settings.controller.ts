import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { PartnerRequirementsService } from '../partner-requirements.service.js';
import { FeatureSwitches } from '../feature-switches.js';
import { AdminPermissionGuard, RequireAdminPermission } from './admin-permission.guard.js';
import type { AdminActor } from './admin-audit.js';
import {
  CreateClinicTypeDto,
  ReplaceRequirementsDto,
  RequirementsScopeQueryDto,
  UpdateClinicTypeDto,
  UpdateFeatureSwitchesDto,
} from '../dto/partner-admin.dto.js';

type AdminRequest = { admin: AdminActor };

// The on/off switches, clinic types and the documents each applicant type must or may upload. Every change is audited.
@Controller('admin/partner-settings')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminPartnerSettingsController {
  constructor(
    private readonly requirements: PartnerRequirementsService,
    private readonly switches: FeatureSwitches,
  ) {}

  @Get('features')
  @RequireAdminPermission('PARTNERS_VIEW')
  features() {
    return this.switches.get();
  }

  @Put('features')
  @RequireAdminPermission('PARTNER_SETTINGS')
  setFeatures(@Req() req: AdminRequest, @Body() dto: UpdateFeatureSwitchesDto) {
    return this.switches.set(dto, req.admin);
  }

  @Get('clinic-types')
  @RequireAdminPermission('PARTNERS_VIEW')
  listClinicTypes() {
    return this.requirements.listClinicTypesForAdmin();
  }

  @Post('clinic-types')
  @RequireAdminPermission('PARTNER_SETTINGS')
  createClinicType(@Req() req: AdminRequest, @Body() dto: CreateClinicTypeDto) {
    return this.requirements.createClinicType(dto, req.admin);
  }

  @Patch('clinic-types/:code')
  @RequireAdminPermission('PARTNER_SETTINGS')
  updateClinicType(@Req() req: AdminRequest, @Param('code') code: string, @Body() dto: UpdateClinicTypeDto) {
    return this.requirements.updateClinicType(code, dto, req.admin);
  }

  @Get('requirements')
  @RequireAdminPermission('PARTNERS_VIEW')
  getRequirements(@Query() query: RequirementsScopeQueryDto) {
    return this.requirements.requirementsForAdmin(query.partnerType, query.clinicTypeCode);
  }

  @Put('requirements')
  @RequireAdminPermission('PARTNER_SETTINGS')
  replaceRequirements(@Req() req: AdminRequest, @Body() dto: ReplaceRequirementsDto) {
    return this.requirements.replaceRequirements(dto, req.admin);
  }
}
