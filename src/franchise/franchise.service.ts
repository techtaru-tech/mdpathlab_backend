import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateFranchiseInquiryDto } from './dto/create-franchise-inquiry.dto.js';

@Injectable()
export class FranchiseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateFranchiseInquiryDto) {
    const inquiry = await this.prisma.franchiseInquiry.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        city: dto.city,
        investmentCapacity: dto.investmentCapacity,
        message: dto.message,
      },
    });

    await this.notifications.notifyAdmins({
      title: 'New franchise inquiry',
      body: `${dto.name} — ${dto.city} (${dto.investmentCapacity})`,
      data: { type: 'FRANCHISE_INQUIRY', inquiryId: inquiry.id },
    });

    return inquiry;
  }
}
