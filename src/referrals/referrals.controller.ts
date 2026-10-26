import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PartnersEnabledGuard } from '../partners/partners-feature.js';
import { PartnerAuthGuard, type PartnerTokenPayload } from '../partners/partner-auth.guard.js';
import { ReferralsEnabledGuard } from './referrals-feature.js';
import { ReferralsService } from './referrals.service.js';
import { ClaimReferralDto } from './dto/referral.dto.js';

/** What the /r/:code page asks. Public; every failure looks the same. 404 while referrals are switched off. */
@Controller('referrals')
@UseGuards(ReferralsEnabledGuard)
export class ReferralsPublicController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get(':code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  lookup(@Param('code') code: string) {
    return this.referrals.lookup(code);
  }
}

/** The logged-in patient's own referral. 404 while referrals are switched off. */
@Controller('me/referral')
@UseGuards(ReferralsEnabledGuard, JwtAuthGuard)
export class PatientReferralController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  mine(@Req() req: { user: { sub: string } }) {
    return this.referrals.mine(req.user.sub);
  }

  @Post('claim')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  claim(@Req() req: { user: { sub: string }; ip?: string }, @Body() dto: ClaimReferralDto) {
    return this.referrals.claim(req.user.sub, dto.code, dto.source ?? 'LINK', dto.capturedAt, req.ip);
  }
}

/** An approved partner's code, link and QR. Needs BOTH switches (partner portal and referrals) on. */
@Controller('partner/referral-kit')
@UseGuards(PartnersEnabledGuard, ReferralsEnabledGuard, PartnerAuthGuard)
export class PartnerReferralKitController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  kit(@Req() req: { partner: PartnerTokenPayload }) {
    return this.referrals.partnerKit(req.partner.sub);
  }
}
