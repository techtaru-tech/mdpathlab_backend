import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateCollectionCenterDto, UpsertCollectionCenterDto } from './dto/upsert-collection-center.dto.js';

@Controller('admin/collection-centers')
@UseGuards(AdminAuthGuard)
export class AdminCollectionCentersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.collectionCenter.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  create(@Body() dto: UpsertCollectionCenterDto) {
    return this.prisma.collectionCenter.create({ data: dto });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCollectionCenterDto) {
    return this.prisma.collectionCenter.update({ where: { id }, data: dto });
  }
}
