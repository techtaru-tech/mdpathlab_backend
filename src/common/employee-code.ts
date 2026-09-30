import type { Prisma } from '@prisma/client';

/**
 * Builds a phlebotomist employee code from the name: first 3 letters (uppercased, padded with X)
 * plus the next free 3-digit sequence for that prefix — "Rahul Sharma" → RAH001, RAH002, ...
 */
export async function generateEmployeeCode(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '');
  const prefix = letters.slice(0, 3).padEnd(3, 'X');

  const existing = await tx.phlebotomist.findMany({
    where: { employeeCode: { startsWith: prefix } },
    select: { employeeCode: true },
  });
  const max = existing.reduce((m, p) => {
    const n = /^\d+$/.test(p.employeeCode.slice(3)) ? parseInt(p.employeeCode.slice(3), 10) : 0;
    return Math.max(m, n);
  }, 0);

  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
