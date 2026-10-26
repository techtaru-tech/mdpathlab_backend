import { createHash } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { writeAdminAudit, type AdminActor } from '../partners/admin/admin-audit.js';
import { cleanText } from '../partners/partner-normalize.js';
import { generateReferralCode, normalizeReferralCode, referralLink } from './referral-code.js';
import { REFERRAL_POLICY_VERSION, decideClaim, publicClaimStatus, type ClaimOutcome } from './referral-policy.js';

type Tx = Prisma.TransactionClient;
type ClaimSource = 'LINK' | 'QR' | 'CODE_ENTRY';

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const PARTNER_PUBLIC = { id: true, type: true, displayName: true } as const;

/**
 * Referral codes and the lifetime patient → partner attribution (Phase 2). Tracking only — nothing here computes
 * amounts, and nothing here is called by cart, checkout, payment or order code.
 */
@Injectable()
export class ReferralsService {
  private readonly velocityThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {
    this.velocityThreshold = Number(this.config.get('REFERRAL_VELOCITY_ALERT_PER_DAY', 20));
  }

  private get appUrl(): string {
    return (this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:8080').replace(/\/+$/, '');
  }

  private ipHash(ip: string | undefined): string | null {
    if (!ip) return null;
    return createHash('sha256').update(`${this.config.get<string>('JWT_SECRET') ?? ''}|${ip}`).digest('hex').slice(0, 32);
  }

  // ---------------------------------------------------------------- public / patient

  /** What the /r/:code page shows. Every failure looks the same, so codes cannot be probed for partner status. */
  async lookup(rawCode: string) {
    const code = normalizeReferralCode(rawCode);
    if (!code) return { valid: false as const };
    const row = await this.prisma.referralCode.findUnique({
      where: { code },
      include: { partner: { select: { ...PARTNER_PUBLIC, status: true, doctorProfile: { select: { city: true } }, clinicProfile: { select: { city: true } } } } },
    });
    if (!row || row.retiredAt || row.partner.status !== 'APPROVED') return { valid: false as const };
    return {
      valid: true as const,
      partner: { type: row.partner.type, displayName: row.partner.displayName, city: row.partner.doctorProfile?.city ?? row.partner.clinicProfile?.city ?? null },
    };
  }

  /**
   * Links the logged-in patient to the code's partner — only a genuinely new patient (no order of any status), only
   * an approved partner, never the partner's own number, never replacing an existing link. Runs under the same
   * per-patient lock checkout takes, so a claim and the patient's first booking can never interleave.
   */
  async claim(userId: string, rawCode: string, source: ClaimSource, capturedAt: string | undefined, ip: string | undefined) {
    const code = normalizeReferralCode(rawCode);
    const clientCapturedAt = capturedAt && !Number.isNaN(Date.parse(capturedAt)) ? new Date(capturedAt) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'checkout:' + userId}, 0))`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { phone: true } });
      if (!user) throw new NotFoundException('Account not found');

      const existing = await tx.patientReferral.findUnique({ where: { userId }, select: { id: true } });
      const codeRow = code
        ? await tx.referralCode.findUnique({ where: { code }, include: { partner: { select: { ...PARTNER_PUBLIC, status: true, phone: true } } } })
        : null;
      const orderCount = existing ? 0 : await tx.order.count({ where: { userId } });

      const outcome: ClaimOutcome = decideClaim({
        alreadyReferred: Boolean(existing),
        code: codeRow ? { retired: Boolean(codeRow.retiredAt) } : null,
        partner: codeRow ? { status: codeRow.partner.status, phone: codeRow.partner.phone } : null,
        patientPhone: user.phone,
        orderCount,
      });

      await tx.referralAttempt.create({
        data: {
          userId,
          partnerId: codeRow?.partner.id ?? null,
          codeAttempted: (code ?? String(rawCode ?? '')).slice(0, 40),
          outcome,
          ipHash: this.ipHash(ip),
        },
      });

      if (outcome !== 'BOUND') return { outcome, partner: null };

      const referral = await tx.patientReferral.create({
        data: {
          userId,
          partnerId: codeRow!.partner.id,
          codeId: codeRow!.id,
          source,
          boundVia: 'SELF_CLAIM',
          policyVersion: REFERRAL_POLICY_VERSION,
          clientCapturedAt,
        },
      });
      await tx.patientReferralEvent.create({
        data: { patientReferralId: referral.id, userId, event: 'BOUND', toPartnerId: codeRow!.partner.id, toStatus: 'ACTIVE', actorType: 'PATIENT', actorId: userId },
      });
      return { outcome, partner: { type: codeRow!.partner.type, displayName: codeRow!.partner.displayName, id: codeRow!.partner.id } };
    });

    if (result.outcome === 'BOUND' && result.partner) await this.checkVelocity(result.partner.id, result.partner.displayName);
    return {
      status: publicClaimStatus(result.outcome),
      ...(result.partner ? { partner: { type: result.partner.type, displayName: result.partner.displayName } } : {}),
    };
  }

  /** Many new patients bound to one partner in a day is worth a human look (fake accounts, scripted claims). */
  private async checkVelocity(partnerId: string, name: string | null) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const count = await this.prisma.patientReferral.count({ where: { partnerId, boundAt: { gte: since } } });
    if (count === this.velocityThreshold) {
      await this.notifications.notifyAdmins({
        title: 'Unusual referral activity',
        body: `${name ?? 'A partner'} has ${count} new referred patients in the last 24 hours — please review`,
        data: { type: 'REFERRAL_VELOCITY', partnerId },
      });
    }
  }

  /** The patient's own referring partner (name and type only). A revoked referral is not shown. */
  async mine(userId: string) {
    const r = await this.prisma.patientReferral.findUnique({ where: { userId }, include: { partner: { select: PARTNER_PUBLIC } } });
    if (!r || r.status === 'REVOKED') return { referral: null };
    return { referral: { partner: { type: r.partner.type, displayName: r.partner.displayName }, boundAt: r.boundAt, status: r.status } };
  }

  // ---------------------------------------------------------------- partner

  private async ensureActiveCode(partnerId: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const active = await this.prisma.referralCode.findFirst({ where: { partnerId, retiredAt: null } });
      if (active) return active;
      try {
        return await this.prisma.referralCode.create({ data: { partnerId, code: generateReferralCode() } });
      } catch (err) {
        // Code collision, or a parallel request issued this partner's code first — look again.
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new ConflictException('Could not issue a referral code — please try again');
  }

  /** Approved partners only: their code, link and QR, plus aggregate counts (no patient details). */
  async partnerKit(partnerId: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { status: true } });
    if (!partner) throw new NotFoundException('Account not found');
    if (partner.status !== 'APPROVED') throw new BadRequestException('Referral tools are available to approved partners only');
    const code = await this.ensureActiveCode(partnerId);
    const link = referralLink(this.appUrl, code.code, 'LINK');
    const qrLink = referralLink(this.appUrl, code.code, 'QR');
    const [referredPatients, attributedBookings] = await Promise.all([
      this.prisma.patientReferral.count({ where: { partnerId, status: { not: 'REVOKED' } } }),
      this.prisma.orderReferralAttribution.count({ where: { partnerId, referralStatusAtBooking: { not: 'REVOKED' } } }),
    ]);
    return {
      code: code.code,
      issuedAt: code.issuedAt,
      link,
      qrLink,
      qrPngDataUrl: await toDataURL(qrLink, { errorCorrectionLevel: 'M', margin: 1, width: 320 }),
      counts: { referredPatients, attributedBookings },
    };
  }

  // ---------------------------------------------------------------- admin

  async adminRecent(page = 1, pageSize = 20) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientReferral.findMany({
        orderBy: { boundAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, name: true, phone: true } }, partner: { select: PARTNER_PUBLIC }, _count: { select: { orderAttributions: true } } },
      }),
      this.prisma.patientReferral.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async adminFindPatient(phone: string) {
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, name: true, phone: true, role: true, createdAt: true, _count: { select: { orders: true } } } });
    if (!user || user.role !== 'PATIENT') throw new NotFoundException('No patient with this mobile number');
    const referral = await this.prisma.patientReferral.findUnique({
      where: { userId: user.id },
      include: {
        partner: { select: { ...PARTNER_PUBLIC, status: true } },
        code: { select: { code: true } },
        events: { orderBy: { createdAt: 'desc' } },
        _count: { select: { orderAttributions: true } },
      },
    });
    return { patient: user, referral };
  }

  private async requireApprovedPartner(tx: Tx, partnerId: string) {
    const partner = await tx.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, status: true, phone: true } });
    if (!partner || partner.status !== 'APPROVED') throw new BadRequestException('Choose an approved doctor or clinic');
    return partner;
  }

  /**
   * Admin links a patient who has no referral yet (e.g. a phone booking). Allowed even for an existing customer —
   * an explicit, audited override — but only orders placed from now on are attributed (boundAt = now).
   */
  async adminAssign(userId: string, partnerId: string, rawReason: string, admin: AdminActor) {
    const reason = this.requireReason(rawReason);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'checkout:' + userId}, 0))`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { phone: true, role: true } });
      if (!user || user.role !== 'PATIENT') throw new NotFoundException('Patient not found');
      if (await tx.patientReferral.findUnique({ where: { userId }, select: { id: true } })) {
        throw new ConflictException('This patient already has a referral — use reassign instead');
      }
      const partner = await this.requireApprovedPartner(tx, partnerId);
      if (partner.phone === user.phone) throw new BadRequestException('A partner cannot be linked to their own mobile number');
      const referral = await tx.patientReferral.create({
        data: { userId, partnerId, source: 'ADMIN', boundVia: 'ADMIN', policyVersion: REFERRAL_POLICY_VERSION },
      });
      await tx.patientReferralEvent.create({
        data: { patientReferralId: referral.id, userId, event: 'BOUND', toPartnerId: partnerId, toStatus: 'ACTIVE', reason, actorType: 'ADMIN', actorId: admin.sub, actorLabel: admin.email },
      });
      await writeAdminAudit(tx, admin, { action: 'REFERRAL_ASSIGN', entityType: 'PatientReferral', entityId: referral.id, reason, after: { partnerId, status: 'ACTIVE' } });
    });
    return this.adminFindPatientById(userId);
  }

  /** Moves the attribution to another partner. Only orders placed after this change follow the new partner. */
  async adminReassign(userId: string, partnerId: string, rawReason: string, admin: AdminActor) {
    const reason = this.requireReason(rawReason);
    await this.prisma.$transaction(async (tx) => {
      const referral = await tx.patientReferral.findUnique({ where: { userId } });
      if (!referral) throw new NotFoundException('This patient has no referral');
      if (referral.partnerId === partnerId) throw new BadRequestException('The patient is already linked to this partner');
      const partner = await this.requireApprovedPartner(tx, partnerId);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
      if (partner.phone === user.phone) throw new BadRequestException('A partner cannot be linked to their own mobile number');
      const changed = await tx.patientReferral.updateMany({ where: { id: referral.id, partnerId: referral.partnerId }, data: { partnerId, codeId: null } });
      if (changed.count !== 1) throw new ConflictException('This referral was just changed — refresh and try again');
      await tx.patientReferralEvent.create({
        data: { patientReferralId: referral.id, userId, event: 'REASSIGNED', fromPartnerId: referral.partnerId, toPartnerId: partnerId, reason, actorType: 'ADMIN', actorId: admin.sub, actorLabel: admin.email },
      });
      await writeAdminAudit(tx, admin, { action: 'REFERRAL_REASSIGN', entityType: 'PatientReferral', entityId: referral.id, reason, before: { partnerId: referral.partnerId }, after: { partnerId } });
    });
    return this.adminFindPatientById(userId);
  }

  async adminSetStatus(userId: string, action: 'REVOKE' | 'DISPUTE' | 'RESTORE', rawReason: string, admin: AdminActor) {
    const reason = this.requireReason(rawReason);
    const rule = {
      REVOKE: { from: ['ACTIVE', 'DISPUTED'] as const, to: 'REVOKED' as const, event: 'REVOKED' },
      DISPUTE: { from: ['ACTIVE'] as const, to: 'DISPUTED' as const, event: 'DISPUTED' },
      RESTORE: { from: ['DISPUTED', 'REVOKED'] as const, to: 'ACTIVE' as const, event: 'RESTORED' },
    }[action];
    await this.prisma.$transaction(async (tx) => {
      const referral = await tx.patientReferral.findUnique({ where: { userId } });
      if (!referral) throw new NotFoundException('This patient has no referral');
      if (!(rule.from as readonly string[]).includes(referral.status)) {
        throw new BadRequestException(`This referral is ${referral.status.toLowerCase()} — that action is not possible`);
      }
      const changed = await tx.patientReferral.updateMany({ where: { id: referral.id, status: referral.status }, data: { status: rule.to } });
      if (changed.count !== 1) throw new ConflictException('This referral was just changed — refresh and try again');
      await tx.patientReferralEvent.create({
        data: { patientReferralId: referral.id, userId, event: rule.event, fromStatus: referral.status, toStatus: rule.to, reason, actorType: 'ADMIN', actorId: admin.sub, actorLabel: admin.email },
      });
      await writeAdminAudit(tx, admin, { action: `REFERRAL_${action}`, entityType: 'PatientReferral', entityId: referral.id, reason, before: { status: referral.status }, after: { status: rule.to } });
    });
    return this.adminFindPatientById(userId);
  }

  private async adminFindPatientById(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
    return this.adminFindPatient(user.phone);
  }

  /** Retires the partner's active code (old links and printed QRs stop working) and issues a new one. */
  async adminReissueCode(partnerId: string, rawReason: string, admin: AdminActor) {
    const reason = this.requireReason(rawReason);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.requireApprovedPartner(tx, partnerId);
          const active = await tx.referralCode.findFirst({ where: { partnerId, retiredAt: null } });
          if (active) {
            await tx.referralCode.update({ where: { id: active.id }, data: { retiredAt: new Date(), retiredReason: reason, retiredBy: admin.email } });
          }
          const next = await tx.referralCode.create({ data: { partnerId, code: generateReferralCode() } });
          await writeAdminAudit(tx, admin, { action: 'REFERRAL_CODE_REISSUE', entityType: 'ReferralPartner', entityId: partnerId, reason, before: { code: active?.code ?? null }, after: { code: next.code } });
        });
        return this.adminPartnerSummary(partnerId);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new ConflictException('Could not issue a new code — please try again');
  }

  async adminPartnerSummary(partnerId: string) {
    const [codes, referredPatients, attributedBookings, recentAttempts] = await Promise.all([
      this.prisma.referralCode.findMany({ where: { partnerId }, orderBy: { issuedAt: 'desc' } }),
      this.prisma.patientReferral.groupBy({ by: ['status'], where: { partnerId }, _count: { _all: true } }),
      this.prisma.orderReferralAttribution.count({ where: { partnerId, referralStatusAtBooking: { not: 'REVOKED' } } }),
      this.prisma.referralAttempt.groupBy({ by: ['outcome'], where: { partnerId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } }, _count: { _all: true } }),
    ]);
    return {
      codes: codes.map((c) => ({ ...c, link: referralLink(this.appUrl, c.code) })),
      referredPatients: Object.fromEntries(referredPatients.map((r) => [r.status, r._count._all])),
      attributedBookings,
      attemptsLast30Days: Object.fromEntries(recentAttempts.map((r) => [r.outcome, r._count._all])),
    };
  }

  async adminAttempts(page = 1, outcome?: ClaimOutcome, pageSize = 30) {
    const where = outcome ? { outcome } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.referralAttempt.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.referralAttempt.count({ where }),
    ]);
    const partnerIds: string[] = [...new Set(items.map((i) => i.partnerId).filter((x): x is string => Boolean(x)))];
    const userIds: string[] = [...new Set(items.map((i) => i.userId).filter((x): x is string => Boolean(x)))];
    const [partners, users] = await Promise.all([
      this.prisma.referralPartner.findMany({ where: { id: { in: partnerIds } }, select: PARTNER_PUBLIC }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, phone: true, name: true } }),
    ]);
    const p = new Map(partners.map((x) => [x.id, x]));
    const u = new Map(users.map((x) => [x.id, x]));
    return {
      items: items.map((i) => ({ ...i, partner: i.partnerId ? (p.get(i.partnerId) ?? null) : null, user: i.userId ? (u.get(i.userId) ?? null) : null })),
      total,
      page,
      pageSize,
    };
  }

  private requireReason(raw: string | undefined): string {
    const reason = cleanText(raw);
    if (!reason || reason.length < 3) throw new BadRequestException('Please give a reason');
    return reason;
  }
}
