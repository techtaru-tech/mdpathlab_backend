import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateFranchiseInquiryStatusDto } from './dto/update-franchise-inquiry-status.dto.js';

@Controller('admin/franchise-inquiries')
@UseGuards(AdminAuthGuard)
export class AdminFranchiseInquiriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.franchiseInquiry.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Patch(':id')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateFranchiseInquiryStatusDto) {
    const existing = await this.prisma.franchiseInquiry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Inquiry not found');
    return this.prisma.franchiseInquiry.update({ where: { id }, data: { status: dto.status } });
  }
}
