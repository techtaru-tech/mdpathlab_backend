import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listApproved() {
    const rows = await this.prisma.review.findMany({
      where: { status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        user: { select: { name: true, city: true } },
        order: { select: { items: { select: { itemName: true }, take: 1 } } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewerName: r.user.name ?? 'Verified Customer',
      city: r.user.city,
      packageName: r.order.items[0]?.itemName ?? null,
    }));
  }

  // Only the order's own patient can rate it, and only once the report is ready — matches the
  // patient-facing status timeline's terminal "done" state (FSD §1.1.3.2).
  async submit(userId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, userId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'REPORT_READY') {
      throw new BadRequestException('You can rate this booking once the report is ready');
    }

    const existing = await this.prisma.review.findUnique({ where: { orderId: dto.orderId } });
    if (existing) throw new ConflictException('You have already rated this booking');

    return this.prisma.review.create({
      data: { orderId: dto.orderId, userId, rating: dto.rating, comment: dto.comment },
    });
  }
}
