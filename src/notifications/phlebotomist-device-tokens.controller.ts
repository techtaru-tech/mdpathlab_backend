import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto.js';

@Controller('phlebotomist/notifications/device-token')
@UseGuards(PhlebotomistAuthGuard)
export class PhlebotomistDeviceTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async register(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { token: dto.token, platform: dto.platform ?? 'WEB', userId: req.phlebotomist.sub },
      update: { userId: req.phlebotomist.sub, adminUserId: null, platform: dto.platform ?? 'WEB' },
    });
    return { ok: true };
  }

  @Delete()
  async unregister(@Body() dto: RegisterDeviceTokenDto) {
    await this.prisma.deviceToken.deleteMany({ where: { token: dto.token } });
    return { ok: true };
  }
}
