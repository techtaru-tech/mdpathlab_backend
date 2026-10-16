import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { buildPhlebotomistsWorkbook } from './phlebotomists-export.js';
import { removeAllDeviceTokens } from '../notifications/device-token-store.js';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateEmployeeCode } from '../common/employee-code.js';
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

  // Excel (.xlsx) of this lab's phlebotomists with their collections and ratings.
  @Get('export')
  async export(@Req() req: any, @Res() res: Response) {
    const { buffer, labName } = await buildPhlebotomistsWorkbook(this.prisma, req.lab.labId);
    const day = new Date().toISOString().slice(0, 10);
    const safe = labName.replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'lab';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="phlebotomists-${safe}-${day}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
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
          employeeCode: await generateEmployeeCode(tx, dto.name),
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
    const { name, phone, ...rest } = dto;

    // The phone is their login, so it can only move to a number nobody else is using.
    if (phone !== undefined) {
      const taken = await this.prisma.user.findUnique({ where: { phone } });
      if (taken && taken.id !== existing.userId) throw new BadRequestException('This phone number is already registered to another user');
    }

    const updated = await this.prisma.phlebotomist.update({
      where: { id },
      data: {
        ...rest,
        ...(name !== undefined || phone !== undefined
          ? { user: { update: { ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}) } } }
          : {}),
      },
      include: { user: { select: { phone: true, name: true } } },
    });
    if (updated.status === 'INACTIVE') await removeAllDeviceTokens(this.prisma, updated.userId, 'PHLEBOTOMIST');
    return updated;
  }
}
