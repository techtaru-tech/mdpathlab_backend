import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateContactQueryStatusDto } from './dto/update-contact-query-status.dto.js';

@Controller('admin/contact-queries')
@UseGuards(AdminAuthGuard)
export class AdminContactQueriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.contactQuery.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Patch(':id')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateContactQueryStatusDto) {
    const existing = await this.prisma.contactQuery.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Query not found');
    return this.prisma.contactQuery.update({ where: { id }, data: { status: dto.status } });
  }
}
