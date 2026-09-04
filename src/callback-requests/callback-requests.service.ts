import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateCallbackRequestDto } from './dto/create-callback-request.dto.js';

@Injectable()
export class CallbackRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateCallbackRequestDto) {
    const request = await this.prisma.callbackRequest.create({ data: { phone: dto.phone } });

    await this.notifications.notifyAdmins({
      title: 'New callback request',
      body: `${dto.phone} requested a callback`,
      data: { type: 'CALLBACK_REQUEST', requestId: request.id },
    });

    return request;
  }
}
