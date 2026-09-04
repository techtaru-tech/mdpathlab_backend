import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDeviceTokenDto } from '../notifications/dto/register-device-token.dto.js';

@Controller('admin/notifications/device-token')
@UseGuards(AdminAuthGuard)
export class AdminDeviceTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async register(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { token: dto.token, platform: dto.platform ?? 'WEB', adminUserId: req.admin.sub },
      update: { adminUserId: req.admin.sub, userId: null, platform: dto.platform ?? 'WEB' },
    });
    return { ok: true };
  }

  @Delete()
  async unregister(@Body() dto: RegisterDeviceTokenDto) {
    await this.prisma.deviceToken.deleteMany({ where: { token: dto.token } });
    return { ok: true };
  }
}
