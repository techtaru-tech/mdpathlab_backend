import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('slots')
class SlotsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.slot.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }
}

@Module({ controllers: [SlotsController] })
export class SlotsModule {}
