import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { buildPhlebotomistsWorkbook } from './phlebotomists-export.js';
import { removeAllDeviceTokens } from '../notifications/device-token-store.js';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateEmployeeCode } from '../common/employee-code.js';
import { deletePhlebotomist } from '../phlebotomist/phlebotomist-removal.js';
import { listRatings, ratingStatsFor } from '../phlebotomist/phlebotomist-ratings.js';
import { LabCreatePhlebotomistDto, LabUpdatePhlebotomistDto } from './dto/lab-upsert-phlebotomist.dto.js';

// Same admin-creates-only convention as the central AdminPhlebotomistsController — a lab's own
// phlebotomists never self-register either. Login afterward is the existing phone+OTP flow
// (PhlebotomistAuthGuard, unchanged) — labId just scopes which orders/assignments they can see.
@Controller('lab/phlebotomists')
@UseGuards(LabAuthGuard)
export class LabPhlebotomistsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any) {
    const rows = await this.prisma.phlebotomist.findMany({
      where: { labId: req.lab.labId, deletedAt: null },
      include: { user: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const ratings = await ratingStatsFor(this.prisma, rows.map((p) => p.id));
    return rows.map((p) => ({ ...p, ...(ratings.get(p.id) ?? { rating: null, ratingCount: 0 }) }));
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
    // One mobile number can be both a customer and a phlebotomist: an existing customer account just gets a
    // phlebotomist profile and keeps everything it has (bookings, wallet, family). Only a second profile is refused.
    const existingProfile = existingUser
      ? await this.prisma.phlebotomist.findUnique({ where: { userId: existingUser.id }, select: { id: true, deletedAt: true } })
      : null;
    if (existingProfile && !existingProfile.deletedAt) throw new BadRequestException('This phone number is already a phlebotomist');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { phone: dto.phone },
        // An existing account keeps its role (a customer stays a customer); its name is filled in only if empty.
        update: existingUser?.name ? {} : { name: dto.name },
        create: { phone: dto.phone, name: dto.name, role: 'PHLEBOTOMIST' },
      });
      const details = { labId: req.lab.labId, vehicleType: dto.vehicleType, vehicleNumber: dto.vehicleNumber };
      const include = { user: { select: { phone: true, name: true } } } as const;
      // A deleted phlebotomist added again gets their old profile back (same employee code and history).
      if (existingProfile) {
        return tx.phlebotomist.update({ where: { id: existingProfile.id }, data: { ...details, deletedAt: null, status: 'ACTIVE' }, include });
      }
      return tx.phlebotomist.create({ data: { userId: user.id, employeeCode: await generateEmployeeCode(tx, dto.name), ...details }, include });
    });
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: LabUpdatePhlebotomistDto) {
    const existing = await this.prisma.phlebotomist.findUnique({ where: { id } });
    if (!existing || existing.labId !== req.lab.labId || existing.deletedAt) throw new NotFoundException('Phlebotomist not found');
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

  /** Every rating patients gave this lab's phlebotomist, newest first, with the star breakdown. */
  @Get(':id/ratings')
  async ratings(@Req() req: any, @Param('id') id: string) {
    const p = await this.prisma.phlebotomist.findUnique({ where: { id }, select: { labId: true } });
    if (!p || p.labId !== req.lab.labId) throw new NotFoundException('Phlebotomist not found');
    return listRatings(this.prisma, id);
  }

  /** Soft delete of a phlebotomist of this lab (see deletePhlebotomist). */
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const existing = await this.prisma.phlebotomist.findUnique({ where: { id }, select: { labId: true, deletedAt: true } });
    if (!existing || existing.labId !== req.lab.labId || existing.deletedAt) throw new NotFoundException('Phlebotomist not found');
    return deletePhlebotomist(this.prisma, id);
  }
}
