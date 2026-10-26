import type { Prisma } from '@prisma/client';

export type AdminActor = { sub: string; email: string };

/**
 * One append-only AdminAuditLog row per admin action on the referral-partner screens. `before`/`after` carry
 * status-level facts only (statuses, ids, requirement levels) — never contact details or documents.
 */
export async function writeAdminAudit(
  db: Pick<Prisma.TransactionClient, 'adminAuditLog'>,
  admin: AdminActor,
  entry: { action: string; entityType: string; entityId: string; reason?: string | null; before?: unknown; after?: unknown },
): Promise<void> {
  await db.adminAuditLog.create({
    data: {
      adminId: admin.sub,
      adminEmail: admin.email,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason ?? null,
      ...(entry.before !== undefined ? { before: entry.before as Prisma.InputJsonValue } : {}),
      ...(entry.after !== undefined ? { after: entry.after as Prisma.InputJsonValue } : {}),
    },
  });
}
