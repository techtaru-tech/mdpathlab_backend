import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type CommissionSetting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { writeAdminAudit, type AdminActor } from '../partners/admin/admin-audit.js';
import { BankCrypto } from './bank-crypto.js';
import { PayoutEmails } from './payout-emails.js';
import { ledgerTotals, tdsPaise, withdrawalBlocker } from './commission-policy.js';
import { RATE_ITEM_TYPES, type AdjustmentDto, type RateItemType, type SaveBankAccountDto, type SetRatesDto, type UpdateCommissionSettingsDto } from './dto/payouts.dto.js';

type Db = Prisma.TransactionClient | PrismaService;
const OPEN_WITHDRAWAL: ('REQUESTED' | 'APPROVED')[] = ['REQUESTED', 'APPROVED'];
const PAGE_SIZE = 25;
const RATES_PAGE_SIZE = 50;
const cleanQuery = (q: string | undefined) => (q ?? '').replace(/\s+/g, ' ').trim() || undefined;

const settingsView = (s: CommissionSetting) => ({
  enabled: s.enabled,
  activeSince: s.activeSince,
  ratePercent: Number(s.ratePercent),
  holdDays: s.holdDays,
  minWithdrawalRupees: s.minWithdrawalRupees,
  tdsPercent: Number(s.tdsPercent),
  updatedAt: s.updatedAt,
});

/**
 * Partner earnings, bank account and withdrawals. Balances are always computed from the ledger. Every money
 * movement for one partner runs under the same per-partner lock, so two requests at once (double-click, two tabs,
 * admin + partner) are serialised and can never overdraw. Payouts are manual: the admin transfers and records the UTR.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BankCrypto,
    private readonly emails: PayoutEmails,
    private readonly notifications: NotificationsService,
  ) {}

  async settings(db: Db = this.prisma): Promise<CommissionSetting> {
    return db.commissionSetting.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  }

  private lock(tx: Prisma.TransactionClient, partnerId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'partner-wallet:' + partnerId}, 0))`;
  }

  async totals(partnerId: string, db: Db = this.prisma) {
    const [byType, pending] = await Promise.all([
      db.commissionEntry.groupBy({ by: ['type'], where: { partnerId }, _sum: { amountPaise: true } }),
      db.commissionEntry.aggregate({ where: { partnerId, type: 'EARNING', availableAt: { gt: new Date() } }, _sum: { amountPaise: true } }),
    ]);
    return ledgerTotals(Object.fromEntries(byType.map((r) => [r.type, r._sum.amountPaise ?? 0])), pending._sum.amountPaise ?? 0);
  }

  // ---------------------------------------------------------------- partner side

  async partnerEarnings(partnerId: string) {
    const [partner, settings, totals, paidOut, open, bank, entries, withdrawals] = await Promise.all([
      this.prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { status: true } }),
      this.settings(),
      this.totals(partnerId),
      this.prisma.withdrawalRequest.aggregate({ where: { partnerId, status: 'PAID' }, _sum: { amountPaise: true } }),
      this.prisma.withdrawalRequest.findFirst({ where: { partnerId, status: { in: OPEN_WITHDRAWAL } }, select: { id: true } }),
      this.prisma.partnerBankAccount.findUnique({ where: { partnerId }, select: { accountHolderName: true, accountLast4: true, ifsc: true, updatedAt: true } }),
      this.prisma.commissionEntry.findMany({
        where: { partnerId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, type: true, amountPaise: true, availableAt: true, createdAt: true, note: true, order: { select: { orderNumber: true } } },
      }),
      this.prisma.withdrawalRequest.findMany({
        where: { partnerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, amountPaise: true, tdsPaise: true, netPaise: true, status: true, accountLast4: true, utr: true, adminNote: true, createdAt: true, paidAt: true },
      }),
    ]);
    const maxRupees = Math.floor(Math.max(0, totals.availablePaise) / 100);
    const blocker = withdrawalBlocker({
      enabled: settings.enabled,
      partnerApproved: partner?.status === 'APPROVED',
      hasBankAccount: Boolean(bank),
      hasOpenWithdrawal: Boolean(open),
      availablePaise: totals.availablePaise,
      amountPaise: maxRupees * 100,
      minWithdrawalRupees: settings.minWithdrawalRupees,
    });
    return {
      programme: { enabled: settings.enabled, ratePercent: Number(settings.ratePercent), holdDays: settings.holdDays, minWithdrawalRupees: settings.minWithdrawalRupees, tdsPercent: Number(settings.tdsPercent) },
      totals: { ...totals, paidOutPaise: paidOut._sum.amountPaise ?? 0 },
      maxWithdrawalRupees: maxRupees,
      canWithdraw: blocker === null,
      withdrawBlockedReason: blocker,
      bankAccount: bank,
      // Booking number only — never who the patient was.
      entries: entries.map((e) => ({ id: e.id, type: e.type, amountPaise: e.amountPaise, availableAt: e.availableAt, createdAt: e.createdAt, orderNumber: e.order?.orderNumber ?? null, note: e.type === 'EARNING' ? null : e.note })),
      withdrawals,
    };
  }

  async saveBankAccount(partnerId: string, dto: SaveBankAccountDto) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId } });
    if (partner?.status !== 'APPROVED') throw new BadRequestException('Only an approved account can add a bank account');
    const last4 = dto.accountNumber.slice(-4);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, partnerId);
      // A request in progress keeps its own copy of the old details; changing them now is refused so there's never
      // doubt about where a pending payout should go.
      if (await tx.withdrawalRequest.findFirst({ where: { partnerId, status: { in: OPEN_WITHDRAWAL } }, select: { id: true } })) {
        throw new BadRequestException('You cannot change your bank account while a withdrawal is in progress');
      }
      const data = { accountHolderName: dto.accountHolderName, accountNumberEnc: this.crypto.encrypt(dto.accountNumber), accountLast4: last4, ifsc: dto.ifsc };
      await tx.partnerBankAccount.upsert({ where: { partnerId }, create: { partnerId, ...data }, update: data });
      await tx.referralPartnerEvent.create({ data: { partnerId, event: 'BANK_ACCOUNT_SAVED', reason: `Account ending ${last4}, ${dto.ifsc}`, actorType: 'PARTNER', actorId: partnerId } });
    });
    this.emails.bankAccountChanged(partner, last4);
    return this.partnerEarnings(partnerId);
  }

  async requestWithdrawal(partnerId: string, amountRupees: number) {
    const amountPaise = amountRupees * 100;
    let created: { id: string } | null = null;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, partnerId);
        const [settings, partner, bank, open, totals] = await Promise.all([
          this.settings(tx),
          tx.referralPartner.findUnique({ where: { id: partnerId }, select: { status: true } }),
          tx.partnerBankAccount.findUnique({ where: { partnerId } }),
          tx.withdrawalRequest.findFirst({ where: { partnerId, status: { in: OPEN_WITHDRAWAL } }, select: { id: true } }),
          this.totals(partnerId, tx),
        ]);
        const blocker = withdrawalBlocker({
          enabled: settings.enabled,
          partnerApproved: partner?.status === 'APPROVED',
          hasBankAccount: Boolean(bank),
          hasOpenWithdrawal: Boolean(open),
          availablePaise: totals.availablePaise,
          amountPaise,
          minWithdrawalRupees: settings.minWithdrawalRupees,
        });
        if (blocker) throw new BadRequestException(blocker);
        const tds = tdsPaise(amountPaise, settings.tdsPercent);
        const w = await tx.withdrawalRequest.create({
          data: {
            partnerId,
            amountPaise,
            tdsPaise: tds,
            netPaise: amountPaise - tds,
            accountHolderName: bank!.accountHolderName,
            accountNumberEnc: bank!.accountNumberEnc,
            accountLast4: bank!.accountLast4,
            ifsc: bank!.ifsc,
          },
        });
        // The amount leaves the balance at once, so it can't be requested twice.
        await tx.commissionEntry.create({ data: { partnerId, type: 'WITHDRAWAL', amountPaise: -amountPaise, withdrawalId: w.id } });
        return { id: w.id };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You already have a withdrawal in progress');
      }
      throw err;
    }
    void this.notifications.notifyAdmins({
      title: 'New withdrawal request',
      body: `A partner asked to withdraw ₹${amountRupees.toLocaleString('en-IN')}. Review it in Admin → Payouts.`,
      data: { type: 'PARTNER_WITHDRAWAL_REQUESTED', withdrawalId: created.id },
    });
    return this.partnerEarnings(partnerId);
  }

  async cancelWithdrawal(partnerId: string, withdrawalId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, partnerId);
      const w = await tx.withdrawalRequest.findFirst({ where: { id: withdrawalId, partnerId } });
      if (!w) throw new NotFoundException('Withdrawal not found');
      const changed = await tx.withdrawalRequest.updateMany({ where: { id: w.id, status: 'REQUESTED' }, data: { status: 'CANCELLED', decidedAt: new Date() } });
      if (changed.count !== 1) throw new BadRequestException('Only a request that has not been approved yet can be cancelled');
      await tx.commissionEntry.create({ data: { partnerId, type: 'WITHDRAWAL_RETURNED', amountPaise: w.amountPaise, withdrawalId: w.id, note: 'Withdrawal cancelled' } });
    });
    return this.partnerEarnings(partnerId);
  }

  // ---------------------------------------------------------------- admin side

  async adminSettings() {
    return settingsView(await this.settings());
  }

  async adminUpdateSettings(dto: UpdateCommissionSettingsDto, admin: AdminActor) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await this.settings(tx);
      const turningOn = dto.enabled === true && !before.enabled;
      const after = await tx.commissionSetting.update({
        where: { id: 'default' },
        data: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          // Only bookings placed from now on earn — switching on never pays for bookings made while it was off.
          ...(turningOn ? { activeSince: new Date() } : {}),
          ...(dto.ratePercent !== undefined ? { ratePercent: new Prisma.Decimal(dto.ratePercent) } : {}),
          ...(dto.holdDays !== undefined ? { holdDays: dto.holdDays } : {}),
          ...(dto.minWithdrawalRupees !== undefined ? { minWithdrawalRupees: dto.minWithdrawalRupees } : {}),
          ...(dto.tdsPercent !== undefined ? { tdsPercent: new Prisma.Decimal(dto.tdsPercent) } : {}),
        },
      });
      await writeAdminAudit(tx, admin, { action: 'COMMISSION_SETTINGS_UPDATE', entityType: 'CommissionSetting', entityId: 'default', reason: dto.reason ?? null, before: settingsView(before), after: settingsView(after) });
      return after;
    });
    return settingsView(updated);
  }

  async adminWithdrawals(status: string | undefined, page = 1) {
    const where: Prisma.WithdrawalRequestWhereInput = status ? { status: status as never } : {};
    const [items, total, counts] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, amountPaise: true, tdsPaise: true, netPaise: true, status: true, accountHolderName: true, accountLast4: true, ifsc: true, utr: true, createdAt: true, decidedAt: true, paidAt: true,
          partner: { select: { id: true, type: true, displayName: true, phone: true } },
        },
      }),
      this.prisma.withdrawalRequest.count({ where }),
      this.prisma.withdrawalRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return { items, total, page, pageSize: PAGE_SIZE, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
  }

  /** Full bank details for making the transfer. Every view is written to the audit log. */
  async adminWithdrawal(id: string, admin: AdminActor) {
    const w = await this.prisma.withdrawalRequest.findUnique({
      where: { id },
      include: { partner: { select: { id: true, type: true, displayName: true, phone: true, email: true, status: true } } },
    });
    if (!w) throw new NotFoundException('Withdrawal not found');
    let accountNumber: string | null = null;
    try {
      accountNumber = this.crypto.decrypt(w.accountNumberEnc);
    } catch {
      accountNumber = null; // key changed — the admin sees the last 4 digits and asks the partner to re-enter
    }
    await writeAdminAudit(this.prisma, admin, { action: 'WITHDRAWAL_BANK_DETAILS_VIEWED', entityType: 'WithdrawalRequest', entityId: id });
    const { accountNumberEnc: _enc, ...rest } = w;
    return { ...rest, accountNumber, partnerTotals: await this.totals(w.partnerId) };
  }

  private async decide(id: string, from: ('REQUESTED' | 'APPROVED')[], to: 'APPROVED' | 'REJECTED' | 'PAID', admin: AdminActor, extra: { utr?: string; reason?: string }) {
    const w = await this.prisma.withdrawalRequest.findUnique({ where: { id }, include: { partner: { select: { email: true, displayName: true } } } });
    if (!w) throw new NotFoundException('Withdrawal not found');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, w.partnerId);
      const now = new Date();
      const changed = await tx.withdrawalRequest.updateMany({
        where: { id, status: { in: from } },
        data: {
          status: to,
          decidedByAdminId: admin.sub,
          decidedAt: now,
          ...(to === 'PAID' ? { paidAt: now, utr: extra.utr } : {}),
          ...(extra.reason ? { adminNote: extra.reason } : {}),
        },
      });
      if (changed.count !== 1) throw new ConflictException('This withdrawal has already been handled — refresh and try again');
      if (to === 'REJECTED') {
        await tx.commissionEntry.create({ data: { partnerId: w.partnerId, type: 'WITHDRAWAL_RETURNED', amountPaise: w.amountPaise, withdrawalId: id, note: 'Withdrawal not processed', createdByAdminId: admin.sub } });
      }
      await writeAdminAudit(tx, admin, { action: `WITHDRAWAL_${to}`, entityType: 'WithdrawalRequest', entityId: id, reason: extra.reason ?? null, before: { status: w.status }, after: { status: to, ...(extra.utr ? { utr: extra.utr } : {}) } });
    });
    if (to === 'PAID') this.emails.withdrawalPaid(w.partner, w.netPaise, w.accountLast4, extra.utr!);
    if (to === 'REJECTED') this.emails.withdrawalRejected(w.partner, w.amountPaise, extra.reason!);
    return this.adminWithdrawal(id, admin);
  }

  approve(id: string, admin: AdminActor) {
    return this.decide(id, ['REQUESTED'], 'APPROVED', admin, {});
  }

  reject(id: string, reason: string, admin: AdminActor) {
    return this.decide(id, ['REQUESTED', 'APPROVED'], 'REJECTED', admin, { reason });
  }

  // Two steps on purpose: approve (checked), then transfer and record the UTR.
  markPaid(id: string, utr: string, admin: AdminActor) {
    return this.decide(id, ['APPROVED'], 'PAID', admin, { utr });
  }

  /** Every partner with ledger activity, with their balance. */
  async adminBalances() {
    const [sums, pending, paid] = await Promise.all([
      this.prisma.commissionEntry.groupBy({ by: ['partnerId'], _sum: { amountPaise: true } }),
      this.prisma.commissionEntry.groupBy({ by: ['partnerId'], where: { type: 'EARNING', availableAt: { gt: new Date() } }, _sum: { amountPaise: true } }),
      this.prisma.withdrawalRequest.groupBy({ by: ['partnerId'], where: { status: 'PAID' }, _sum: { amountPaise: true } }),
    ]);
    const ids = sums.map((s) => s.partnerId);
    const partners = await this.prisma.referralPartner.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, displayName: true, phone: true, status: true } });
    const pend = new Map(pending.map((p) => [p.partnerId, p._sum.amountPaise ?? 0]));
    const paidOut = new Map(paid.map((p) => [p.partnerId, p._sum.amountPaise ?? 0]));
    return partners
      .map((p) => {
        const balancePaise = sums.find((s) => s.partnerId === p.id)?._sum.amountPaise ?? 0;
        const pendingPaise = pend.get(p.id) ?? 0;
        return { partner: p, balancePaise, pendingPaise, availablePaise: balancePaise - pendingPaise, paidOutPaise: paidOut.get(p.id) ?? 0 };
      })
      .sort((a, b) => b.balancePaise - a.balancePaise);
  }

  async adminPartnerLedger(partnerId: string) {
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true, type: true, displayName: true, phone: true, status: true } });
    if (!partner) throw new NotFoundException('Partner not found');
    const [totals, entries, bank] = await Promise.all([
      this.totals(partnerId),
      this.prisma.commissionEntry.findMany({ where: { partnerId }, orderBy: { createdAt: 'desc' }, take: 200, include: { order: { select: { orderNumber: true } } } }),
      this.prisma.partnerBankAccount.findUnique({ where: { partnerId }, select: { accountHolderName: true, accountLast4: true, ifsc: true, updatedAt: true } }),
    ]);
    return { partner, totals, bankAccount: bank, entries };
  }

  // ---------------------------------------------------------------- test-wise rates

  /** One page of a catalogue type with each item's own commission rate (null = uses the default). */
  private async catalogueItems(type: RateItemType, where: { q?: string; ids?: string[] }, page?: number) {
    const take = page ? RATES_PAGE_SIZE : undefined;
    const skip = page ? (page - 1) * RATES_PAGE_SIZE : undefined;
    const name = where.q ? { contains: where.q, mode: 'insensitive' as const } : undefined;
    const ids = where.ids ? { in: where.ids } : undefined;
    // ₹0 rows (e.g. markers that are only booked inside a profile) can never earn, so the list leaves them out.
    const price = where.ids ? undefined : { gt: 0 };
    const orderBy = { name: 'asc' as const };
    switch (type) {
      case 'PARAMETER': {
        const w = { id: ids, price, ...(name ? { OR: [{ name }, { code: name }] } : {}) };
        const [rows, total] = await Promise.all([this.prisma.parameter.findMany({ where: w, orderBy, take, skip, select: { id: true, name: true, code: true, price: true, status: true } }), this.prisma.parameter.count({ where: w })]);
        return { rows: rows.map((r) => ({ ...r, code: r.code })), total };
      }
      case 'PROFILE': {
        const w = { id: ids, price, ...(name ? { OR: [{ name }, { testCode: name }] } : {}) };
        const [rows, total] = await Promise.all([this.prisma.profile.findMany({ where: w, orderBy, take, skip, select: { id: true, name: true, testCode: true, price: true, status: true } }), this.prisma.profile.count({ where: w })]);
        return { rows: rows.map(({ testCode, ...r }) => ({ ...r, code: testCode })), total };
      }
      case 'PACKAGE': {
        const w = { id: ids, price, ...(name ? { name } : {}) };
        const [rows, total] = await Promise.all([this.prisma.package.findMany({ where: w, orderBy, take, skip, select: { id: true, name: true, price: true, status: true } }), this.prisma.package.count({ where: w })]);
        return { rows: rows.map((r) => ({ ...r, code: null })), total };
      }
      case 'RADIOLOGY': {
        const w = { id: ids, price, ...(name ? { OR: [{ name }, { testCode: name }] } : {}) };
        const [rows, total] = await Promise.all([this.prisma.radiologyTest.findMany({ where: w, orderBy, take, skip, select: { id: true, name: true, testCode: true, price: true, status: true } }), this.prisma.radiologyTest.count({ where: w })]);
        return { rows: rows.map(({ testCode, ...r }) => ({ ...r, code: testCode })), total };
      }
    }
  }

  async adminRates(type: RateItemType, q: string | undefined, page = 1) {
    const [{ rows, total }, settings] = await Promise.all([this.catalogueItems(type, { q: cleanQuery(q) }, page), this.settings()]);
    const own = await this.prisma.commissionRate.findMany({ where: { itemType: type, itemId: { in: rows.map((r) => r.id) } } });
    const rateOf = new Map(own.map((r) => [r.itemId, Number(r.ratePercent)]));
    return {
      items: rows.map((r) => ({ itemType: type, itemId: r.id, name: r.name, code: r.code, priceRupees: r.price, status: r.status, ratePercent: rateOf.get(r.id) ?? null })),
      total,
      page,
      pageSize: RATES_PAGE_SIZE,
      defaultRatePercent: Number(settings.ratePercent),
    };
  }

  /** Sets (or clears, with null) the rate of each item. New bookings use it; existing bookings keep their rate. */
  async adminSetRates(dto: SetRatesDto, admin: AdminActor) {
    // Every item must exist in the catalogue — no rates for made-up ids.
    for (const type of RATE_ITEM_TYPES) {
      const ids = [...new Set(dto.changes.filter((c) => c.itemType === type).map((c) => c.itemId))];
      if (ids.length === 0) continue;
      const { rows } = await this.catalogueItems(type, { ids });
      if (rows.length !== ids.length) throw new BadRequestException('One or more tests were not found — refresh and try again');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const keys = dto.changes.map((c) => ({ itemType: c.itemType, itemId: c.itemId }));
      const before = await tx.commissionRate.findMany({ where: { OR: keys } });
      for (const c of dto.changes) {
        const id = { itemType_itemId: { itemType: c.itemType, itemId: c.itemId } };
        if (c.ratePercent === null || c.ratePercent === undefined) {
          await tx.commissionRate.deleteMany({ where: { itemType: c.itemType, itemId: c.itemId } });
        } else {
          const ratePercent = new Prisma.Decimal(c.ratePercent);
          await tx.commissionRate.upsert({ where: id, create: { itemType: c.itemType, itemId: c.itemId, ratePercent, updatedByAdminId: admin.sub }, update: { ratePercent, updatedByAdminId: admin.sub } });
        }
      }
      await writeAdminAudit(tx, admin, {
        action: 'COMMISSION_RATES_UPDATE',
        entityType: 'CommissionRate',
        entityId: dto.changes.length === 1 ? `${dto.changes[0]!.itemType}:${dto.changes[0]!.itemId}` : `${dto.changes.length} items`,
        reason: dto.reason ?? null,
        before: before.map((b) => ({ itemType: b.itemType, itemId: b.itemId, ratePercent: Number(b.ratePercent) })),
        after: dto.changes.map((c) => ({ itemType: c.itemType, itemId: c.itemId, ratePercent: c.ratePercent ?? null })),
      });
      return dto.changes.length;
    });
    return { updated: result };
  }

  async adminAdjust(partnerId: string, dto: AdjustmentDto, admin: AdminActor) {
    const amountPaise = Math.round(dto.amountRupees * 100);
    const partner = await this.prisma.referralPartner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) throw new NotFoundException('Partner not found');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, partnerId);
      const entry = await tx.commissionEntry.create({ data: { partnerId, type: 'ADJUSTMENT', amountPaise, note: dto.reason, createdByAdminId: admin.sub } });
      await writeAdminAudit(tx, admin, { action: 'COMMISSION_ADJUSTMENT', entityType: 'CommissionEntry', entityId: entry.id, reason: dto.reason, after: { partnerId, amountPaise } });
    });
    return this.adminPartnerLedger(partnerId);
  }
}
