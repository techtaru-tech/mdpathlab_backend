import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LabAuthService } from './lab-auth.service.js';
import { LabLoginDto } from './dto/lab-login.dto.js';
import { LabAuthGuard } from './lab-auth.guard.js';
import { LabLocationDto } from './dto/lab-location.dto.js';

@Controller('lab/auth')
export class LabAuthController {
  constructor(private readonly labAuth: LabAuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LabLoginDto) {
    return this.labAuth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(LabAuthGuard)
  me(@Req() req: any) {
    return this.labAuth.me(req.lab.sub);
  }

  // The lab's own map pin: { lat, lng } (both null removes it). Used for the additional collection charge.
  @Patch('me/location')
  @UseGuards(LabAuthGuard)
  setLocation(@Req() req: any, @Body() dto: LabLocationDto) {
    return this.labAuth.setLocation(req.lab.sub, dto.lat ?? null, dto.lng ?? null);
  }
}
