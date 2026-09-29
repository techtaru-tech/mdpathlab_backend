import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

class UpsertFaqDto {
  @IsString()
  @MinLength(1)
  topic!: string;

  @IsString()
  @MinLength(1)
  question!: string;

  @IsString()
  @MinLength(1)
  answer!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

@Controller('admin/faq')
@UseGuards(AdminAuthGuard)
export class AdminFaqController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.faq.findMany({ orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }] });
  }

  @Post()
  create(@Body() dto: UpsertFaqDto) {
    return this.prisma.faq.create({ data: dto });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertFaqDto) {
    return this.prisma.faq.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.faq.delete({ where: { id } });
    return { deleted: true };
  }
}
