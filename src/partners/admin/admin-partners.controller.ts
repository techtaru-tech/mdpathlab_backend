import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { PartnersService } from '../partners.service.js';
import { PartnerAffiliationsService } from '../partner-affiliations.service.js';
import { AdminPermissionGuard, RequireAdminPermission } from './admin-permission.guard.js';
import type { AdminActor } from './admin-audit.js';
import { AdminAffiliationDecisionDto, AdminCreateAffiliationDto, ListPartnersQueryDto, PartnerDecisionDto } from '../dto/partner-admin.dto.js';

type AdminRequest = { admin: AdminActor };

// Admin review of doctor/clinic applications. Works whether or not doctor registration is switched on (so settings
// can be prepared), and is not linked from the admin menu in this phase.
@Controller('admin/partners')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminPartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly affiliations: PartnerAffiliationsService,
  ) {}

  @Get()
  @RequireAdminPermission('PARTNERS_VIEW')
  list(@Query() query: ListPartnersQueryDto) {
    return this.partners.adminList(query);
  }

  // Declared before ':id' so "summary" is never read as an id.
  @Get('summary')
  @RequireAdminPermission('PARTNERS_VIEW')
  summary() {
    return this.partners.adminSummary();
  }

  @Get(':id')
  @RequireAdminPermission('PARTNERS_VIEW')
  get(@Param('id') id: string) {
    return this.partners.adminDetail(id);
  }

  @Post(':id/approve')
  @RequireAdminPermission('PARTNERS_REVIEW')
  approve(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: PartnerDecisionDto) {
    return this.partners.adminDecide(id, 'APPROVE', dto.reason, req.admin);
  }

  @Post(':id/reject')
  @RequireAdminPermission('PARTNERS_REVIEW')
  reject(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: PartnerDecisionDto) {
    return this.partners.adminDecide(id, 'REJECT', dto.reason, req.admin);
  }

  @Post(':id/suspend')
  @RequireAdminPermission('PARTNERS_REVIEW')
  suspend(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: PartnerDecisionDto) {
    return this.partners.adminDecide(id, 'SUSPEND', dto.reason, req.admin);
  }

  @Post(':id/reactivate')
  @RequireAdminPermission('PARTNERS_REVIEW')
  reactivate(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: PartnerDecisionDto) {
    return this.partners.adminDecide(id, 'REACTIVATE', dto.reason, req.admin);
  }
}

@Controller('admin/affiliations')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminAffiliationsController {
  constructor(private readonly affiliations: PartnerAffiliationsService) {}

  @Post()
  @RequireAdminPermission('PARTNERS_REVIEW')
  create(@Req() req: AdminRequest, @Body() dto: AdminCreateAffiliationDto) {
    return this.affiliations.adminCreate(dto.doctorPartnerId, dto.clinicPartnerId, dto.reason, req.admin);
  }

  @Post(':id/approve')
  @RequireAdminPermission('PARTNERS_REVIEW')
  approve(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: AdminAffiliationDecisionDto) {
    return this.affiliations.adminDecide(id, 'APPROVE', dto.reason, req.admin);
  }

  @Post(':id/reject')
  @RequireAdminPermission('PARTNERS_REVIEW')
  reject(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: AdminAffiliationDecisionDto) {
    return this.affiliations.adminDecide(id, 'REJECT', dto.reason, req.admin);
  }

  @Post(':id/end')
  @RequireAdminPermission('PARTNERS_REVIEW')
  end(@Req() req: AdminRequest, @Param('id') id: string, @Body() dto: AdminAffiliationDecisionDto) {
    return this.affiliations.adminDecide(id, 'END', dto.reason, req.admin);
  }
}
