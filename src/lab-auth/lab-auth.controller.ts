import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LabAuthService } from './lab-auth.service.js';
import { LabLoginDto } from './dto/lab-login.dto.js';
import { LabAuthGuard } from './lab-auth.guard.js';

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
}
