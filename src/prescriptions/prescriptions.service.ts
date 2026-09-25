import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LabsService } from '../labs/labs.service.js';
import { CreatePrescriptionDto } from './dto/create-prescription.dto.js';
import { ConfirmPrescriptionTestsDto } from './dto/confirm-prescription-tests.dto.js';
import { PrescriptionClarificationReplyDto } from './dto/prescription-clarification-reply.dto.js';

const recommendedTestsInclude = { recommendedTests: { orderBy: { createdAt: 'asc' as const } }, lab: { select: { id: true, name: true } } };

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly labs: LabsService,
  ) {}

  async create(userId: string, dto: CreatePrescriptionDto, fileUrl: string) {
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({ where: { id: dto.orderId, userId } });
      if (!order) throw new BadRequestException('Order not found');
    }

    // Best-effort routing — the tests aren't known yet at upload time (a doctor/admin picks
    // them after reviewing the prescription), so this matches by pincode only, same degenerate
    // case orders.service.ts relies on when it calls findMatchingLab with no items.
    const matchedLab = dto.pincode ? await this.labs.findMatchingLab(dto.pincode) : null;

    const prescription = await this.prisma.prescription.create({
      data: {
        userId,
        orderId: dto.orderId,
        note: dto.note,
        fileUrl,
        pincode: dto.pincode,
        labId: matchedLab?.id,
        labStage: matchedLab ? 'UPLOADED' : undefined,
      },
    });

    await this.notifications.notifyAdmins({
      title: 'New prescription uploaded',
      body: dto.note || 'A patient uploaded a prescription for review',
      data: { type: 'PRESCRIPTION_UPLOADED', prescriptionId: prescription.id },
    });

    return prescription;
  }

  listMine(userId: string) {
    return this.prisma.prescription.findMany({
      where: { userId },
      include: recommendedTestsInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(userId: string, id: string) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id }, include: recommendedTestsInclude });
    if (!prescription || prescription.userId !== userId) throw new NotFoundException('Prescription not found');
    return prescription;
  }

  // The patient picks which of the lab's recommended (available) tests to actually book — every
  // available test defaults to selected (the doctor recommended it), so this only needs to
  // record deselections plus re-selections, not build the set from scratch.
  async confirmTests(userId: string, id: string, dto: ConfirmPrescriptionTestsDto) {
    const prescription = await this.getOne(userId, id);
    if (prescription.labStage !== 'REVIEWED' && prescription.labStage !== 'READY_FOR_BOOKING') {
      throw new BadRequestException('This prescription is not ready for test selection yet');
    }

    const byId = new Map(prescription.recommendedTests.map((t) => [t.id, t]));
    for (const selection of dto.selections) {
      const row = byId.get(selection.recommendedTestId);
      if (!row) throw new BadRequestException('Unknown recommended test');
      if (!row.available && selection.selected) {
        throw new BadRequestException(`${row.name} is not available at this lab and can't be selected`);
      }
    }

    await this.prisma.$transaction(
      dto.selections.map((s) =>
        this.prisma.prescriptionRecommendedTest.update({ where: { id: s.recommendedTestId }, data: { selected: s.selected } }),
      ),
    );

    await this.prisma.prescription.update({
      where: { id },
      data: { labStage: 'READY_FOR_BOOKING', confirmedAt: new Date() },
    });

    return this.getOne(userId, id);
  }

  async replyClarification(userId: string, id: string, dto: PrescriptionClarificationReplyDto) {
    const prescription = await this.getOne(userId, id);
    if (prescription.labStage !== 'ACTION_REQUIRED') {
      throw new BadRequestException('No clarification is pending on this prescription');
    }
    await this.prisma.prescription.update({
      where: { id },
      data: { patientReply: dto.reply, labStage: 'UNDER_REVIEW' },
    });
    return this.getOne(userId, id);
  }
}
