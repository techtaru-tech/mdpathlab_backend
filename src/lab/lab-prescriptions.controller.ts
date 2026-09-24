import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Prescriptions auto-routed to this lab by pincode at upload time (see
// PrescriptionsService.create) — read-only here, since tests/packages still get picked and
// approved by admin the same way as before; this just gives the lab visibility that one landed
// in their area.
@Controller('lab/prescriptions')
@UseGuards(LabAuthGuard)
export class LabPrescriptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() req: any) {
    return this.prisma.prescription.findMany({
      where: { labId: req.lab.labId },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
