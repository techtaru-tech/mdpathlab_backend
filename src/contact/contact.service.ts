import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateContactQueryDto } from './dto/create-contact-query.dto.js';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateContactQueryDto) {
    const query = await this.prisma.contactQuery.create({
      data: { name: dto.name, phone: dto.phone, email: dto.email, message: dto.message },
    });

    await this.notifications.notifyAdmins({
      title: 'New contact query',
      body: `${dto.name} — ${dto.message.slice(0, 80)}`,
      data: { type: 'CONTACT_QUERY', queryId: query.id },
    });

    return query;
  }
}
