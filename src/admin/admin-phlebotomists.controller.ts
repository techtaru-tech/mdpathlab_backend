import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { buildPhlebotomistsWorkbook } from '../lab/phlebotomists-export.js';
import { removeAllDeviceTokens } from '../notifications/device-token-store.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateEmployeeCode } from '../common/employee-code.js';
import { CreatePhlebotomistDto, UpdatePhlebotomistDto } from './dto/upsert-phlebotomist.dto.js';

@Controller('admin/phlebotomists')
@UseGuards(AdminAuthGuard)
export class AdminPhlebotomistsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FSD §3.8 — "Track Completion Status per phlebotomist". Computed on the fly from Order data
   * (same "completed collection" definition established for the phlebotomist's own Collection
   * History in Phase 6: HOME, not CANCELLED, handedOverAt set) rather than trusting the dormant
   * Phlebotomist.totalCollections column, which nothing in this codebase ever writes to.
   */
  @Get()
  async list() {
    const [phlebotomists, completions] = await Promise.all([
      this.prisma.phlebotomist.findMany({
        include: { user: { select: { phone: true, name: true } }, lab: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.groupBy({
        by: ['phlebotomistId'],
        where: { phlebotomistId: { not: null }, collectionType: 'HOME', status: { not: 'CANCELLED' }, handedOverAt: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const completedByPhlebotomist = new Map(completions.map((c) => [c.phlebotomistId, c._count._all]));
    const reviews = await this.prisma.review.findMany({
      where: { status: 'APPROVED', order: { phlebotomistId: { not: null } } },
      select: { rating: true, order: { select: { phlebotomistId: true } } },
    });
    const ratingsBy = new Map<string, number[]>();
    for (const r of reviews) {
      const id = r.order.phlebotomistId!;
      ratingsBy.set(id, [...(ratingsBy.get(id) ?? []), r.rating]);
    }
    return phlebotomists.map((p) => {
      const rs = ratingsBy.get(p.id) ?? [];
      const completed = completedByPhlebotomist.get(p.id) ?? 0;
      return {
        ...p,
        completedCollections: completed,
        totalCollections: completed,
        rating: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10 : null,
        ratingCount: rs.length,
      };
    });
  }

  // Admin-created only — matches the FSD: phlebotomists never self-register.
  private async checkLab(labId: string | null | undefined) {
    if (!labId) return;
    const lab = await this.prisma.lab.findUnique({ where: { id: labId }, select: { id: true } });
    if (!lab) throw new BadRequestException('Lab not found');
  }

  @Post()
  async create(@Body() dto: CreatePhlebotomistDto) {
    await this.checkLab(dto.labId);
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
          employeeCode: await generateEmployeeCode(tx, dto.name),
          vehicleType: dto.vehicleType,
          vehicleNumber: dto.vehicleNumber,
          coverageCity: dto.coverageCity,
          labId: dto.labId || null,
        },
        include: { user: { select: { phone: true, name: true } }, lab: { select: { id: true, name: true } } },
      });
    });
  }

  // Excel (.xlsx) of every phlebotomist, with their lab, collections and rating.
  @Get('export')
  async export(@Res() res: Response) {
    const { buffer } = await buildPhlebotomistsWorkbook(this.prisma, null);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="phlebotomists-all-labs-${day}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePhlebotomistDto) {
    const existing = await this.prisma.phlebotomist.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundException('Phlebotomist not found');
    if (dto.labId !== undefined) await this.checkLab(dto.labId);
    const { name, phone, labId, ...rest } = dto;
    if (phone !== undefined) {
      const taken = await this.prisma.user.findUnique({ where: { phone } });
      if (taken && taken.id !== existing.userId) throw new BadRequestException('This phone number is already registered to another user');
    }
    const updated = await this.prisma.phlebotomist.update({
      where: { id },
      data: {
        ...rest,
        ...(labId !== undefined ? { lab: labId ? { connect: { id: labId } } : { disconnect: true } } : {}),
        ...(name !== undefined || phone !== undefined
          ? { user: { update: { ...(name !== undefined ? { name: name.trim() } : {}), ...(phone !== undefined ? { phone } : {}) } } }
          : {}),
      },
      include: { user: { select: { phone: true, name: true } }, lab: { select: { id: true, name: true } } },
    });
    // Deactivated: the phlebotomist app on their phone stops getting pushes.
    if (dto.status === 'INACTIVE') await removeAllDeviceTokens(this.prisma, updated.userId, 'PHLEBOTOMIST');
    return updated;
  }
}
