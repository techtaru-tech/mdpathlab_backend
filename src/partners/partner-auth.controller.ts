import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RedisService } from '../redis/redis.service.js';
import { FeatureSwitches } from './feature-switches.js';
import { PartnersEnabledGuard } from './partners-feature.js';
import { PartnerAuthGuard, revokePartnerToken, type PartnerTokenPayload } from './partner-auth.guard.js';
import { PartnerOtpService } from './partner-otp.service.js';
import { PartnersService } from './partners.service.js';
import { RequestPartnerOtpDto, VerifyPartnerOtpDto } from './dto/partner-auth.dto.js';

/** Public: lets the website show "registration is not open yet" instead of a form while the feature is off. */
@Controller('partners')
export class PartnersPublicController {
  constructor(private readonly switches: FeatureSwitches) {}

  @Get('availability')
  async availability() {
    return { enabled: await this.switches.partnersEnabled() };
  }
}

/** Doctor/clinic portal sign-in by mobile OTP. 404 while doctor registration is switched off. */
@Controller('auth/partner')
@UseGuards(PartnersEnabledGuard)
export class PartnerAuthController {
  constructor(
    private readonly otp: PartnerOtpService,
    private readonly partners: PartnersService,
    private readonly redis: RedisService,
  ) {}

  @Post('otp/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestOtp(@Body() dto: RequestPartnerOtpDto) {
    return this.otp.request(dto.phone);
  }

  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyPartnerOtpDto) {
    return this.partners.login(dto);
  }

  // The token is put on a logout list until it would have expired, so a copied token stops working too.
  @Post('logout')
  @UseGuards(PartnerAuthGuard)
  async logout(@Req() req: { partner: PartnerTokenPayload; partnerToken: string }) {
    await revokePartnerToken(this.redis, req.partnerToken, req.partner.exp);
    return { ok: true };
  }
}
