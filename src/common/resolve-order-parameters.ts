import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Every Parameter id an order's items actually require a result for — a PARAMETER item IS a
 * parameter directly; a PROFILE item expands via ProfileParameter; a PACKAGE item expands via
 * PackageItem, which is itself either a PARAMETER or a PROFILE. Shared by the lab's own result
 * entry (LabResultsService), admin's read-only view of those values (AdminResultsController),
 * and the auto-generated report (ReportGeneratorService) so the three can never disagree about
 * what "every parameter this order needs" means.
 */
export async function resolveOrderParameterIds(prisma: PrismaService | PrismaClient, orderId: string): Promise<Set<string>> {
  const items = await prisma.orderItem.findMany({ where: { orderId } });
  const parameterIds = new Set<string>();

  for (const item of items) {
    if (item.itemType === 'PARAMETER') {
      parameterIds.add(item.itemId);
    } else if (item.itemType === 'PROFILE') {
      const links = await prisma.profileParameter.findMany({ where: { profileId: item.itemId } });
      for (const link of links) parameterIds.add(link.parameterId);
    } else if (item.itemType === 'PACKAGE') {
      const pkgItems = await prisma.packageItem.findMany({ where: { packageId: item.itemId } });
      for (const pkgItem of pkgItems) {
        if (pkgItem.itemType === 'PARAMETER' && pkgItem.parameterId) {
          parameterIds.add(pkgItem.parameterId);
        } else if (pkgItem.itemType === 'PROFILE' && pkgItem.profileId) {
          const links = await prisma.profileParameter.findMany({ where: { profileId: pkgItem.profileId } });
          for (const link of links) parameterIds.add(link.parameterId);
        }
      }
    }
  }

  return parameterIds;
}
