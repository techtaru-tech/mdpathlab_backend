import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PartnerCommissionMou } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAdminAudit, type AdminActor } from '../partners/admin/admin-audit.js';
import { COMMISSION_CATEGORIES, categoryTotals, lineCategory, mouInForce, type CommissionCategoryName } from './commission-policy.js';
import type { CreateMouDto, SetCategoriesDto } from './dto/payouts.dto.js';

const IST_MS = 5.5 * 3600_000;

export const mouView = (m: PartnerCommissionMou) => ({
  id: m.id,
  routinePercent: Number(m.routinePercent),
  specialPercent: Number(m.specialPercent),
  packagePercent: Number(m.packagePercent),
  effectiveFrom: m.effectiveFrom,
  documentUrl: m.documentUrl,
  note: m.note,
  createdAt: m.createdAt,
  withdrawnAt: m.withdrawnAt,
});

/** "2026-11" → the month's start and end as instants, in IST. */
export function istMonthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: new Date(Date.UTC(y, m - 1, 1) - IST_MS), to: new Date(Date.UTC(y, m, 1) - IST_MS) };
}

/** "2026-11-05" → start of that day in IST; with endOfDay, the start of the next day. */
export function istDay(date: string, endOfDay = false): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + (endOfDay ? 1 : 0)) - IST_MS);
}


/** Per-entry category amounts, e.g. [{ category: 'ROUTINE', amountPaise: 20000 }]. */
export function entryCategories(e: { breakdown: unknown }): { category: CommissionCategoryName; amountPaise: number }[] {
  if (!Array.isArray(e.breakdown)) return [];
  const sums = new Map<CommissionCategoryName, number>();
  for (const l of e.breakdown as { itemType?: string; category?: string; amountPaise?: number }[]) {
    if (typeof l?.amountPaise !== 'number') continue;
    const c = lineCategory(l.itemType ?? '', l.category);
    sums.set(c, (sums.get(c) ?? 0) + l.amountPaise);
  }
  return COMMISSION_CATEGORIES.filter((c) => sums.has(c)).map((c) => ({ category: c, amountPaise: sums.get(c)! }));
}

/**
 * Partner MOUs (Routine / Special / Package %), test categories, monthly statements and the admin commission
 * report. An MOU is never edited: a new one is added with the date it starts, and only one that has not started
 * yet can be withdrawn — so what any booking earned can always be traced to the MOU in force when it was booked.
 */
@Injectable()
export class PartnerMouService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- MOUs

  async list(partnerId: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) throw new NotFoundException('Partner not found');
    const mous = await this.prisma.partnerCommissionMou.findMany({ where: { partnerId }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] });
    const current = mouInForce(mous, new Date());
    const upcoming = mous
      .filter((m) => !m.withdrawnAt && m.effectiveFrom.getTime() > Date.now())
      .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
    return { current: current ? mouView(current) : null, upcoming: upcoming ? mouView(upcoming) : null, history: mous.map(mouView) };
  }

  async create(partnerId: string, dto: CreateMouDto, admin: AdminActor) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) throw new NotFoundException('Partner not found');
    const now = Date.now();
    const effectiveFrom = dto.effectiveFrom ? istDay(dto.effectiveFrom) : new Date(now);
    // Today's date means "from now": a booking already placed keeps the rate it was booked at.
    const startsAt = new Date(Math.max(effectiveFrom.getTime(), now));
    if (dto.effectiveFrom && istDay(dto.effectiveFrom, true).getTime() <= now) {
      throw new BadRequestException('The MOU can start today or on a later date — it never changes bookings already made');
    }
    const mou = await this.prisma.$transaction(async (tx) => {
      const created = await tx.partnerCommissionMou.create({
        data: {
          partnerId,
          routinePercent: new Prisma.Decimal(dto.routinePercent),
          specialPercent: new Prisma.Decimal(dto.specialPercent),
          packagePercent: new Prisma.Decimal(dto.packagePercent),
          effectiveFrom: startsAt,
          note: dto.note?.trim() || null,
          createdByAdminId: admin.sub,
        },
      });
      await writeAdminAudit(tx, admin, {
        action: 'PARTNER_MOU_CREATE',
        entityType: 'PartnerCommissionMou',
        entityId: created.id,
        reason: dto.note ?? null,
        after: { partnerId, routinePercent: dto.routinePercent, specialPercent: dto.specialPercent, packagePercent: dto.packagePercent, effectiveFrom: startsAt },
      });
      await tx.referralPartnerEvent.create({
        data: {
          partnerId,
          event: 'MOU_ADDED',
          reason: `Routine ${dto.routinePercent}% · Special ${dto.specialPercent}% · Package ${dto.packagePercent}% from ${startsAt.toISOString().slice(0, 10)}`,
          actorType: 'ADMIN',
          actorId: admin.sub,
        },
      });
      return created;
    });
    return { mou: mouView(mou), ...(await this.list(partnerId)) };
  }

  async withdraw(partnerId: string, mouId: string, admin: AdminActor) {
    const changed = await this.prisma.$transaction(async (tx) => {
      const r = await tx.partnerCommissionMou.updateMany({
        where: { id: mouId, partnerId, withdrawnAt: null, effectiveFrom: { gt: new Date() } },
        data: { withdrawnAt: new Date(), withdrawnByAdminId: admin.sub },
      });
      if (r.count === 1) {
        await writeAdminAudit(tx, admin, { action: 'PARTNER_MOU_WITHDRAW', entityType: 'PartnerCommissionMou', entityId: mouId, after: { partnerId } });
      }
      return r.count;
    });
    if (changed !== 1) throw new BadRequestException('Only an MOU that has not started yet can be withdrawn — add a new MOU to change the rates');
    return this.list(partnerId);
  }

  async attachDocument(partnerId: string, mouId: string, file: { fileUrl: string; mimeType: string }, admin: AdminActor) {
    const mou = await this.prisma.partnerCommissionMou.findFirst({ where: { id: mouId, partnerId } });
    if (!mou) throw new NotFoundException('MOU not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.partnerCommissionMou.update({ where: { id: mouId }, data: { documentUrl: file.fileUrl, documentMimeType: file.mimeType } });
      await writeAdminAudit(tx, admin, {
        action: 'PARTNER_MOU_DOCUMENT',
        entityType: 'PartnerCommissionMou',
        entityId: mouId,
        before: { hadDocument: Boolean(mou.documentUrl) },
        after: { hasDocument: true },
      });
    });
    return this.list(partnerId);
  }

  // ---------------------------------------------------------------- test categories

  /** Admin sets tests as Routine or Special. Packages are always Package and can't be changed. */
  async setCategories(dto: SetCategoriesDto, admin: AdminActor) {
    const keys = dto.changes.map((c) => ({ itemType: c.itemType, itemId: c.itemId }));
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.commissionItemCategory.findMany({ where: { OR: keys } });
      for (const c of dto.changes) {
        if (c.category === 'ROUTINE') {
          // Routine is the default — no row needed.
          await tx.commissionItemCategory.deleteMany({ where: { itemType: c.itemType, itemId: c.itemId } });
        } else {
          await tx.commissionItemCategory.upsert({
            where: { itemType_itemId: { itemType: c.itemType, itemId: c.itemId } },
            create: { itemType: c.itemType, itemId: c.itemId, category: c.category, updatedByAdminId: admin.sub },
            update: { category: c.category, updatedByAdminId: admin.sub },
          });
        }
      }
      await writeAdminAudit(tx, admin, {
        action: 'COMMISSION_CATEGORIES_UPDATE',
        entityType: 'CommissionItemCategory',
        entityId: dto.changes.length === 1 ? `${dto.changes[0]!.itemType}:${dto.changes[0]!.itemId}` : `${dto.changes.length} items`,
        before: before.map((b) => ({ itemType: b.itemType, itemId: b.itemId, category: b.category })),
        after: dto.changes,
      });
    });
    return { updated: dto.changes.length };
  }

  async categoriesOf(itemType: string, itemIds: string[]): Promise<Map<string, CommissionCategoryName>> {
    if (itemType === 'PACKAGE') return new Map(itemIds.map((id) => [id, 'PACKAGE' as const]));
    const rows = await this.prisma.commissionItemCategory.findMany({ where: { itemType: itemType as never, itemId: { in: itemIds } } });
    const marked = new Map(rows.map((r) => [r.itemId, r.category]));
    return new Map(itemIds.map((id) => [id, lineCategory(itemType, marked.get(id))]));
  }

  // ---------------------------------------------------------------- partner dashboard extras

  /** Category-wise commission (net of reversals), booking counts and the partner's MOU — for the partner's dashboard. */
  async dashboardExtras(partnerId: string) {
    const [rows, referredBookings, earningBookings, mous] = await Promise.all([
      this.prisma.commissionEntry.findMany({ where: { partnerId, type: { in: ['EARNING', 'REVERSAL'] } }, select: { breakdown: true } }),
      this.prisma.orderReferralAttribution.count({ where: { partnerId } }),
      this.prisma.commissionEntry.count({ where: { partnerId, type: 'EARNING' } }),
      this.prisma.partnerCommissionMou.findMany({ where: { partnerId, withdrawnAt: null } }),
    ]);
    const current = mouInForce(mous, new Date());
    const upcoming = mous.filter((m) => m.effectiveFrom.getTime() > Date.now()).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
    return {
      categoryTotals: categoryTotals(rows),
      counts: { referredBookings, earningBookings },
      mou: { current: current ? mouView(current) : null, upcoming: upcoming ? mouView(upcoming) : null },
    };
  }

  // ---------------------------------------------------------------- monthly statement

  /** One month of a partner's ledger (IST), with the balance before and after it. */
  async statement(partnerId: string, month: string) {
    const partner = await this.prisma.referralPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, type: true, displayName: true, phone: true, referralCodes: { where: { retiredAt: null }, select: { code: true }, take: 1 } },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    const { from, to } = istMonthRange(month);
    const [opening, entries] = await Promise.all([
      this.prisma.commissionEntry.aggregate({ where: { partnerId, createdAt: { lt: from } }, _sum: { amountPaise: true } }),
      this.prisma.commissionEntry.findMany({
        where: { partnerId, createdAt: { gte: from, lt: to } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, amountPaise: true, createdAt: true, note: true, breakdown: true, order: { select: { orderNumber: true } } },
      }),
    ]);
    const sum = (types: string[]) => entries.filter((e) => types.includes(e.type)).reduce((a, e) => a + e.amountPaise, 0);
    const openingPaise = opening._sum.amountPaise ?? 0;
    const netPaise = entries.reduce((a, e) => a + e.amountPaise, 0);
    return {
      partner: { id: partner.id, type: partner.type, displayName: partner.displayName, referralCode: partner.referralCodes[0]?.code ?? null },
      month,
      from,
      to,
      openingBalancePaise: openingPaise,
      closingBalancePaise: openingPaise + netPaise,
      totals: {
        earnedPaise: sum(['EARNING']),
        reversedPaise: -sum(['REVERSAL']),
        adjustmentsPaise: sum(['ADJUSTMENT']),
        withdrawnPaise: -sum(['WITHDRAWAL', 'WITHDRAWAL_RETURNED']),
        bookings: entries.filter((e) => e.type === 'EARNING').length,
      },
      categoryTotals: categoryTotals(entries.filter((e) => e.type === 'EARNING' || e.type === 'REVERSAL')),
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amountPaise: e.amountPaise,
        createdAt: e.createdAt,
        orderNumber: e.order?.orderNumber ?? null,
        categories: entryCategories(e),
        note: e.type === 'EARNING' ? null : e.note,
      })),
    };
  }

  // ---------------------------------------------------------------- admin report

  /** Partner-wise commission between two dates (IST, inclusive), with category split and payouts made. */
  async report(fromDate: string, toDate: string) {
    const from = istDay(fromDate);
    const to = istDay(toDate, true);
    if (to.getTime() <= from.getTime()) throw new BadRequestException('The end date must be on or after the start date');
    const [entries, paid, balances] = await Promise.all([
      this.prisma.commissionEntry.findMany({
        where: { createdAt: { gte: from, lt: to }, type: { in: ['EARNING', 'REVERSAL', 'ADJUSTMENT'] } },
        select: { partnerId: true, type: true, amountPaise: true, breakdown: true },
      }),
      this.prisma.withdrawalRequest.groupBy({ by: ['partnerId'], where: { status: 'PAID', paidAt: { gte: from, lt: to } }, _sum: { amountPaise: true, netPaise: true, tdsPaise: true } }),
      this.prisma.commissionEntry.groupBy({ by: ['partnerId'], _sum: { amountPaise: true } }),
    ]);
    const ids = [...new Set([...entries.map((e) => e.partnerId), ...paid.map((p) => p.partnerId)])];
    const partners = await this.prisma.referralPartner.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, displayName: true, phone: true, referralCodes: { where: { retiredAt: null }, select: { code: true }, take: 1 } },
    });
    const rows = partners.map((p) => {
      const mine = entries.filter((e) => e.partnerId === p.id);
      const s = (t: string) => mine.filter((e) => e.type === t).reduce((a, e) => a + e.amountPaise, 0);
      const pay = paid.find((x) => x.partnerId === p.id)?._sum;
      return {
        partner: { id: p.id, type: p.type, displayName: p.displayName, phone: p.phone, referralCode: p.referralCodes[0]?.code ?? null },
        bookings: mine.filter((e) => e.type === 'EARNING').length,
        earnedPaise: s('EARNING'),
        reversedPaise: -s('REVERSAL'),
        adjustmentsPaise: s('ADJUSTMENT'),
        netPaise: s('EARNING') + s('REVERSAL') + s('ADJUSTMENT'),
        categoryTotals: categoryTotals(mine.filter((e) => e.type !== 'ADJUSTMENT')),
        paidOutPaise: pay?.amountPaise ?? 0,
        tdsPaise: pay?.tdsPaise ?? 0,
        balanceNowPaise: balances.find((b) => b.partnerId === p.id)?._sum.amountPaise ?? 0,
      };
    });
    rows.sort((a, b) => b.netPaise - a.netPaise);
    const total = (k: 'bookings' | 'earnedPaise' | 'reversedPaise' | 'adjustmentsPaise' | 'netPaise' | 'paidOutPaise' | 'tdsPaise') => rows.reduce((a, r) => a + r[k], 0);
    return {
      from: fromDate,
      to: toDate,
      rows,
      totals: {
        bookings: total('bookings'),
        earnedPaise: total('earnedPaise'),
        reversedPaise: total('reversedPaise'),
        adjustmentsPaise: total('adjustmentsPaise'),
        netPaise: total('netPaise'),
        paidOutPaise: total('paidOutPaise'),
        tdsPaise: total('tdsPaise'),
        categoryTotals: categoryTotals(entries.filter((e) => e.type !== 'ADJUSTMENT')),
      },
    };
  }
}
