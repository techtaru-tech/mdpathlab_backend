import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

// A signed token stays valid until it expires (7 days for patients and phlebotomists), so switching an account
// off must be checked on every request, not only at login. The lookups are cached for a few seconds so a
// deactivation takes effect almost at once without a database read on every call.
const TTL_MS = 15_000;
const cache = new Map<string, { active: boolean; at: number }>();

async function cached(key: string, load: () => Promise<boolean>): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.active;
  const active = await load();
  cache.set(key, { active, at: Date.now() });
  if (cache.size > 5000) cache.clear();
  return active;
}

export async function requireActivePatient(prisma: PrismaService, userId: string): Promise<void> {
  const active = await cached('user:' + userId, async () => {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    return u?.status === 'ACTIVE';
  });
  if (!active) throw new UnauthorizedException('This account is not active');
}

export async function requireActivePhlebotomist(prisma: PrismaService, userId: string, phlebotomistId: string): Promise<void> {
  const active = await cached('phlebotomist:' + phlebotomistId, async () => {
    const p = await prisma.phlebotomist.findUnique({ where: { id: phlebotomistId }, select: { status: true, user: { select: { status: true } } } });
    return p?.status === 'ACTIVE' && p.user.status === 'ACTIVE';
  });
  if (!active) throw new UnauthorizedException('This account is not active');
}

export async function requireActiveLab(prisma: PrismaService, labId: string): Promise<void> {
  const active = await cached('lab:' + labId, async () => (await prisma.lab.findUnique({ where: { id: labId }, select: { status: true } }))?.status === 'ACTIVE');
  if (!active) throw new UnauthorizedException('This account is not active');
}

export async function requireActiveAdmin(prisma: PrismaService, adminId: string): Promise<void> {
  const active = await cached('admin:' + adminId, async () => (await prisma.adminUser.findUnique({ where: { id: adminId }, select: { status: true } }))?.status === 'ACTIVE');
  if (!active) throw new UnauthorizedException('This account is not active');
}
