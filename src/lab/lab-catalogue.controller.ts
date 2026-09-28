import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { LabAuthGuard } from '../lab-auth/lab-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetOwnLabCatalogueDto } from './dto/set-lab-catalogue.dto.js';

// Lets a lab manage its own "which tests/packages/parameters can we actually fulfill" list —
// the same data admin can set from /admin/labs/:id/catalogue, just self-scoped from the lab's
// own token instead of an admin picking an id. Both write the same LabCatalogueItem rows.
@Controller('lab/catalogue')
@UseGuards(LabAuthGuard)
export class LabCatalogueController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@Req() req: any) {
    const [parameters, profiles, packages, radiologyTests, selected] = await Promise.all([
      this.prisma.parameter.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
      this.prisma.profile.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
      this.prisma.package.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
      this.prisma.radiologyTest.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
      this.prisma.labCatalogueItem.findMany({ where: { labId: req.lab.labId } }),
    ]);

    return {
      available: [
        ...profiles.map((p) => ({ itemType: 'PROFILE' as const, itemId: p.id, name: p.name })),
        ...packages.map((p) => ({ itemType: 'PACKAGE' as const, itemId: p.id, name: p.name })),
        ...parameters.map((p) => ({ itemType: 'PARAMETER' as const, itemId: p.id, name: p.name })),
        ...radiologyTests.map((p) => ({ itemType: 'RADIOLOGY' as const, itemId: p.id, name: p.name })),
      ],
      selected: selected.map((s) => ({ itemType: s.itemType, itemId: s.itemId })),
    };
  }

  // "Sync" write, same deleteMany+create pattern as CityPrice/ProfileParameter and the admin
  // version of this same endpoint — the lab submits its full current set, not incremental calls.
  @Patch()
  async set(@Req() req: any, @Body() dto: SetOwnLabCatalogueDto) {
    const labId = req.lab.labId;
    await this.prisma.$transaction([
      this.prisma.labCatalogueItem.deleteMany({ where: { labId } }),
      ...(dto.items.length
        ? [
            this.prisma.labCatalogueItem.createMany({
              data: dto.items.map((item) => ({ labId, itemType: item.itemType, itemId: item.itemId })),
            }),
          ]
        : []),
    ]);
    return this.prisma.labCatalogueItem.findMany({ where: { labId } });
  }
}
