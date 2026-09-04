import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreatePrescriptionDto, fileUrl: string) {
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, userId } });
      if (!order) throw new BadRequestException('Order not found');
    }

    const prescription = await this.prisma.prescription.create({
      data: { userId, orderId: dto.orderId, note: dto.note, fileUrl },
    });

    await this.notifications.notifyAdmins({
      title: 'New prescription uploaded',
      body: dto.note || 'A patient uploaded a prescription for review',
      data: { type: 'PRESCRIPTION_UPLOADED', prescriptionId: prescription.id },
    });

    return prescription;
  }

  listMine(userId: string) {
    return this.prisma.prescription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
