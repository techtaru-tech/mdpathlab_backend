import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Public, read-only view of the same CollectionCenter rows the admin module manages —
// deliberately no separate model/table, just a patient-facing projection of real data.
@Controller('collection-centers')
export class CollectionCentersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.collectionCenter.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, address: true, phone: true, lat: true, lng: true },
      orderBy: { name: 'asc' },
    });
  }
}
