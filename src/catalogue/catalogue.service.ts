import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Parameter, Profile } from '@prisma/client';

// The public "Test" listing is a permanent union of two tables:
//  - Parameter: the 8 pre-existing rows, created before the admin Test/Profile module existed.
//    Live CartItem/OrderItem rows already reference them by id, so they can never be migrated or
//    deactivated — see prisma/schema.prisma's Parameter comment.
//  - Profile: every Test an admin creates going forward, via the Tests module, with real
//    ProfileParameter links for "parameters covered".
// Both are normalized into one shape here so the frontend only needs one Test type, with
// `itemType` distinguishing which table a given row actually lives in for booking purposes.
type ProfileWithParameters = Profile & { parameters: { parameter: Parameter }[] };

function normalizeParameter(p: Parameter) {
  return {
    itemType: 'PARAMETER' as const,
    id: p.id,
    name: p.name,
    slug: p.slug,
    testCode: null,
    shortDescription: p.shortDescription,
    sampleType: null,
    preparationInstructions: null,
    mrp: p.mrp,
    price: p.price,
    sampleCollection: p.sampleCollection,
    reportTimeHours: p.reportTimeHours,
    fastingRequired: p.fastingRequired,
    fastingHours: p.fastingHours,
    tag: p.tag,
    parametersCovered: [] as string[],
    displayParameterCount: p.displayParameterCount,
    createdAt: p.createdAt,
  };
}

function normalizeProfile(p: ProfileWithParameters) {
  const parametersCovered = p.parameters.map((link) => link.parameter.name);
  return {
    itemType: 'PROFILE' as const,
    id: p.id,
    name: p.name,
    slug: p.slug,
    testCode: p.testCode,
    shortDescription: p.shortDescription,
    sampleType: p.sampleType,
    preparationInstructions: p.preparationInstructions,
    mrp: p.mrp,
    price: p.price,
    sampleCollection: p.sampleCollection,
    reportTimeHours: p.reportTimeHours,
    fastingRequired: p.fastingRequired,
    fastingHours: p.fastingHours,
    tag: p.tag,
    parametersCovered,
    displayParameterCount: parametersCovered.length,
    createdAt: p.createdAt,
  };
}

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async listTests() {
    // code:null scopes this to the 8 legacy standalone rows — a Parameter with a code is an
    // atomic marker meant only as a Profile's ProfileParameter component, never independently
    // bookable (see prisma/schema.prisma's Parameter comment).
    const [parameters, profiles] = await Promise.all([
      this.prisma.parameter.findMany({ where: { status: 'ACTIVE', code: null } }),
      this.prisma.profile.findMany({ where: { status: 'ACTIVE' }, include: { parameters: { include: { parameter: true } } } }),
    ]);
    return [...parameters.map(normalizeParameter), ...profiles.map(normalizeProfile)].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async getTest(slug: string) {
    const [parameter, profile] = await Promise.all([
      this.prisma.parameter.findUnique({ where: { slug } }),
      this.prisma.profile.findUnique({ where: { slug }, include: { parameters: { include: { parameter: true } } } }),
    ]);
    if (parameter && !parameter.code) return normalizeParameter(parameter);
    if (profile) return normalizeProfile(profile);
    throw new NotFoundException('Test not found');
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
    return { id: row.id, name: row.name, slug: row.slug, price: row.price, mrp: row.mrp, reportTimeHours: row.reportTimeHours };
  }
}
