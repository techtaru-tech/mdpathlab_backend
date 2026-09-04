import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto.js';

@Controller('notifications/device-token')
@UseGuards(JwtAuthGuard)
export class DeviceTokensController {
  constructor(private readonly prisma: PrismaService) {}

  // upsert by token — the same browser re-registering (e.g. on every login) just refreshes
  // ownership and updatedAt rather than erroring or duplicating.
  @Post()
  async register(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { token: dto.token, platform: dto.platform ?? 'WEB', userId: req.user.sub },
      update: { userId: req.user.sub, adminUserId: null, platform: dto.platform ?? 'WEB' },
    });
    return { ok: true };
  }

  @Delete()
  async unregister(@Body() dto: RegisterDeviceTokenDto) {
    await this.prisma.deviceToken.deleteMany({ where: { token: dto.token } });
    return { ok: true };
  }
}
