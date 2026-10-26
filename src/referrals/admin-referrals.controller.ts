import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { AdminPermissionGuard, RequireAdminPermission } from '../partners/admin/admin-permission.guard.js';
import type { AdminActor } from '../partners/admin/admin-audit.js';
import { ReferralsService } from './referrals.service.js';
import { ReferralSnapshotSweeper } from './referral-snapshot.sweeper.js';
import { AdminAssignReferralDto, AdminReasonDto, FindPatientQueryDto, PageQueryDto } from './dto/referral.dto.js';

type AdminRequest = { admin: AdminActor };

// Admin review of referral attribution. Works whether or not referrals are switched on; every change needs a reason
// and is written to the referral history and the admin audit log.
@Controller('admin/referrals')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly sweeper: ReferralSnapshotSweeper,
  ) {}

  @Get()
  @RequireAdminPermission('REFERRALS_VIEW')
  recent(@Query() query: PageQueryDto) {
    return this.referrals.adminRecent(query.page ?? 1);
  }

  @Get('health')
  @RequireAdminPermission('REFERRALS_VIEW')
  health() {
    return this.sweeper.health();
  }

  @Get('attempts')
  @RequireAdminPermission('REFERRALS_VIEW')
  attempts(@Query() query: PageQueryDto) {
    return this.referrals.adminAttempts(query.page ?? 1, query.outcome);
  }

  @Get('patient')
  @RequireAdminPermission('REFERRALS_VIEW')
  findPatient(@Query() query: FindPatientQueryDto) {
    return this.referrals.adminFindPatient(query.phone);
  }

  @Post('patient/:userId/assign')
  @RequireAdminPermission('REFERRALS_MANAGE')
  assign(@Req() req: AdminRequest, @Param('userId') userId: string, @Body() dto: AdminAssignReferralDto) {
    return this.referrals.adminAssign(userId, dto.partnerId, dto.reason, req.admin);
  }

  @Post('patient/:userId/reassign')
  @RequireAdminPermission('REFERRALS_MANAGE')
  reassign(@Req() req: AdminRequest, @Param('userId') userId: string, @Body() dto: AdminAssignReferralDto) {
    return this.referrals.adminReassign(userId, dto.partnerId, dto.reason, req.admin);
  }

  @Post('patient/:userId/revoke')
  @RequireAdminPermission('REFERRALS_MANAGE')
  revoke(@Req() req: AdminRequest, @Param('userId') userId: string, @Body() dto: AdminReasonDto) {
    return this.referrals.adminSetStatus(userId, 'REVOKE', dto.reason, req.admin);
  }

  @Post('patient/:userId/dispute')
  @RequireAdminPermission('REFERRALS_MANAGE')
  dispute(@Req() req: AdminRequest, @Param('userId') userId: string, @Body() dto: AdminReasonDto) {
    return this.referrals.adminSetStatus(userId, 'DISPUTE', dto.reason, req.admin);
  }

  @Post('patient/:userId/restore')
  @RequireAdminPermission('REFERRALS_MANAGE')
  restore(@Req() req: AdminRequest, @Param('userId') userId: string, @Body() dto: AdminReasonDto) {
    return this.referrals.adminSetStatus(userId, 'RESTORE', dto.reason, req.admin);
  }

  @Post('snapshots/:orderId/retry')
  @RequireAdminPermission('REFERRALS_MANAGE')
  retry(@Param('orderId') orderId: string) {
    return this.sweeper.retry(orderId);
  }

  @Get('partner/:partnerId')
  @RequireAdminPermission('REFERRALS_VIEW')
  partner(@Param('partnerId') partnerId: string) {
    return this.referrals.adminPartnerSummary(partnerId);
  }

  @Post('partner/:partnerId/reissue-code')
  @RequireAdminPermission('REFERRALS_MANAGE')
  reissue(@Req() req: AdminRequest, @Param('partnerId') partnerId: string, @Body() dto: AdminReasonDto) {
    return this.referrals.adminReissueCode(partnerId, dto.reason, req.admin);
  }
}
