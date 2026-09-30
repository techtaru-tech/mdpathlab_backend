import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateLabServiceAreaRequestDto } from './dto/lab-service-area-request.dto.js';

// A lab can't edit its own servicePincodes (admin owns that list) — it asks for a new pincode
// here, and an admin approves or rejects it from Service-Area Requests.
@Controller('lab/service-areas')
@UseGuards(LabAuthGuard)
export class LabServiceAreasController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async get(@Req() req: any) {
    const [lab, requests] = await Promise.all([
      this.prisma.lab.findUnique({ where: { id: req.lab.labId }, select: { servicePincodes: true } }),
      this.prisma.labServiceAreaRequest.findMany({ where: { labId: req.lab.labId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { servicePincodes: lab?.servicePincodes ?? [], requests };
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateLabServiceAreaRequestDto) {
    const lab = await this.prisma.lab.findUnique({ where: { id: req.lab.labId } });
    if (!lab) throw new BadRequestException('Lab not found');
    if (lab.servicePincodes.includes(dto.pincode)) {
      throw new BadRequestException('You already serve this pincode');
    }
    const pending = await this.prisma.labServiceAreaRequest.findFirst({
      where: { labId: lab.id, pincode: dto.pincode, status: 'PENDING' },
    });
    if (pending) throw new BadRequestException('You already have a pending request for this pincode');

    const request = await this.prisma.labServiceAreaRequest.create({
      data: { labId: lab.id, pincode: dto.pincode, note: dto.note?.trim() || null },
    });

    await this.notifications.notifyAdmins({
      title: 'New service-area request',
      body: `${lab.name} wants to start service at pincode ${dto.pincode}`,
      data: { type: 'LAB_SERVICE_AREA_REQUEST', requestId: request.id },
    });
    return request;
  }
}
