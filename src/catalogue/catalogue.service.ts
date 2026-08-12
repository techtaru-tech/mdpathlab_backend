import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  listTests() {
    return this.prisma.parameter.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTest(slug: string) {
    const test = await this.prisma.parameter.findUnique({ where: { slug } });
    if (!test) throw new NotFoundException('Test not found');
    return test;
  }

  listPackages() {
    return this.prisma.package.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { parameter: true, profile: true } } },
    });
  }

  async getPackage(slug: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { slug },
      include: { items: { include: { parameter: true, profile: true } } },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  /**
   * Resolves a bookable item's current name/price/mrp/status by id, regardless of which table
   * it lives in. Used by Cart and Orders so a price is always read fresh from the catalogue —
   * never trusted from client input.
   */
  async resolveItem(itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE', itemId: string) {
    const row =
      itemType === 'PARAMETER'
        ? await this.prisma.parameter.findUnique({ where: { id: itemId } })
        : itemType === 'PROFILE'
          ? await this.prisma.profile.findUnique({ where: { id: itemId } })
          : await this.prisma.package.findUnique({ where: { id: itemId } });

    if (!row || row.status !== 'ACTIVE') {
      throw new NotFoundException('Item not found or no longer available');
    }
    return { id: row.id, name: row.name, price: row.price, mrp: row.mrp };
  }
}
