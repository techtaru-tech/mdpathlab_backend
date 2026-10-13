import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { PhlebotomistAuthGuard } from '../auth/phlebotomist-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto.js';
import { removeOwnDeviceToken, saveDeviceToken } from './device-token-store.js';

@Controller('phlebotomist/notifications/device-token')
@UseGuards(PhlebotomistAuthGuard)
export class PhlebotomistDeviceTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async register(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    await saveDeviceToken(this.prisma, req.phlebotomist.sub, 'PHLEBOTOMIST', dto.token, dto.platform ?? 'WEB');
    return { ok: true };
  }

  // Logout: removes the token only if it belongs to the caller — nobody can switch off someone else's pushes.
  @Delete()
  async unregister(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    const removed = await removeOwnDeviceToken(this.prisma, req.phlebotomist.sub, dto.token);
    return { ok: true, removed: removed > 0 };
  }
}
