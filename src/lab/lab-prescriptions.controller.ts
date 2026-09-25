import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Put, Patch, Req, UseGuards } from '@nestjs/common';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecommendPrescriptionTestsDto } from './dto/recommend-prescription-tests.dto.js';
import { PrescriptionActionRequiredDto } from './dto/prescription-action-required.dto.js';

const patientSelect = { select: { name: true, phone: true, email: true, gender: true, dob: true, city: true } };

// Prescriptions auto-routed to this lab by pincode at upload time (see
// PrescriptionsService.create). The lab manually reads the prescription image and picks
// matching tests from its own catalogue — nothing here auto-suggests tests beyond what the lab
// explicitly selects, per the product requirement that recommendations only ever reflect what a
// human at the lab actually read off the prescription.
@Controller('lab/prescriptions')
@UseGuards(LabAuthGuard)
export class LabPrescriptionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  list(@Req() req: any) {
    return this.prisma.prescription.findMany({
      where: { labId: req.lab.labId },
      include: { user: patientSelect, recommendedTests: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { user: patientSelect, recommendedTests: { orderBy: { createdAt: 'asc' } } },
    });
    if (!prescription || prescription.labId !== req.lab.labId) throw new NotFoundException('Prescription not found');

    // Opening it for the first time starts the review clock — matches the "Under Lab Review"
    // stage the product spec calls for, without needing a separate explicit action from staff.
    if (prescription.labStage === 'UPLOADED') {
      await this.prisma.prescription.update({ where: { id }, data: { labStage: 'UNDER_REVIEW' } });
      prescription.labStage = 'UNDER_REVIEW';
    }
    return prescription;
  }

  // The lab's own available catalogue (same list `/lab/catalogue` already exposes) — kept here
  // too so the prescription-review screen can offer a search/picker without a second round trip
  // through a different controller for the same lab-scoped data.
  @Get('catalogue/searchable')
  async searchableCatalogue(@Req() req: any) {
    const selected = await this.prisma.labCatalogueItem.findMany({ where: { labId: req.lab.labId } });
    const byType = { PARAMETER: [] as string[], PROFILE: [] as string[], PACKAGE: [] as string[] };
    for (const s of selected) byType[s.itemType].push(s.itemId);

    const [parameters, profiles, packages] = await Promise.all([
      this.prisma.parameter.findMany({ where: { id: { in: byType.PARAMETER }, status: 'ACTIVE' } }),
      this.prisma.profile.findMany({ where: { id: { in: byType.PROFILE }, status: 'ACTIVE' } }),
      this.prisma.package.findMany({ where: { id: { in: byType.PACKAGE }, status: 'ACTIVE' } }),
    ]);

    return [
      ...parameters.map((p) => ({ itemType: 'PARAMETER' as const, itemId: p.id, name: p.name, shortDescription: p.shortDescription, price: p.price, mrp: p.mrp })),
      ...profiles.map((p) => ({ itemType: 'PROFILE' as const, itemId: p.id, name: p.name, shortDescription: p.shortDescription, price: p.price, mrp: p.mrp })),
      ...packages.map((p) => ({ itemType: 'PACKAGE' as const, itemId: p.id, name: p.name, shortDescription: p.subtitle, price: p.price, mrp: p.mrp })),
    ].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Submits the lab's full read of the prescription — every test it identified, each either
  // resolved as available (with a fresh price snapshot) or explicitly marked unavailable.
  // Sync pattern (deleteMany + createMany), same as LabCatalogueItem.
  @Put(':id/recommended-tests')
  async recommend(@Req() req: any, @Param('id') id: string, @Body() dto: RecommendPrescriptionTestsDto) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id } });
    if (!prescription || prescription.labId !== req.lab.labId) throw new NotFoundException('Prescription not found');

    const rows = await Promise.all(
      dto.items.map(async (item) => {
        const row =
          item.itemType === 'PARAMETER'
            ? await this.prisma.parameter.findUnique({ where: { id: item.itemId } })
            : item.itemType === 'PROFILE'
              ? await this.prisma.profile.findUnique({ where: { id: item.itemId } })
              : await this.prisma.package.findUnique({ where: { id: item.itemId } });
        if (!row) throw new BadRequestException(`Item ${item.itemId} not found`);

        const available = item.available ?? true;
        return {
          itemType: item.itemType,
          itemId: item.itemId,
          name: row.name,
          shortDescription: 'shortDescription' in row ? row.shortDescription : 'subtitle' in row ? row.subtitle : null,
          price: available ? row.price : 0,
          mrp: available ? row.mrp : 0,
          available,
          unavailableNote: available ? null : (item.unavailableNote ?? null),
        };
      }),
    );

    await this.prisma.$transaction([
      this.prisma.prescriptionRecommendedTest.deleteMany({ where: { prescriptionId: id } }),
      this.prisma.prescriptionRecommendedTest.createMany({ data: rows.map((r) => ({ ...r, prescriptionId: id })) }),
      this.prisma.prescription.update({
        where: { id },
        data: { labStage: 'REVIEWED', status: 'REVIEWED', reviewedAt: new Date() },
      }),
    ]);

    await this.notifications.notifyUser(prescription.userId, {
      title: 'Your prescription has been reviewed',
      body: 'Take a look at the recommended tests and confirm your booking',
      data: { type: 'PRESCRIPTION_REVIEWED', prescriptionId: id },
    });

    return this.getOne(req, id);
  }

  @Patch(':id/action-required')
  async requestClarification(@Req() req: any, @Param('id') id: string, @Body() dto: PrescriptionActionRequiredDto) {
    const prescription = await this.prisma.prescription.findUnique({ where: { id } });
    if (!prescription || prescription.labId !== req.lab.labId) throw new NotFoundException('Prescription not found');

    const updated = await this.prisma.prescription.update({
      where: { id },
      data: { labStage: 'ACTION_REQUIRED', clarificationNote: dto.note },
    });

    await this.notifications.notifyUser(prescription.userId, {
      title: 'Action needed on your prescription',
      body: dto.note,
      data: { type: 'PRESCRIPTION_ACTION_REQUIRED', prescriptionId: id },
    });

    return updated;
  }
}
