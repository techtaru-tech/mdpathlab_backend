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
}
