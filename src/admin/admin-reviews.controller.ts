import { Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto.js';

@Controller('admin/reviews')
@UseGuards(AdminAuthGuard)
export class AdminReviewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.review.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, phone: true } },
        order: { select: { orderNumber: true } },
      },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateReviewStatusDto) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');

    return this.prisma.review.update({ where: { id }, data: { status: dto.status } });
  }
}
