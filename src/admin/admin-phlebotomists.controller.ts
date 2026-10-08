import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
        include: { user: { select: { phone: true, name: true } } },
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
  @Post()
  async create(@Body() dto: CreatePhlebotomistDto) {
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
        },
        include: { user: { select: { phone: true, name: true } } },
      });
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePhlebotomistDto) {
    return this.prisma.phlebotomist.update({ where: { id }, data: dto });
  }
}
