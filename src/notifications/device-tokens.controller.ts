import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto.js';
import { removeOwnDeviceToken, saveDeviceToken } from './device-token-store.js';

@Controller('notifications/device-token')
@UseGuards(JwtAuthGuard)
export class DeviceTokensController {
  constructor(private readonly prisma: PrismaService) {}

  // upsert by token — the same browser re-registering (e.g. on every login) just refreshes
  // ownership and updatedAt rather than erroring or duplicating.
  @Post()
  async register(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    await saveDeviceToken(this.prisma, req.user.sub, 'CUSTOMER', dto.token, dto.platform ?? 'WEB');
    return { ok: true };
  }

  // Logout: removes the token only if it belongs to the caller — nobody can switch off someone else's pushes.
  @Delete()
  async unregister(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    const removed = await removeOwnDeviceToken(this.prisma, req.user.sub, dto.token);
    return { ok: true, removed: removed > 0 };
  }
}
