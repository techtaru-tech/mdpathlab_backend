import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { NotificationsService } from '../notifications/notifications.service.js';
import { sampleCollected } from '../phlebotomist/phlebotomist-ratings.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class RatePhlebotomistDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

type RatableOrder = {
  status: string;
  collectionType: string;
  phlebotomistId: string | null;
  collectionOtpVerifiedAt: Date | null;
  handedOverAt: Date | null;
};

/** Whether the patient can rate this booking's phlebotomist now: a home collection whose sample has been taken. */
export function canRatePhlebotomist(order: RatableOrder, alreadyRated: boolean) {
  return !alreadyRated && order.collectionType === 'HOME' && Boolean(order.phlebotomistId) && order.status !== 'CANCELLED' && sampleCollected(order);
}

/**
 * The patient rates the phlebotomist who collected their sample — once per booking, from the moment the sample is
 * taken. The rating shows straight away to the phlebotomist (their app), their lab and admin.
 */
@Injectable()
export class PhlebotomistRatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async rate(userId: string, orderId: string, dto: RatePhlebotomistDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        orderNumber: true,
        status: true,
        collectionType: true,
        phlebotomistId: true,
        collectionOtpVerifiedAt: true,
        handedOverAt: true,
        phlebotomistRating: { select: { id: true } },
      },
    });
    if (!order || order.userId !== userId) throw new NotFoundException('Order not found');
    if (order.phlebotomistRating) throw new ConflictException('You have already rated the phlebotomist for this booking');
    if (order.collectionType !== 'HOME' || !order.phlebotomistId) throw new BadRequestException('This booking has no phlebotomist to rate');
    if (order.status === 'CANCELLED') throw new BadRequestException('This booking is cancelled');
    if (!sampleCollected(order)) throw new BadRequestException('You can rate the phlebotomist once your sample has been collected');

    const comment = dto.comment?.trim() || null;
    const created = await this.prisma.phlebotomistRating
      .create({ data: { orderId, phlebotomistId: order.phlebotomistId, userId, rating: dto.rating, comment } })
      .catch((e: { code?: string }) => {
        // Two submits at once: the unique orderId lets only one through.
        if (e?.code === 'P2002') throw new ConflictException('You have already rated the phlebotomist for this booking');
        throw e;
      });

    await this.notifications.notifyPhlebotomist(order.phlebotomistId, {
      title: `You got a ${dto.rating}★ rating`,
      body: comment ? `Order ${order.orderNumber}: "${comment.slice(0, 120)}"` : `Order ${order.orderNumber}`,
      data: { type: 'PHLEBOTOMIST_RATING', orderId, rating: String(dto.rating) },
    });
    return { id: created.id, rating: created.rating, comment: created.comment, createdAt: created.createdAt };
  }
}
