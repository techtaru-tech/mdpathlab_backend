import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type ItemRef = { itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE'; itemId: string };

@Injectable()
export class LabsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds the (first, ACTIVE) Lab whose servicePincodes includes `pincode` and whose
   * LabCatalogueItem rows cover every item in `items` — the single source of truth for both the
   * public serviceability check and checkout's routing, so they can never disagree. With no
   * items given, only the pincode itself is checked (see CheckServiceabilityDto).
   */
  async findMatchingLab(pincode: string, items: ItemRef[] = []) {
    const candidates = await this.prisma.lab.findMany({
      where: { status: 'ACTIVE', servicePincodes: { has: pincode } },
      include: { catalogueItems: true },
    });

    if (items.length === 0) return candidates[0] ?? null;

    for (const lab of candidates) {
      const offered = new Set(lab.catalogueItems.map((ci) => `${ci.itemType}:${ci.itemId}`));
      const coversAll = items.every((item) => offered.has(`${item.itemType}:${item.itemId}`));
      if (coversAll) return lab;
    }
    return null;
  }

  async checkServiceability(pincode: string, items: ItemRef[] = []) {
    const lab = await this.findMatchingLab(pincode, items);
    return { available: Boolean(lab), labId: lab?.id ?? null };
  }
}
