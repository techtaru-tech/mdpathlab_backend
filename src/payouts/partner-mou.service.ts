import { existsSync } from 'fs';
import { join } from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PartnerCommissionMou } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAdminAudit, type AdminActor } from '../partners/admin/admin-audit.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { COMMISSION_CATEGORIES, categoryTotals, lineCategory, mouInForce, mouStartsAt, type CommissionCategoryName } from './commission-policy.js';
import { DEFAULT_MOU_TERMS, fillMouTerms, mouDate, renderMouPdf } from './mou-document.js';
import { PayoutEmails } from './payout-emails.js';
import type { CreateMouDto, SetCategoriesDto } from './dto/payouts.dto.js';

const IST_MS = 5.5 * 3600_000;

const COMPANY_NAME = 'MD Path Lab';
const COMPANY_LEGAL_NAME = 'A unit of Madhumesh Diagnostics Pvt. Ltd.';

/** The company signature image on disk, from its /uploads/partner-documents/… URL (anything else is ignored). */
export function signatureFilePath(url: string | null): string | null {
  if (!url || !/^\/uploads\/partner-documents\/[\w-]+\.(png|jpg)$/.test(url)) return null;
  const path = join(process.cwd(), url.slice(1));
  return existsSync(path) ? path : null;
}

const MOU_STATUS_TEXT: Record<string, string> = {
  AWAITING_SIGNATURE: 'For signature',
  SIGNED_UPLOADED: 'Signed copy received',
  VERIFIED: 'Verified',
  REJECTED: 'For signature',
};

export const mouView = (m: PartnerCommissionMou) => ({
  id: m.id,
  mouNumber: m.mouNumber,
  routinePercent: Number(m.routinePercent),
  specialPercent: Number(m.specialPercent),
  packagePercent: Number(m.packagePercent),
  effectiveFrom: m.effectiveFrom,
  // When the rates actually start (start date, or verify date if later); null until verified.
  startsAt: mouStartsAt(m),
  signatureStatus: m.signatureStatus,
  documentUrl: m.documentUrl,
  signedUploadedAt: m.signedUploadedAt,
  signedUploadedBy: m.signedUploadedBy,
  verifiedAt: m.verifiedAt,
  rejectionReason: m.rejectionReason,
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
 * report. When admin saves the rates the MOU document is generated (mou-document.ts); the partner downloads it,
 * signs and uploads it, and admin verifies it — only then do the rates apply. An MOU is never edited: a new one is
 * added instead, so what any booking earned can always be traced to the MOU in force when it was booked.
 */
@Injectable()
export class PartnerMouService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: PayoutEmails,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- MOUs

  private async partnerForMou(partnerId: string) {
    const p = await this.prisma.referralPartner.findUnique({
      where: { id: partnerId },
      include: { doctorProfile: true, clinicProfile: { include: { clinicType: { select: { label: true } } } } },
    });
    if (!p) throw new NotFoundException('Partner not found');
    return p;
  }

  private static partnerName(p: Awaited<ReturnType<PartnerMouService['partnerForMou']>>): string {
    return p.displayName ?? p.doctorProfile?.fullName ?? p.clinicProfile?.clinicName ?? `+91 ${p.phone}`;
  }

  /** In force now, the next verified one, the one waiting for signature / verification, and every MOU. */
  private summary(mous: PartnerCommissionMou[]) {
    const now = new Date();
    const current = mouInForce(mous, now);
    const upcoming = mous
      .map((m) => ({ m, start: mouStartsAt(m) }))
      .filter((x) => x.start && x.start.getTime() > now.getTime())
      .sort((a, b) => a.start!.getTime() - b.start!.getTime())[0]?.m;
    const pending = mous.filter((m) => !m.withdrawnAt && m.signatureStatus !== 'VERIFIED').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      current: current ? mouView(current) : null,
      upcoming: upcoming ? mouView(upcoming) : null,
      pending: pending ? mouView(pending) : null,
      history: [...mous].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(mouView),
    };
  }

  /** Admin view of a partner's MOUs. */
  async list(partnerId: string) {
    await this.partnerForMou(partnerId);
    return this.summary(await this.prisma.partnerCommissionMou.findMany({ where: { partnerId } }));
  }

  /** The partner's own MOUs (Partner portal). */
  async partnerMous(partnerId: string) {
    return this.summary(await this.prisma.partnerCommissionMou.findMany({ where: { partnerId } }));
  }

  /**
   * Admin saves the rates → the MOU document is generated (numbered, terms frozen) and the partner is asked to
   * download, sign and upload it. The rates apply only once admin verifies the signed copy.
   */
  async create(partnerId: string, dto: CreateMouDto, admin: AdminActor) {
    const partner = await this.partnerForMou(partnerId);
    const now = Date.now();
    const effectiveFrom = dto.effectiveFrom ? istDay(dto.effectiveFrom) : new Date(now);
    // Today's date means "from now": a booking already placed keeps the rate it was booked at.
    const startsAt = new Date(Math.max(effectiveFrom.getTime(), now));
    if (dto.effectiveFrom && istDay(dto.effectiveFrom, true).getTime() <= now) {
      throw new BadRequestException('The MOU can start today or on a later date — it never changes bookings already made');
    }
    const settings = await this.prisma.commissionSetting.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
    const terms = fillMouTerms(settings.mouTerms?.trim() || DEFAULT_MOU_TERMS, {
      companyName: COMPANY_NAME,
      partnerName: PartnerMouService.partnerName(partner),
      routinePercent: dto.routinePercent,
      specialPercent: dto.specialPercent,
      packagePercent: dto.packagePercent,
      effectiveDate: mouDate(startsAt),
      holdDays: settings.holdDays,
      minWithdrawal: settings.minWithdrawalRupees,
      tdsPercent: Number(settings.tdsPercent),
    });

    let mou: PartnerCommissionMou | null = null;
    for (let attempt = 0; attempt < 3 && !mou; attempt++) {
      try {
        mou = await this.prisma.$transaction(async (tx) => {
          const year = new Date(now + IST_MS).getUTCFullYear();
          const count = await tx.partnerCommissionMou.count({ where: { mouNumber: { startsWith: `MDPL-MOU-${year}-` } } });
          const created = await tx.partnerCommissionMou.create({
            data: {
              partnerId,
              mouNumber: `MDPL-MOU-${year}-${String(count + 1 + attempt).padStart(4, '0')}`,
              termsSnapshot: terms,
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
            after: { partnerId, mouNumber: created.mouNumber, routinePercent: dto.routinePercent, specialPercent: dto.specialPercent, packagePercent: dto.packagePercent, effectiveFrom: startsAt },
          });
          await tx.referralPartnerEvent.create({
            data: {
              partnerId,
              event: 'MOU_ISSUED',
              reason: `${created.mouNumber}: Routine ${dto.routinePercent}% · Special ${dto.specialPercent}% · Package ${dto.packagePercent}% from ${mouDate(startsAt)} — waiting for the partner's signature`,
              actorType: 'ADMIN',
              actorId: admin.sub,
            },
          });
          return created;
        });
      } catch (err) {
        // Two MOUs numbered at the same moment: try the next number.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    if (!mou) throw new BadRequestException('Could not number the MOU — please try again');
    this.emails.mouReady(partner, mou.mouNumber ?? '');
    return { mou: mouView(mou), ...(await this.list(partnerId)) };
  }

  /** Only an MOU that does not apply yet (not verified, or verified but not started) can be withdrawn. */
  async withdraw(partnerId: string, mouId: string, admin: AdminActor) {
    const changed = await this.prisma.$transaction(async (tx) => {
      const r = await tx.partnerCommissionMou.updateMany({
        where: { id: mouId, partnerId, withdrawnAt: null, OR: [{ signatureStatus: { not: 'VERIFIED' } }, { effectiveFrom: { gt: new Date() } }] },
        data: { withdrawnAt: new Date(), withdrawnByAdminId: admin.sub },
      });
      if (r.count === 1) {
        await writeAdminAudit(tx, admin, { action: 'PARTNER_MOU_WITHDRAW', entityType: 'PartnerCommissionMou', entityId: mouId, after: { partnerId } });
      }
      return r.count;
    });
    if (changed !== 1) throw new BadRequestException('Only an MOU that does not apply yet can be withdrawn — add a new MOU to change the rates');
    return this.list(partnerId);
  }

  /** The MOU as a PDF — for the partner to download and sign, or for admin. */
  async documentPdf(partnerId: string, mouId: string): Promise<{ buffer: Buffer; filename: string }> {
    const [mou, partner, site] = await Promise.all([
      this.prisma.partnerCommissionMou.findFirst({ where: { id: mouId, partnerId } }),
      this.partnerForMou(partnerId),
      this.prisma.siteSetting.findFirst({ select: { address: true, phone: true, email: true } }),
    ]);
    if (!mou) throw new NotFoundException('MOU not found');
    const settings = await this.prisma.commissionSetting.findUnique({ where: { id: 'default' } });
    const number = mou.mouNumber ?? mou.id;
    const terms =
      mou.termsSnapshot ??
      fillMouTerms(settings?.mouTerms?.trim() || DEFAULT_MOU_TERMS, {
        companyName: COMPANY_NAME,
        partnerName: PartnerMouService.partnerName(partner),
        routinePercent: Number(mou.routinePercent),
        specialPercent: Number(mou.specialPercent),
        packagePercent: Number(mou.packagePercent),
        effectiveDate: mouDate(mou.effectiveFrom),
        holdDays: settings?.holdDays ?? 7,
        minWithdrawal: settings?.minWithdrawalRupees ?? 0,
        tdsPercent: Number(settings?.tdsPercent ?? 0),
      });
    const d = partner.doctorProfile;
    const c = partner.clinicProfile;
    const lines: [string, string][] = d
      ? [
          ['Registration', `${d.medicalCouncil} · ${d.registrationNumber}`],
          ['Qualification', [d.qualification, d.specialization].filter(Boolean).join(', ')],
          ['City', `${d.city} - ${d.pincode}`],
          ['Mobile', `+91 ${partner.phone}`],
          ['Email', partner.email ?? ''],
        ]
      : [
          ['Type', c?.clinicType.label ?? ''],
          ['Registration', c?.registrationNumber ? `${c.registrationAuthority ?? ''} ${c.registrationNumber}`.trim() : ''],
          ['GSTIN', c?.gstin ?? ''],
          ['Address', c ? [c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') : ''],
          ['Contact', c?.contactPersonName ?? ''],
          ['Mobile', `+91 ${partner.phone}`],
          ['Email', partner.email ?? ''],
        ];
    const buffer = await renderMouPdf({
      mouNumber: number,
      issuedOn: mou.createdAt,
      effectiveFrom: mou.effectiveFrom,
      company: { name: COMPANY_NAME, legalName: COMPANY_LEGAL_NAME, address: site?.address ?? null, phone: site?.phone ?? null, email: site?.email ?? null },
      partner: { kind: d ? 'Doctor' : (c?.clinicType.label ?? 'Clinic / centre'), name: PartnerMouService.partnerName(partner), lines },
      rates: { routine: Number(mou.routinePercent), special: Number(mou.specialPercent), package: Number(mou.packagePercent) },
      terms,
      status: MOU_STATUS_TEXT[mou.signatureStatus],
      companySignatory: {
        name: settings?.mouSignatoryName ?? null,
        designation: settings?.mouSignatoryDesignation ?? null,
        imagePath: signatureFilePath(settings?.mouSignatureUrl ?? null),
      },
      verifiedAt: mou.signatureStatus === 'VERIFIED' ? mou.verifiedAt : null,
      supersededBy: await this.supersededBy(mou),
    });
    return { buffer, filename: `${number}.pdf` };
  }

  /** The later verified MOU that has replaced this one (printed on its PDF), if any. */
  private async supersededBy(mou: PartnerCommissionMou): Promise<{ mouNumber: string; from: Date } | null> {
    const myStart = mouStartsAt(mou);
    if (!myStart) return null;
    const others = await this.prisma.partnerCommissionMou.findMany({ where: { partnerId: mou.partnerId, id: { not: mou.id }, signatureStatus: 'VERIFIED', withdrawnAt: null } });
    const now = Date.now();
    const next = others
      .map((m) => ({ m, start: mouStartsAt(m) }))
      .filter((x) => x.start && x.start.getTime() > myStart.getTime() && x.start.getTime() <= now)
      .sort((a, b) => a.start!.getTime() - b.start!.getTime())[0];
    return next ? { mouNumber: next.m.mouNumber ?? next.m.id, from: next.start! } : null;
  }

  /** The partner uploads the MOU they signed. Admin is told to verify it. */
  async partnerUploadSigned(partnerId: string, mouId: string, file: { fileUrl: string; mimeType: string }) {
    const partner = await this.partnerForMou(partnerId);
    const changed = await this.prisma.partnerCommissionMou.updateMany({
      where: { id: mouId, partnerId, withdrawnAt: null, signatureStatus: { in: ['AWAITING_SIGNATURE', 'REJECTED', 'SIGNED_UPLOADED'] } },
      data: { documentUrl: file.fileUrl, documentMimeType: file.mimeType, signatureStatus: 'SIGNED_UPLOADED', signedUploadedAt: new Date(), signedUploadedBy: 'PARTNER', rejectionReason: null },
    });
    if (changed.count !== 1) throw new BadRequestException('This MOU cannot take a signed copy now — refresh the page');
    const mou = await this.prisma.partnerCommissionMou.findUniqueOrThrow({ where: { id: mouId } });
    await this.prisma.referralPartnerEvent.create({
      data: { partnerId, event: 'MOU_SIGNED_UPLOADED', reason: `${mou.mouNumber ?? mouId}: signed copy uploaded`, actorType: 'PARTNER', actorId: partnerId },
    });
    void this.notifications.notifyAdmins({
      title: 'Signed MOU to verify',
      body: `${PartnerMouService.partnerName(partner)} uploaded the signed MOU ${mou.mouNumber ?? ''}. Verify it on their page in Admin → Doctors & Clinics.`,
      data: { type: 'PARTNER_MOU_SIGNED', partnerId, mouId },
    });
    return this.partnerMous(partnerId);
  }

  /** Every MOU whose signed copy is waiting for admin to verify, oldest first. */
  async toVerify() {
    const rows = await this.prisma.partnerCommissionMou.findMany({
      where: { signatureStatus: 'SIGNED_UPLOADED', withdrawnAt: null },
      orderBy: { signedUploadedAt: 'asc' },
      take: 50,
      include: { partner: { select: { id: true, type: true, displayName: true, phone: true } } },
    });
    return rows.map((m) => ({ ...mouView(m), partner: m.partner }));
  }

  /** Admin uploads a signed copy received on paper / by email. It still needs Verify. */
  async attachDocument(partnerId: string, mouId: string, file: { fileUrl: string; mimeType: string }, admin: AdminActor) {
    const mou = await this.prisma.partnerCommissionMou.findFirst({ where: { id: mouId, partnerId } });
    if (!mou) throw new NotFoundException('MOU not found');
    if (mou.withdrawnAt) throw new BadRequestException('This MOU was withdrawn');
    await this.prisma.$transaction(async (tx) => {
      await tx.partnerCommissionMou.update({
        where: { id: mouId },
        data: {
          documentUrl: file.fileUrl,
          documentMimeType: file.mimeType,
          signedUploadedAt: new Date(),
          signedUploadedBy: 'ADMIN',
          // A verified MOU stays verified (only its file is replaced); otherwise it now waits for Verify.
          ...(mou.signatureStatus === 'VERIFIED' ? {} : { signatureStatus: 'SIGNED_UPLOADED' as const, rejectionReason: null }),
        },
      });
      await writeAdminAudit(tx, admin, {
        action: 'PARTNER_MOU_DOCUMENT',
        entityType: 'PartnerCommissionMou',
        entityId: mouId,
        before: { hadDocument: Boolean(mou.documentUrl), status: mou.signatureStatus },
        after: { hasDocument: true },
      });
    });
    return this.list(partnerId);
  }

  /** Admin checked the signed copy: the rates now apply (from the start date, or from now if that has passed). */
  async verify(partnerId: string, mouId: string, admin: AdminActor) {
    const partner = await this.partnerForMou(partnerId);
    const now = new Date();
    const changed = await this.prisma.$transaction(async (tx) => {
      const r = await tx.partnerCommissionMou.updateMany({
        where: { id: mouId, partnerId, withdrawnAt: null, signatureStatus: 'SIGNED_UPLOADED' },
        data: { signatureStatus: 'VERIFIED', verifiedAt: now, verifiedByAdminId: admin.sub, rejectionReason: null },
      });
      if (r.count === 1) {
        await writeAdminAudit(tx, admin, { action: 'PARTNER_MOU_VERIFY', entityType: 'PartnerCommissionMou', entityId: mouId, after: { partnerId, status: 'VERIFIED' } });
        await tx.referralPartnerEvent.create({ data: { partnerId, event: 'MOU_VERIFIED', reason: 'Signed MOU verified — rates apply', actorType: 'ADMIN', actorId: admin.sub } });
      }
      return r.count;
    });
    if (changed !== 1) throw new BadRequestException('Only an MOU with a signed copy waiting for verification can be verified');
    const mou = await this.prisma.partnerCommissionMou.findUniqueOrThrow({ where: { id: mouId } });
    this.emails.mouVerified(partner, mou.mouNumber ?? '', mouDate(mouStartsAt(mou) ?? now));
    return this.list(partnerId);
  }

  /** Admin can't accept the signed copy (unsigned, wrong page, unreadable…): the partner is told why and uploads again. */
  async reject(partnerId: string, mouId: string, reason: string, admin: AdminActor) {
    const partner = await this.partnerForMou(partnerId);
    const changed = await this.prisma.$transaction(async (tx) => {
      const r = await tx.partnerCommissionMou.updateMany({
        where: { id: mouId, partnerId, withdrawnAt: null, signatureStatus: 'SIGNED_UPLOADED' },
        data: { signatureStatus: 'REJECTED', rejectionReason: reason },
      });
      if (r.count === 1) {
        await writeAdminAudit(tx, admin, { action: 'PARTNER_MOU_REJECT', entityType: 'PartnerCommissionMou', entityId: mouId, reason, after: { partnerId, status: 'REJECTED' } });
        await tx.referralPartnerEvent.create({ data: { partnerId, event: 'MOU_SIGNED_COPY_REJECTED', reason, actorType: 'ADMIN', actorId: admin.sub } });
      }
      return r.count;
    });
    if (changed !== 1) throw new BadRequestException('Only an MOU with a signed copy waiting for verification can be sent back');
    const mou = await this.prisma.partnerCommissionMou.findUniqueOrThrow({ where: { id: mouId } });
    this.emails.mouRejected(partner, mou.mouNumber ?? '', reason);
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
      this.prisma.partnerCommissionMou.findMany({ where: { partnerId } }),
    ]);
    const { current, upcoming, pending } = this.summary(mous);
    return {
      categoryTotals: categoryTotals(rows),
      counts: { referredBookings, earningBookings },
      mou: { current, upcoming, pending },
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
