import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePhlebotomistDto, UpdatePhlebotomistDto } from './dto/upsert-phlebotomist.dto.js';

@Controller('admin/phlebotomists')
@UseGuards(AdminAuthGuard)
export class AdminPhlebotomistsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.phlebotomist.findMany({
      include: { user: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
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
          employeeCode: dto.employeeCode,
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
