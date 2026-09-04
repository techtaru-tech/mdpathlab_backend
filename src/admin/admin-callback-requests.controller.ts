import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateCallbackRequestStatusDto } from './dto/update-callback-request-status.dto.js';

@Controller('admin/callback-requests')
@UseGuards(AdminAuthGuard)
export class AdminCallbackRequestsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.callbackRequest.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Patch(':id')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateCallbackRequestStatusDto) {
    const existing = await this.prisma.callbackRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Callback request not found');
    return this.prisma.callbackRequest.update({ where: { id }, data: { status: dto.status } });
  }
}
