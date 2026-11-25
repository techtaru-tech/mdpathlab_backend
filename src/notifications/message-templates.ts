import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Patient push / in-app message texts that admin can edit (Admin → Settings → Messages). Each event has a built-in
 * default; admin's version is stored in SiteSetting.messageTemplates. {placeholders} are filled when sending, and an
 * unknown or empty placeholder simply disappears. SMS is separate: its text is fixed by DLT (see SmsService).
 */
export type MessageEvent =
  | 'bookingConfirmed'
  | 'appointmentReminder'
  | 'phleboArrival'
  | 'phleboDelay'
  | 'bookingCancelled'
  | 'bookingReactivated'
  | 'addOnConfirmed'
  | 'extraCollectionCharge'
  | 'printingCharge';

export type MessageTemplate = { title: string; body: string; enabled: boolean };

export const MESSAGE_EVENTS: { key: MessageEvent; label: string; when: string; placeholders: string[]; defaults: MessageTemplate }[] = [
  {
    key: 'bookingConfirmed',
    label: 'Appointment confirmation',
    when: 'A booking is placed (or paid online).',
    placeholders: ['name', 'orderNumber', 'collection', 'date', 'slot', 'total'],
    defaults: { title: 'Booking confirmed', body: 'Order {orderNumber} — your {collection} is booked for {date}, {slot}.', enabled: true },
  },
  {
    key: 'appointmentReminder',
    label: 'Appointment time reminder',
    when: 'Automatically, a set number of hours before the slot starts (Admin → Settings → Charges & reminders).',
    placeholders: ['name', 'orderNumber', 'collection', 'date', 'slot', 'phlebotomist'],
    defaults: {
      title: 'Reminder: your sample collection is coming up',
      body: 'Order {orderNumber} — your {collection} is scheduled for {date}, {slot}. Please be available at the address.',
      enabled: true,
    },
  },
  {
    key: 'phleboArrival',
    label: 'Phlebotomist arrival / expected arrival time',
    when: 'The phlebotomist marks "on the way" with an expected time, or updates it.',
    placeholders: ['name', 'orderNumber', 'phlebotomist', 'eta'],
    defaults: { title: 'Your phlebotomist is on the way', body: 'Order {orderNumber} — {phlebotomist} is expected to reach you around {eta}.', enabled: true },
  },
  {
    key: 'phleboDelay',
    label: 'Phlebotomist delay',
    when: 'The phlebotomist taps "Running late".',
    placeholders: ['name', 'orderNumber', 'phlebotomist', 'delay', 'eta'],
    defaults: {
      title: 'Your phlebotomist is running late',
      body: 'Dear Patient, your phlebotomist is running slightly late. We apologize for the inconvenience and appreciate your patience. We will update you shortly.',
      enabled: true,
    },
  },
  {
    key: 'bookingCancelled',
    label: 'Test cancellation',
    when: 'A booking is cancelled by the patient, lab or admin.',
    placeholders: ['name', 'orderNumber', 'reason', 'refundNote'],
    defaults: { title: 'Booking cancelled', body: 'Order {orderNumber} has been cancelled. {reason}{refundNote}', enabled: true },
  },
  {
    key: 'bookingReactivated',
    label: 'Test reactivation',
    when: 'The lab makes a cancelled booking active again.',
    placeholders: ['name', 'orderNumber', 'date', 'slot'],
    defaults: { title: 'Your booking is active again', body: 'Order {orderNumber} is confirmed again for {date}, {slot}.', enabled: true },
  },
  {
    key: 'addOnConfirmed',
    label: 'Additional test confirmation',
    when: 'The patient confirms extra tests the phlebotomist added at the door.',
    placeholders: ['name', 'orderNumber', 'tests', 'amount', 'total'],
    defaults: { title: 'Additional tests confirmed', body: 'Order {orderNumber} — {tests} added (₹{amount}). New total ₹{total}.', enabled: true },
  },
  {
    key: 'extraCollectionCharge',
    label: 'Additional collection charges',
    when: 'A booking whose address is beyond the free distance from the lab.',
    placeholders: ['name', 'orderNumber', 'amount', 'distance', 'freeKm'],
    defaults: {
      title: 'Additional collection charge',
      body: 'Order {orderNumber} — your address is {distance} km from the lab (more than {freeKm} km), so an additional collection charge of ₹{amount} is included in your bill.',
      enabled: true,
    },
  },
  {
    key: 'printingCharge',
    label: 'Printed report request (courier / postage charges)',
    when: 'A booking where the patient asked for printed reports.',
    placeholders: ['name', 'orderNumber'],
    defaults: {
      title: 'Printed reports requested',
      body: 'Order {orderNumber} — you asked for printed reports. The courier / postage charges, as applicable, will be paid by you. The lab will call you to confirm the delivery address and charges.',
      enabled: true,
    },
  },
];

const BY_KEY = new Map(MESSAGE_EVENTS.map((e) => [e.key, e]));
export const isMessageEvent = (k: string): k is MessageEvent => BY_KEY.has(k as MessageEvent);

/** Fills {placeholders}. Missing values become empty; leftover doubled spaces are tidied. */
export function fillTemplate(text: string, vars: Record<string, string | number | null | undefined>) {
  return text
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** "25 Nov 2026" for a booking's scheduledDate (stored as the calendar date at UTC midnight). */
export function bookingDate(d: Date | null | undefined) {
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'the scheduled date';
}

/** "10:40 AM" in India time. */
export function istClock(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();
}

@Injectable()
export class MessageTemplatesService {
  private readonly logger = new Logger(MessageTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Sends the patient of an order the event's message (push + in-app), with the order's own details filled in:
   * name, orderNumber, collection, date, slot, phlebotomist, total — plus `extra`. Never throws.
   */
  async notifyOrder(event: MessageEvent, orderId: string, extra: Record<string, string | number | null | undefined> = {}, data: Record<string, string> = {}) {
    try {
      const o = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          orderNumber: true,
          status: true,
          collectionType: true,
          scheduledDate: true,
          total: true,
          slot: { select: { label: true } },
          user: { select: { name: true } },
          phlebotomist: { select: { user: { select: { name: true } } } },
        },
      });
      if (!o) return;
      const msg = await this.render(event, {
        name: o.user.name?.split(' ')[0] ?? 'there',
        orderNumber: o.orderNumber,
        collection: o.collectionType === 'HOME' ? 'home collection' : 'centre visit',
        date: bookingDate(o.scheduledDate),
        slot: o.slot?.label ?? 'your slot',
        phlebotomist: o.phlebotomist?.user.name ?? 'your phlebotomist',
        total: o.total,
        ...extra,
      });
      if (!msg) return;
      await this.notifications.notifyUser(o.userId, { ...msg, data: { type: 'ORDER_STATUS', orderId: o.id, status: o.status, event, ...data } });
    } catch (err) {
      this.logger.error(`${event} message for order ${orderId} failed: ${(err as Error).message}`);
    }
  }

  /** Every event with its current text (admin's, or the default) — for the admin screen. */
  async list() {
    const saved = await this.saved();
    return MESSAGE_EVENTS.map((e) => ({
      key: e.key,
      label: e.label,
      when: e.when,
      placeholders: e.placeholders,
      defaults: e.defaults,
      current: { ...e.defaults, ...(saved[e.key] ?? {}) },
      customised: Boolean(saved[e.key]),
    }));
  }

  /** Saves admin's texts. A template equal to the default is stored as "not customised". */
  async save(templates: Partial<Record<MessageEvent, Partial<MessageTemplate> | null>>) {
    const saved = await this.saved();
    for (const [key, value] of Object.entries(templates)) {
      if (!isMessageEvent(key)) continue;
      const def = BY_KEY.get(key)!.defaults;
      if (!value) {
        delete saved[key];
        continue;
      }
      const next: MessageTemplate = {
        title: (value.title ?? saved[key]?.title ?? def.title).trim() || def.title,
        body: (value.body ?? saved[key]?.body ?? def.body).trim() || def.body,
        enabled: value.enabled ?? saved[key]?.enabled ?? def.enabled,
      };
      if (next.title === def.title && next.body === def.body && next.enabled === def.enabled) delete saved[key];
      else saved[key] = next;
    }
    const row = await this.prisma.siteSetting.findFirst({ select: { id: true } });
    if (row) await this.prisma.siteSetting.update({ where: { id: row.id }, data: { messageTemplates: saved } });
    else await this.prisma.siteSetting.create({ data: { messageTemplates: saved } });
    return this.list();
  }

  /** The filled message for an event, or null when admin switched that message off. */
  async render(event: MessageEvent, vars: Record<string, string | number | null | undefined>): Promise<{ title: string; body: string } | null> {
    const def = BY_KEY.get(event)!.defaults;
    let t: MessageTemplate = def;
    try {
      t = { ...def, ...((await this.saved())[event] ?? {}) };
    } catch (err) {
      this.logger.warn(`Using the default ${event} text: ${(err as Error).message}`);
    }
    if (!t.enabled) return null;
    return { title: fillTemplate(t.title, vars), body: fillTemplate(t.body, vars) };
  }

  private async saved(): Promise<Partial<Record<MessageEvent, MessageTemplate>>> {
    const row = await this.prisma.siteSetting.findFirst({ select: { messageTemplates: true } });
    const v = row?.messageTemplates;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Partial<Record<MessageEvent, MessageTemplate>>) : {};
  }
}
