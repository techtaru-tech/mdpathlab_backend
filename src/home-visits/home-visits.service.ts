import { randomInt } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { HomeVisitStatus, HomeVisitWindow, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LabsService } from '../labs/labs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { MailService } from '../mail/mail.service.js';
import { SmsService } from '../sms/sms.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { cancelOrderOnce } from '../orders/cancel-order.js';
import { isValidCalendarDateString, istInstant, todayIstDateString } from '../common/ist-time.js';
import { CreateHomeCollectionRequestDto } from './dto/create-home-collection-request.dto.js';

// Visit windows in IST. The customer picks a window, not an exact time.
export const HOME_VISIT_WINDOWS: Record<HomeVisitWindow, { start: string; end: string; label: string }> = {
  MORNING: { start: '07:00', end: '11:00', label: '7 AM – 11 AM' },
  AFTERNOON: { start: '11:00', end: '15:00', label: '11 AM – 3 PM' },
  EVENING: { start: '15:00', end: '19:00', label: '3 PM – 7 PM' },
};

/** "2026-11-03, 7 AM – 11 AM" — how a visit's date and window read in notifications. */
const visitWhen = (r: { preferredDate: Date; preferredWindow: HomeVisitWindow }) =>
  `${r.preferredDate.toISOString().slice(0, 10)}, ${HOME_VISIT_WINDOWS[r.preferredWindow].label}`;

/** "9:30 am" in IST. */
const istTime = (d: Date) => d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });

// Requests that are still alive — used by the duplicate guard.
const OPEN_STATUSES: HomeVisitStatus[] = ['REQUESTED', 'ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'TESTS_ADDED'];
const MAX_DAYS_AHEAD = 6;
// Where an admin-entered request came from.
export const HOME_VISIT_SOURCES = ['PHONE', 'WHATSAPP', 'WALK_IN', 'OTHER'] as const;
export type HomeVisitSource = (typeof HOME_VISIT_SOURCES)[number];
// Before the phlebotomist reaches the door, only admin may put tests on a visit (e.g. asked for on the phone).
const ADMIN_TEST_STATUSES: HomeVisitStatus[] = ['REQUESTED', 'ASSIGNED', 'ON_THE_WAY', 'ARRIVED'];

const requestInclude = {
  phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
  order: { select: { id: true, orderNumber: true, status: true, total: true, reachedAt: true } },
  user: { select: { name: true, phone: true } },
} satisfies Prisma.HomeCollectionRequestInclude;

type RequestWithRelations = Prisma.HomeCollectionRequestGetPayload<{ include: typeof requestInclude }>;

@Injectable()
export class HomeVisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labs: LabsService,
    private readonly notifications: NotificationsService,
    private readonly orders: OrdersService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly wallet: WalletService,
  ) {}

  /**
   * COLLECTED / COMPLETED are never stored — once tests are added the linked order owns that part
   * of the journey, so they are derived from it. A cancelled order also cancels the visit.
   */
  private effectiveStatus(r: RequestWithRelations): HomeVisitStatus {
    if (r.order) {
      if (r.order.status === 'CANCELLED') return 'CANCELLED';
      if (r.order.status === 'REPORT_READY') return 'COMPLETED';
      if (r.order.status === 'SAMPLE_COLLECTED' || r.order.status === 'IN_LAB') return 'COLLECTED';
    }
    return r.status;
  }

  private serialize(r: RequestWithRelations) {
    return {
      id: r.id,
      status: this.effectiveStatus(r),
      patientName: r.patientName,
      phone: r.phone,
      age: r.age,
      gender: r.gender,
      concern: r.concern,
      addressId: r.addressId,
      address: r.address,
      city: r.city,
      pincode: r.pincode,
      lat: r.lat,
      lng: r.lng,
      preferredDate: r.preferredDate.toISOString().slice(0, 10),
      preferredWindow: r.preferredWindow,
      windowLabel: HOME_VISIT_WINDOWS[r.preferredWindow].label,
      eta: r.eta,
      phlebotomist: r.phlebotomist
        ? { id: r.phlebotomist.id, name: r.phlebotomist.user.name, phone: r.phlebotomist.user.phone }
        : null,
      orderId: r.orderId,
      orderNumber: r.order?.orderNumber ?? null,
      // What the tests on this visit come to (pay on collection) — null until tests are added.
      orderTotal: r.order?.total ?? null,
      source: r.source,
      createdBy: r.createdBy,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt,
    };
  }

  // ---------- Customer ----------

  /** `byAdmin` — entered by admin for a call / WhatsApp / walk-in enquiry; the customer is told it was booked for them. */
  async create(userId: string, dto: CreateHomeCollectionRequestDto, byAdmin?: { email: string; source: HomeVisitSource }) {
    if (!isValidCalendarDateString(dto.preferredDate)) {
      throw new BadRequestException('Preferred date is not a valid date');
    }
    const today = todayIstDateString();
    const daysAhead = Math.round((Date.parse(`${dto.preferredDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    if (daysAhead < 0) throw new BadRequestException('Preferred date cannot be in the past');
    if (daysAhead > MAX_DAYS_AHEAD) throw new BadRequestException(`Please choose a date within the next ${MAX_DAYS_AHEAD} days`);

    const window = HOME_VISIT_WINDOWS[dto.preferredWindow];
    if (daysAhead === 0 && istInstant(dto.preferredDate, window.end).getTime() <= Date.now()) {
      throw new BadRequestException('This time window has already passed — please choose a later window or another day');
    }

    if (dto.addressId) {
      const address = await this.prisma.address.findUnique({ where: { id: dto.addressId } });
      if (!address || address.userId !== userId || address.deletedAt) throw new BadRequestException('Address not found');
    }

    // Same pincode-coverage rule checkout and /labs/serviceability use — pincode only, since no
    // tests are chosen yet.
    const lab = await this.labs.findMatchingLab(dto.pincode);
    if (!lab) {
      throw new BadRequestException('We are not yet available at this pincode — please try a different address or ask to be notified.');
    }

    const duplicate = await this.prisma.homeCollectionRequest.findFirst({
      where: {
        userId,
        preferredDate: new Date(`${dto.preferredDate}T00:00:00Z`),
        preferredWindow: dto.preferredWindow,
        status: { in: OPEN_STATUSES },
      },
    });
    if (duplicate) {
      throw new ConflictException('You already have a home visit request for this date and time window');
    }

    const created = await this.prisma.homeCollectionRequest.create({
      data: {
        userId,
        patientName: dto.patientName.trim(),
        phone: dto.phone,
        age: dto.age ?? null,
        gender: dto.gender ?? null,
        concern: dto.concern ?? null,
        addressId: dto.addressId ?? null,
        address: dto.address.trim(),
        city: dto.city.trim(),
        pincode: dto.pincode,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        preferredDate: new Date(`${dto.preferredDate}T00:00:00Z`),
        preferredWindow: dto.preferredWindow,
        labId: lab.id,
        source: byAdmin?.source ?? null,
        createdBy: byAdmin?.email ?? null,
      },
    });

    // Admin entering it already knows; everyone else learns from the alert.
    if (!byAdmin) {
      await this.notifications.notifyAdmins({
        title: 'New home visit request',
        body: `${created.patientName} — ${dto.preferredDate}, ${window.label}, ${created.city} ${created.pincode}`,
        data: { type: 'HOME_VISIT_REQUESTED', requestId: created.id },
      });
    }
    // The customer's own confirmation — app/website notification and email.
    await this.notifications.notifyUser(userId, {
      title: byAdmin ? 'Home visit booked for you' : 'Home visit requested',
      body: `${dto.preferredDate}, ${window.label} — we'll assign a phlebotomist and let you know.`,
      data: { type: 'HOME_VISIT_STATUS', requestId: created.id, status: 'REQUESTED' },
    });
    void this.mail.homeVisitUpdate(userId, 'home-visit-requested', {
      subject: 'Your home visit is booked',
      heading: 'Home visit requested',
      lines: ["We've received your home visit request. We'll assign a phlebotomist and let you know who is coming."],
      rows: [
        ['Patient', created.patientName],
        ['Date', dto.preferredDate],
        ['Time window', window.label],
        ['Address', `${created.address}, ${created.city} ${created.pincode}`],
      ],
    });

    if (byAdmin) return this.adminGet(created.id);
    return {
      id: created.id,
      status: created.status,
      preferredDate: dto.preferredDate,
      preferredWindow: created.preferredWindow,
      createdAt: created.createdAt,
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.homeCollectionRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: requestInclude,
    });
    return rows.map((r) => this.serialize(r));
  }

  async getMine(userId: string, id: string) {
    const row = await this.prisma.homeCollectionRequest.findUnique({ where: { id }, include: requestInclude });
    if (!row || row.userId !== userId) throw new NotFoundException('Home visit request not found');
    return this.serialize(row);
  }

  async cancelMine(userId: string, id: string, reason?: string) {
    const row = await this.prisma.homeCollectionRequest.findUnique({ where: { id }, include: requestInclude });
    if (!row || row.userId !== userId) throw new NotFoundException('Home visit request not found');
    const status = this.effectiveStatus(row);
    if (status !== 'REQUESTED' && status !== 'ASSIGNED') {
      throw new BadRequestException('This request can no longer be cancelled');
    }
    const updated = await this.prisma.homeCollectionRequest.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason ?? 'Cancelled by customer' },
      include: requestInclude,
    });
    await this.cancelLinkedOrder(row, 'Home visit cancelled by the customer', 'PATIENT');
    await this.notifications.notifyUser(userId, {
      title: 'Home visit cancelled',
      body: `Your home visit on ${visitWhen(row)} has been cancelled.`,
      data: { type: 'HOME_VISIT_STATUS', requestId: id, status: 'CANCELLED' },
    });
    if (row.phlebotomist) {
      await this.notifications.notifyPhlebotomistUser(row.phlebotomist.userId, {
        title: 'Home visit cancelled',
        body: `The customer cancelled the visit for ${row.patientName} on ${row.preferredDate.toISOString().slice(0, 10)} — please do not go.`,
        data: { type: 'HOME_VISIT_CANCELLED', requestId: id },
      });
    }
    await this.notifications.notifyAdmins({
      title: 'Home visit cancelled',
      body: `${updated.patientName} cancelled their ${updated.preferredDate.toISOString().slice(0, 10)} home visit`,
      data: { type: 'HOME_VISIT_CANCELLED', requestId: id },
    });
    return this.serialize(updated);
  }

  // ---------- Admin ----------

  async adminList(filters: { city?: string; date?: string; status?: string }) {
    const where: Prisma.HomeCollectionRequestWhereInput = {};
    if (filters.city) where.city = { equals: filters.city.trim(), mode: 'insensitive' };
    if (filters.date && isValidCalendarDateString(filters.date)) where.preferredDate = new Date(`${filters.date}T00:00:00Z`);
    if (filters.status) where.status = filters.status as HomeVisitStatus;
    const rows = await this.prisma.homeCollectionRequest.findMany({
      where,
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
      include: requestInclude,
    });
    return rows.map((r) => ({ ...this.serialize(r), customer: r.user }));
  }

  async adminGet(id: string) {
    const row = await this.requireRequest(id);
    return { ...this.serialize(row), customer: row.user };
  }

  /**
   * Admin corrects a visit (patient details, address, date / window, where the enquiry came from) until the
   * phlebotomist sets off. A new pincode is re-matched to the lab that covers it; a new date moves the visit's
   * booking too. The customer — and the phlebotomist, if one is assigned — is told.
   */
  async adminUpdate(
    id: string,
    dto: Partial<Omit<CreateHomeCollectionRequestDto, 'addressId' | 'lat' | 'lng'>> & { source?: HomeVisitSource | undefined },
  ) {
    const row = await this.requireRequest(id);
    if (row.status !== 'REQUESTED' && row.status !== 'ASSIGNED') {
      throw new BadRequestException('This visit can only be changed before the phlebotomist sets off');
    }
    const date = dto.preferredDate ?? row.preferredDate.toISOString().slice(0, 10);
    const windowKey = dto.preferredWindow ?? row.preferredWindow;
    const whenChanged = date !== row.preferredDate.toISOString().slice(0, 10) || windowKey !== row.preferredWindow;
    if (whenChanged) {
      if (!isValidCalendarDateString(date)) throw new BadRequestException('Preferred date is not a valid date');
      const daysAhead = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayIstDateString()}T00:00:00Z`)) / 86_400_000);
      if (daysAhead < 0) throw new BadRequestException('Preferred date cannot be in the past');
      if (daysAhead > MAX_DAYS_AHEAD) throw new BadRequestException(`Please choose a date within the next ${MAX_DAYS_AHEAD} days`);
      if (daysAhead === 0 && istInstant(date, HOME_VISIT_WINDOWS[windowKey].end).getTime() <= Date.now()) {
        throw new BadRequestException('This time window has already passed — please choose a later window or another day');
      }
    }
    const addressChanged =
      (dto.address !== undefined && dto.address.trim() !== row.address) ||
      (dto.city !== undefined && dto.city.trim() !== row.city) ||
      (dto.pincode !== undefined && dto.pincode !== row.pincode);
    if (addressChanged && row.orderId) {
      throw new BadRequestException("Tests are already on this visit's booking — change the address from the booking page");
    }
    let labId = row.labId;
    if (dto.pincode !== undefined && dto.pincode !== row.pincode) {
      const lab = await this.labs.findMatchingLab(dto.pincode);
      if (!lab) throw new BadRequestException('We are not yet available at this pincode');
      if (row.phlebotomistId && lab.id !== row.labId) {
        const p = await this.prisma.phlebotomist.findUnique({ where: { id: row.phlebotomistId }, select: { labId: true } });
        if (p?.labId && p.labId !== lab.id) throw new BadRequestException("The assigned phlebotomist's lab doesn't cover this pincode — cancel this visit and create a new one");
      }
      labId = lab.id;
    }

    const updated = await this.prisma.homeCollectionRequest.update({
      where: { id },
      data: {
        ...(dto.patientName !== undefined ? { patientName: dto.patientName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.age !== undefined ? { age: dto.age } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender || null } : {}),
        ...(dto.concern !== undefined ? { concern: dto.concern || null } : {}),
        ...(addressChanged
          ? {
              address: (dto.address ?? row.address).trim(),
              city: (dto.city ?? row.city).trim(),
              pincode: dto.pincode ?? row.pincode,
              // Typed in fresh, so it no longer matches the saved address or its map pin.
              addressId: null,
              lat: null,
              lng: null,
              labId,
            }
          : {}),
        ...(whenChanged ? { preferredDate: new Date(`${date}T00:00:00Z`), preferredWindow: windowKey } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
      },
      include: requestInclude,
    });
    if (whenChanged && row.orderId) {
      await this.prisma.order.update({ where: { id: row.orderId }, data: { scheduledDate: new Date(`${date}T00:00:00Z`) } });
    }

    if (whenChanged || addressChanged) {
      const what = [whenChanged ? `now ${visitWhen(updated)}` : '', addressChanged ? `at ${updated.address}, ${updated.city} ${updated.pincode}` : ''].filter(Boolean).join(', ');
      await this.notifications.notifyUser(row.userId, {
        title: 'Home visit updated',
        body: `Your home visit is ${what}.`,
        data: { type: 'HOME_VISIT_STATUS', requestId: id, status: updated.status },
      });
      if (row.phlebotomist) {
        await this.notifications.notifyPhlebotomistUser(row.phlebotomist.userId, {
          title: 'Home visit updated',
          body: `${updated.patientName} — ${what}.`,
          data: { type: 'HOME_VISIT_ASSIGNED', requestId: id },
        });
      }
    }
    return { ...this.serialize(updated), customer: updated.user };
  }

  async assign(id: string, phlebotomistId: string, eta?: string) {
    const row = await this.requireRequest(id);
    if (row.status !== 'REQUESTED' && row.status !== 'ASSIGNED') {
      throw new BadRequestException('A phlebotomist can only be assigned before the visit starts');
    }
    const phlebotomist = await this.prisma.phlebotomist.findUnique({ where: { id: phlebotomistId } });
    if (!phlebotomist) throw new NotFoundException('Phlebotomist not found');
    if (phlebotomist.status !== 'ACTIVE') throw new BadRequestException('This phlebotomist is not active');
    if (row.labId && phlebotomist.labId && phlebotomist.labId !== row.labId) {
      throw new BadRequestException("This phlebotomist belongs to a different lab than the one covering this pincode");
    }

    const updated = await this.prisma.homeCollectionRequest.update({
      where: { id },
      data: { status: 'ASSIGNED', phlebotomistId, eta: eta ? new Date(eta) : row.eta },
      include: requestInclude,
    });
    // Tests already added (by admin, before the visit): the booking follows the visit's phlebotomist.
    if (row.order && (row.order.status === 'CONFIRMED' || row.order.status === 'PHLEBOTOMIST_ASSIGNED')) {
      await this.prisma.order.update({
        where: { id: row.order.id },
        data: {
          phlebotomistId,
          status: 'PHLEBOTOMIST_ASSIGNED',
          assignmentStatus: 'ACCEPTED',
          statusLogs: { create: { status: 'PHLEBOTOMIST_ASSIGNED', note: 'Phlebotomist assigned to the home visit', changedBy: 'SYSTEM' } },
        },
      });
    }
    const when = `${updated.preferredDate.toISOString().slice(0, 10)}, ${HOME_VISIT_WINDOWS[updated.preferredWindow].label}`;
    if (row.phlebotomistId !== phlebotomistId) {
      await this.notifications.notifyPhlebotomistUser(phlebotomist.userId, {
        title: 'New home visit assigned',
        body: `${updated.patientName} — ${when}, ${updated.city} ${updated.pincode}`,
        data: { type: 'HOME_VISIT_ASSIGNED', requestId: id },
      });
      if (row.phlebotomist) {
        await this.notifications.notifyPhlebotomistUser(row.phlebotomist.userId, {
          title: 'Home visit reassigned',
          body: `The ${when} visit for ${updated.patientName} was given to another phlebotomist.`,
          data: { type: 'HOME_VISIT_REASSIGNED', requestId: id },
        });
      }
    }
    const who = updated.phlebotomist?.user.name ?? 'A phlebotomist';
    await this.notifications.notifyUser(row.userId, {
      title: row.phlebotomistId && row.phlebotomistId !== phlebotomistId ? 'Your phlebotomist has changed' : 'Phlebotomist assigned',
      body: `${who}${updated.phlebotomist ? ` (${updated.phlebotomist.user.phone})` : ''} will visit on ${visitWhen(updated)}${updated.eta ? `, around ${istTime(updated.eta)}` : ''}.`,
      data: { type: 'HOME_VISIT_STATUS', requestId: id, status: 'ASSIGNED' },
    });
    void this.mail.homeVisitAssigned(row.userId, {
      phlebotomist: updated.phlebotomist?.user.name ?? 'Your phlebotomist',
      date: updated.preferredDate.toISOString().slice(0, 10),
      window: HOME_VISIT_WINDOWS[updated.preferredWindow].label,
    });
    return { ...this.serialize(updated), customer: updated.user };
  }

  async setStatus(
    id: string,
    status: 'ON_THE_WAY' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED',
    opts: { eta?: string; reason?: string; cancelledBy?: string },
  ) {
    const row = await this.requireRequest(id);
    const current = row.status;

    const allowedFrom: Record<typeof status, HomeVisitStatus[]> = {
      ON_THE_WAY: ['ASSIGNED'],
      ARRIVED: ['ASSIGNED', 'ON_THE_WAY'],
      NO_SHOW: ['ASSIGNED', 'ON_THE_WAY', 'ARRIVED'],
      CANCELLED: ['REQUESTED', 'ASSIGNED', 'ON_THE_WAY', 'ARRIVED'],
    };
    if (!allowedFrom[status].includes(current)) {
      throw new BadRequestException(`Cannot move a ${current} request to ${status}`);
    }
    if ((status === 'ON_THE_WAY' || status === 'ARRIVED') && !row.phlebotomistId) {
      throw new BadRequestException('Assign a phlebotomist first');
    }

    const updated = await this.prisma.homeCollectionRequest.update({
      where: { id },
      data: {
        status,
        ...(opts.eta ? { eta: new Date(opts.eta) } : {}),
        ...(status === 'CANCELLED' ? { cancelReason: opts.reason ?? `Cancelled by ${opts.cancelledBy ?? 'admin'}` } : {}),
        // Tests were put on the visit before arrival: at the door it carries on exactly as tests added there.
        ...(status === 'ARRIVED' && row.order && row.order.status !== 'CANCELLED' ? { status: 'TESTS_ADDED' as const } : {}),
      },
      include: requestInclude,
    });
    await this.syncLinkedOrder(row, status, opts.reason);

    const who = updated.phlebotomist?.user.name ?? 'Your phlebotomist';
    const messages: Partial<Record<typeof status, { title: string; body: string }>> = {
      ON_THE_WAY: { title: 'Phlebotomist is on the way', body: `${who} has left for your address${updated.eta ? ` — expected around ${istTime(updated.eta)}` : ''}.` },
      ARRIVED: { title: 'Phlebotomist has arrived', body: `${who} has reached your address.` },
      CANCELLED: { title: 'Home visit cancelled', body: opts.reason ?? `Your home visit on ${visitWhen(updated)} was cancelled.` },
      NO_SHOW: { title: 'Home visit missed', body: 'We could not complete your home visit. Please book a new one.' },
    };
    // Cancelled or missed by us: also by email, so the customer isn't left waiting.
    if (status === 'CANCELLED' || status === 'NO_SHOW') {
      void this.mail.homeVisitUpdate(row.userId, status === 'CANCELLED' ? 'home-visit-cancelled' : 'home-visit-missed', {
        subject: status === 'CANCELLED' ? 'Your home visit was cancelled' : 'We missed your home visit',
        heading: status === 'CANCELLED' ? 'Home visit cancelled' : 'Home visit missed',
        lines: [
          status === 'CANCELLED' ? (opts.reason ? `Reason: ${opts.reason}` : 'Your home visit request was cancelled.') : 'We could not complete your home visit.',
          'You can book a new home visit from the website or the app at any time.',
        ],
        rows: [
          ['Patient', updated.patientName],
          ['Date', updated.preferredDate.toISOString().slice(0, 10)],
          ['Time window', HOME_VISIT_WINDOWS[updated.preferredWindow].label],
        ],
      });
    }
    if (status === 'CANCELLED' && row.phlebotomist) {
      await this.notifications.notifyPhlebotomistUser(row.phlebotomist.userId, {
        title: 'Home visit cancelled',
        body: `The visit for ${row.patientName} on ${row.preferredDate.toISOString().slice(0, 10)} was cancelled — please do not go.`,
        data: { type: 'HOME_VISIT_CANCELLED', requestId: id },
      });
    }
    const msg = messages[status];
    if (msg) {
      await this.notifications.notifyUser(row.userId, { ...msg, data: { type: 'HOME_VISIT_STATUS', requestId: id, status } });
    }
    return { ...this.serialize(updated), customer: updated.user };
  }

  /**
   * Puts tests on the visit and turns the request into an Order. The phlebotomist does this at the door; admin can
   * also do it earlier (`adminEmail`), e.g. when the patient says on the phone what they need. Tests on a visit that
   * already has its booking are added to that booking instead (AdminHomeVisitsController → AdminBookingsService).
   */
  async addItems(id: string, items: { itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY'; itemId: string }[], adminEmail?: string) {
    const row = await this.requireRequest(id);
    if (row.orderId) throw new BadRequestException('Tests were already added to this request');
    if (adminEmail) {
      if (!ADMIN_TEST_STATUSES.includes(row.status)) throw new BadRequestException('Tests can no longer be added to this visit');
    } else {
      if (row.status !== 'ARRIVED') throw new BadRequestException('Tests can be added once the phlebotomist has arrived');
      if (!row.phlebotomistId) throw new BadRequestException('Assign a phlebotomist first');
    }
    const arrived = row.status === 'ARRIVED' && Boolean(row.phlebotomistId);

    // A saved Address is what Orders attach to; a request made with free-text only gets one now.
    let addressId = row.addressId;
    if (!addressId) {
      const created = await this.prisma.address.create({
        data: {
          userId: row.userId,
          label: 'Home visit',
          line1: row.address,
          city: row.city,
          pincode: row.pincode,
          lat: row.lat,
          lng: row.lng,
          phone: row.phone,
          receiverName: row.patientName,
          receiverPhone: row.phone,
        },
      });
      addressId = created.id;
    }

    const city = await this.prisma.city.findFirst({ where: { name: { equals: row.city, mode: 'insensitive' } }, select: { id: true } });

    const order = await this.orders.createFromHomeVisit({
      userId: row.userId,
      items,
      addressId,
      scheduledDate: row.preferredDate,
      phlebotomistId: row.phlebotomistId,
      arrived,
      cityId: city?.id,
      ...(adminEmail ? { addedBy: adminEmail } : {}),
    });

    await this.prisma.homeCollectionRequest.update({
      where: { id },
      // Before arrival the visit keeps its own progress (assigned, on the way); arrival then moves it to TESTS_ADDED.
      data: { orderId: order.id, addressId, ...(arrived ? { status: 'TESTS_ADDED' as const } : {}) },
    });
    await this.notifications.notifyUser(row.userId, {
      title: 'Tests added to your home visit',
      body: `Order ${order.orderNumber} — total ₹${order.total}, pay on collection.`,
      data: { type: 'HOME_VISIT_STATUS', requestId: id, status: 'TESTS_ADDED' },
    });
    void this.mail.homeVisitTestsAdded(row.userId, {
      orderNumber: order.orderNumber,
      orderId: order.id,
      items: order.items.map((i) => i.itemName),
      total: order.total,
    });

    return { orderId: order.id, orderNumber: order.orderNumber, total: order.total, items: order.items.length };
  }

  /** The visit's booking (tests added before the visit) follows it: on the way, arrival, cancel / missed visit. */
  private async syncLinkedOrder(row: RequestWithRelations, status: 'ON_THE_WAY' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED', reason?: string) {
    const order = row.order;
    if (!order || order.status === 'CANCELLED') return;
    if (status === 'CANCELLED' || status === 'NO_SHOW') {
      await this.cancelLinkedOrder(row, status === 'NO_SHOW' ? 'Home visit missed' : `Home visit cancelled${reason ? ' — ' + reason : ''}`, 'SYSTEM');
      return;
    }
    if (order.status !== 'PHLEBOTOMIST_ASSIGNED') return;
    if (status === 'ON_THE_WAY') {
      await this.prisma.order.update({ where: { id: order.id }, data: { onTheWayAt: new Date() } });
      return;
    }
    if (order.reachedAt) return;
    // Arrival: the same doorstep code a booking gets when its phlebotomist reaches the patient.
    const code = String(randomInt(1000, 10000));
    await this.prisma.order.update({ where: { id: order.id }, data: { reachedAt: new Date(), collectionOtp: code, collectionOtpVerifiedAt: null } });
    void this.sms.orderSms(order.id, 'sampleOtp', { code });
    await this.notifications.notifyUser(row.userId, {
      title: 'Your phlebotomist has arrived',
      body: `Order ${order.orderNumber} — share this code with your phlebotomist: ${code}`,
      data: { type: 'ORDER_STATUS', orderId: order.id, status: 'PHLEBOTOMIST_ASSIGNED' },
    });
  }

  private async cancelLinkedOrder(row: RequestWithRelations, note: string, changedBy: string) {
    if (!row.order || row.order.status === 'CANCELLED') return;
    // Only a booking whose sample was not collected yet goes with the visit.
    if (row.order.status !== 'CONFIRMED' && row.order.status !== 'PHLEBOTOMIST_ASSIGNED') return;
    await cancelOrderOnce(this.prisma, this.wallet, { orderId: row.order.id, note, changedBy });
  }

  // ---------- Phlebotomist ----------
  // A phlebotomist only ever sees and acts on visits assigned to them; anything else is "not found".

  private async requireOwnVisit(phlebotomistId: string, id: string) {
    const row = await this.requireRequest(id);
    if (row.phlebotomistId !== phlebotomistId) throw new NotFoundException('Home visit request not found');
    return row;
  }

  /** scope: today (default) | upcoming (today onwards) | past | all */
  async phlebotomistList(phlebotomistId: string, scope = 'today') {
    const today = new Date(`${todayIstDateString()}T00:00:00Z`);
    const date: Prisma.HomeCollectionRequestWhereInput =
      scope === 'upcoming' ? { preferredDate: { gte: today } } : scope === 'past' ? { preferredDate: { lt: today } } : scope === 'all' ? {} : { preferredDate: today };
    const rows = await this.prisma.homeCollectionRequest.findMany({
      where: { phlebotomistId, ...date },
      orderBy: [{ preferredDate: scope === 'past' ? 'desc' : 'asc' }, { preferredWindow: 'asc' }, { createdAt: 'asc' }],
      include: requestInclude,
    });
    return rows.map((r) => this.serialize(r));
  }

  async phlebotomistGet(phlebotomistId: string, id: string) {
    return this.serialize(await this.requireOwnVisit(phlebotomistId, id));
  }

  async phlebotomistSetStatus(phlebotomistId: string, id: string, status: 'ON_THE_WAY' | 'ARRIVED' | 'NO_SHOW', reason?: string) {
    await this.requireOwnVisit(phlebotomistId, id);
    const { customer: _customer, ...visit } = await this.setStatus(id, status, { reason });
    return visit;
  }

  async phlebotomistAddItems(phlebotomistId: string, id: string, items: { itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY'; itemId: string }[]) {
    await this.requireOwnVisit(phlebotomistId, id);
    return this.addItems(id, items);
  }

  // ---------- Lab ----------
  // A lab sees the requests routed to it (by pincode, at request time) and assigns its own phlebotomists.

  private async requireLabVisit(labId: string, id: string) {
    const row = await this.requireRequest(id);
    if (row.labId !== labId) throw new NotFoundException('Home visit request not found');
    return row;
  }

  async labList(labId: string, filters: { date?: string; status?: string }) {
    const where: Prisma.HomeCollectionRequestWhereInput = { labId };
    if (filters.date && isValidCalendarDateString(filters.date)) where.preferredDate = new Date(`${filters.date}T00:00:00Z`);
    if (filters.status) where.status = filters.status as HomeVisitStatus;
    const rows = await this.prisma.homeCollectionRequest.findMany({
      where,
      orderBy: [{ preferredDate: 'asc' }, { createdAt: 'asc' }],
      include: requestInclude,
    });
    return rows.map((r) => ({ ...this.serialize(r), customer: r.user }));
  }

  async labGet(labId: string, id: string) {
    const row = await this.requireLabVisit(labId, id);
    return { ...this.serialize(row), customer: row.user };
  }

  async labAssign(labId: string, id: string, phlebotomistId: string, eta?: string) {
    await this.requireLabVisit(labId, id);
    const phlebotomist = await this.prisma.phlebotomist.findUnique({ where: { id: phlebotomistId }, select: { labId: true } });
    if (!phlebotomist || phlebotomist.labId !== labId) throw new BadRequestException('Choose one of your own phlebotomists');
    return this.assign(id, phlebotomistId, eta);
  }

  async labSetStatus(labId: string, id: string, status: 'ON_THE_WAY' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED', opts: { eta?: string; reason?: string }) {
    await this.requireLabVisit(labId, id);
    return this.setStatus(id, status, { ...opts, cancelledBy: 'lab' });
  }

  private async requireRequest(id: string) {
    const row = await this.prisma.homeCollectionRequest.findUnique({ where: { id }, include: requestInclude });
    if (!row) throw new NotFoundException('Home visit request not found');
    return row;
  }
}
