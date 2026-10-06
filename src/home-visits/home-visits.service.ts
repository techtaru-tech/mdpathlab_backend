import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { HomeVisitStatus, HomeVisitWindow, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LabsService } from '../labs/labs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { MailService } from '../mail/mail.service.js';
import { isValidCalendarDateString, istInstant, todayIstDateString } from '../common/ist-time.js';
import { CreateHomeCollectionRequestDto } from './dto/create-home-collection-request.dto.js';

// Visit windows in IST. The customer picks a window, not an exact time.
export const HOME_VISIT_WINDOWS: Record<HomeVisitWindow, { start: string; end: string; label: string }> = {
  MORNING: { start: '07:00', end: '11:00', label: '7 AM – 11 AM' },
  AFTERNOON: { start: '11:00', end: '15:00', label: '11 AM – 3 PM' },
  EVENING: { start: '15:00', end: '19:00', label: '3 PM – 7 PM' },
};

// Requests that are still alive — used by the duplicate guard.
const OPEN_STATUSES: HomeVisitStatus[] = ['REQUESTED', 'ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'TESTS_ADDED'];
const MAX_DAYS_AHEAD = 6;

const requestInclude = {
  phlebotomist: { include: { user: { select: { name: true, phone: true } } } },
  order: { select: { id: true, orderNumber: true, status: true, total: true } },
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
      cancelReason: r.cancelReason,
      createdAt: r.createdAt,
    };
  }

  // ---------- Customer ----------

  async create(userId: string, dto: CreateHomeCollectionRequestDto) {
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
      if (!address || address.userId !== userId) throw new BadRequestException('Address not found');
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
      },
    });

    await this.notifications.notifyAdmins({
      title: 'New home visit request',
      body: `${created.patientName} — ${dto.preferredDate}, ${window.label}, ${created.city} ${created.pincode}`,
      data: { type: 'HOME_VISIT_REQUESTED', requestId: created.id },
    });

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
    await this.notifications.notifyUser(row.userId, {
      title: 'Phlebotomist assigned',
      body: `${updated.phlebotomist?.user.name ?? 'A phlebotomist'} will visit on ${updated.preferredDate.toISOString().slice(0, 10)}, ${HOME_VISIT_WINDOWS[updated.preferredWindow].label}`,
      data: { type: 'HOME_VISIT_STATUS', requestId: id, status: 'ASSIGNED' },
    });
    void this.mail.homeVisitAssigned(row.userId, {
      phlebotomist: updated.phlebotomist?.user.name ?? 'Your phlebotomist',
      date: updated.preferredDate.toISOString().slice(0, 10),
      window: HOME_VISIT_WINDOWS[updated.preferredWindow].label,
    });
    return { ...this.serialize(updated), customer: updated.user };
  }

  async setStatus(id: string, status: 'ON_THE_WAY' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED', opts: { eta?: string; reason?: string }) {
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
        ...(status === 'CANCELLED' ? { cancelReason: opts.reason ?? 'Cancelled by admin' } : {}),
      },
      include: requestInclude,
    });

    const messages: Partial<Record<typeof status, { title: string; body: string }>> = {
      ON_THE_WAY: { title: 'Phlebotomist is on the way', body: 'Your phlebotomist has left for your address.' },
      ARRIVED: { title: 'Phlebotomist has arrived', body: 'Your phlebotomist has reached your address.' },
      CANCELLED: { title: 'Home visit cancelled', body: opts.reason ?? 'Your home visit request was cancelled.' },
      NO_SHOW: { title: 'Home visit missed', body: 'We could not complete your home visit. Please request a new one.' },
    };
    const msg = messages[status];
    if (msg) {
      await this.notifications.notifyUser(row.userId, { ...msg, data: { type: 'HOME_VISIT_STATUS', requestId: id, status } });
    }
    return { ...this.serialize(updated), customer: updated.user };
  }

  /** Adds the tests the phlebotomist decided on at the door and turns the request into an Order. */
  async addItems(id: string, items: { itemType: 'PARAMETER' | 'PROFILE' | 'PACKAGE' | 'RADIOLOGY'; itemId: string }[]) {
    const row = await this.requireRequest(id);
    if (row.orderId) throw new BadRequestException('Tests were already added to this request');
    if (row.status !== 'ARRIVED') throw new BadRequestException('Tests can be added once the phlebotomist has arrived');
    if (!row.phlebotomistId) throw new BadRequestException('Assign a phlebotomist first');

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
      cityId: city?.id,
    });

    await this.prisma.homeCollectionRequest.update({
      where: { id },
      data: { orderId: order.id, addressId, status: 'TESTS_ADDED' },
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

  private async requireRequest(id: string) {
    const row = await this.prisma.homeCollectionRequest.findUnique({ where: { id }, include: requestInclude });
    if (!row) throw new NotFoundException('Home visit request not found');
    return row;
  }
}
