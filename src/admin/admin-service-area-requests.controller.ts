import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PincodeNotifyService } from '../pincode-notify/pincode-notify.service.js';
import { DecideServiceAreaRequestDto } from './dto/decide-service-area-request.dto.js';

// Requests from partner labs to start serving a new pincode. Approving adds the pincode to the
// lab's servicePincodes and — same as editing a lab by hand — notifies any customers who were
// waiting on that pincode (see PincodeNotifyService.notifyPendingForPincode).
@Controller('admin/service-area-requests')
@UseGuards(AdminAuthGuard)
export class AdminServiceAreaRequestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pincodeNotify: PincodeNotifyService,
  ) {}

  @Get()
  list() {
    return this.prisma.labServiceAreaRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: { lab: { select: { id: true, name: true, servicePincodes: true } } },
    });
  }

  @Patch(':id')
  async decide(@Param('id') id: string, @Body() dto: DecideServiceAreaRequestDto) {
    const existing = await this.prisma.labServiceAreaRequest.findUnique({ where: { id }, include: { lab: true } });
    if (!existing) throw new NotFoundException('Request not found');
    if (existing.status !== 'PENDING') throw new BadRequestException('This request was already decided');

    if (dto.status === 'APPROVED' && !existing.lab.servicePincodes.includes(existing.pincode)) {
      await this.prisma.lab.update({
        where: { id: existing.labId },
        data: { servicePincodes: { push: existing.pincode } },
      });
    }
    const updated = await this.prisma.labServiceAreaRequest.update({
      where: { id },
      data: { status: dto.status, decidedAt: new Date() },
      include: { lab: { select: { id: true, name: true, servicePincodes: true } } },
    });

    if (dto.status === 'APPROVED') await this.pincodeNotify.notifyPendingForPincode(existing.pincode);
    return updated;
  }
}
