import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UpdatePrescriptionStatusDto } from './dto/update-prescription-status.dto.js';
import { ReassignPrescriptionLabDto } from './dto/reassign-prescription-lab.dto.js';

@Controller('admin/prescriptions')
@UseGuards(AdminAuthGuard)
export class AdminPrescriptionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  list() {
    return this.prisma.prescription.findMany({
      include: { user: { select: { name: true, phone: true } }, order: { select: { id: true } }, lab: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Patch(':id')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdatePrescriptionStatusDto) {
    const existing = await this.prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Prescription not found');
    const updated = await this.prisma.prescription.update({
      where: { id },
      data: { status: dto.status, ...(dto.adminNote !== undefined ? { adminNote: dto.adminNote } : {}) },
    });

    if (dto.status === 'REVIEWED' && existing.status !== 'REVIEWED') {
      await this.notifications.notifyUser(updated.userId, {
        title: 'Your prescription has been reviewed',
        body: dto.adminNote || 'Our team has reviewed your uploaded prescription',
        data: { type: 'PRESCRIPTION_REVIEWED', prescriptionId: updated.id },
      });
    }

    return updated;
  }

  // Manual escape hatch for "the assigned lab can't process this one" — reassigns to a different
  // lab and resets the review state, so it lands fresh in the new lab's queue exactly like a
  // brand-new upload (any recommendations the first lab made no longer apply).
  @Patch(':id/reassign-lab')
  async reassignLab(@Param('id') id: string, @Body() dto: ReassignPrescriptionLabDto) {
    const existing = await this.prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Prescription not found');
    const lab = await this.prisma.lab.findUnique({ where: { id: dto.labId } });
    if (!lab) throw new BadRequestException('Lab not found');

    await this.prisma.$transaction([
      this.prisma.prescriptionRecommendedTest.deleteMany({ where: { prescriptionId: id } }),
      this.prisma.prescription.update({
        where: { id },
        data: { labId: dto.labId, labStage: 'UPLOADED', clarificationNote: null, patientReply: null, reviewedAt: null, confirmedAt: null },
      }),
    ]);

    return this.prisma.prescription.findUnique({
      where: { id },
      include: { user: { select: { name: true, phone: true } }, order: { select: { id: true } }, lab: { select: { id: true, name: true } } },
    });
  }
}
