import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LabCreatePhlebotomistDto, LabUpdatePhlebotomistDto } from './dto/lab-upsert-phlebotomist.dto.js';

// Same admin-creates-only convention as the central AdminPhlebotomistsController — a lab's own
// phlebotomists never self-register either. Login afterward is the existing phone+OTP flow
// (PhlebotomistAuthGuard, unchanged) — labId just scopes which orders/assignments they can see.
@Controller('lab/phlebotomists')
@UseGuards(LabAuthGuard)
export class LabPhlebotomistsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: any) {
    return this.prisma.phlebotomist.findMany({
      where: { labId: req.lab.labId },
      include: { user: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Req() req: any, @Body() dto: LabCreatePhlebotomistDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existingUser?.role === 'PATIENT') {
      throw new BadRequestException('This phone number is already registered as a patient');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { phone: dto.phone },
        update: { name: dto.name, role: 'PHLEBOTOMIST' },
        create: { phone: dto.phone, name: dto.name, role: 'PHLEBOTOMIST' },
      });
      return tx.phlebotomist.create({
        data: {
          userId: user.id,
          labId: req.lab.labId,
          employeeCode: dto.employeeCode,
          vehicleType: dto.vehicleType,
          vehicleNumber: dto.vehicleNumber,
        },
        include: { user: { select: { phone: true, name: true } } },
      });
    });
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: LabUpdatePhlebotomistDto) {
    const existing = await this.prisma.phlebotomist.findUnique({ where: { id } });
    if (!existing || existing.labId !== req.lab.labId) throw new NotFoundException('Phlebotomist not found');
    return this.prisma.phlebotomist.update({ where: { id }, data: dto });
  }
}
