import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

class UpdatePatientStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}

@Controller('admin/patients')
@UseGuards(AdminAuthGuard)
export class AdminPatientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('search') search?: string) {
    return this.prisma.user.findMany({
      where: {
        role: 'PATIENT',
        ...(search ? { OR: [{ phone: { contains: search } }, { name: { contains: search, mode: 'insensitive' } }] } : {}),
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        _count: { select: { familyMembers: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { familyMembers: true, addresses: true, orders: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdatePatientStatusDto) {
    return this.prisma.user.update({ where: { id }, data: { status: dto.status } });
  }
}
