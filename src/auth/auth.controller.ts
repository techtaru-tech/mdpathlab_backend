import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { CompleteProfileDto } from './dto/complete-profile.dto.js';
import { RequestPhoneChangeDto, VerifyPhoneChangeDto } from './dto/change-phone.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('otp/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.sub } });
    return { user };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  completeProfile(@Req() req: any, @Body() dto: CompleteProfileDto) {
    return this.auth.completeProfile(req.user.sub, dto);
  }

  @Post('change-phone/request')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestPhoneChange(@Req() req: any, @Body() dto: RequestPhoneChangeDto) {
    return this.auth.requestPhoneChangeOtp(req.user.sub, dto.newPhone);
  }

  @Post('change-phone/verify')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyPhoneChange(@Req() req: any, @Body() dto: VerifyPhoneChangeDto) {
    return this.auth.changePhone(req.user.sub, dto.newPhone, dto.code);
  }
}
