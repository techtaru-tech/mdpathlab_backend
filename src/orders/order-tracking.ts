import type { OrderStatus } from '@prisma/client';
import { toPhlebotomistStatusLabel } from '../phlebotomist/phlebotomist-status.js';

/**
 * The customer app's booking timeline: Booking confirmed → Phlebotomist assigned → On the way → Sample collected →
 * Sample processing → Report ready. `status` stays the order's own status (unchanged, the website and older app
 * builds read it); `trackingStatus` is the step to show, including ON_THE_WAY, which is a timestamp on the order
 * rather than a status.
 */
export type TrackingStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'ASSIGNED' | 'ON_THE_WAY' | 'SAMPLE_COLLECTED' | 'IN_LAB' | 'REPORT_READY' | 'CANCELLED';

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  PENDING_PAYMENT: 'Payment pending',
  CONFIRMED: 'Booking confirmed',
  ASSIGNED: 'Phlebotomist assigned',
  ON_THE_WAY: 'On the way',
  SAMPLE_COLLECTED: 'Sample collected',
  IN_LAB: 'Sample processing',
  REPORT_READY: 'Report ready',
  CANCELLED: 'Cancelled',
};

type Trackable = {
  status: OrderStatus;
  phlebotomistId?: string | null;
  onTheWayAt: Date | null;
  reachedAt: Date | null;
  handedOverAt: Date | null;
  sampleReceivedAt: Date | null;
  statusLogs: { status: OrderStatus; createdAt: Date }[];
  phlebotomist?: { experienceYears?: number | null; user: { name: string | null; phone: string } } | null;
};

export function trackingStatusOf(o: Pick<Trackable, 'status' | 'phlebotomistId' | 'onTheWayAt'>): TrackingStatus {
  switch (o.status) {
    case 'CANCELLED':
    case 'REPORT_READY':
    case 'IN_LAB':
    case 'SAMPLE_COLLECTED':
    case 'PENDING_PAYMENT':
      return o.status;
    default:
      if (o.onTheWayAt) return 'ON_THE_WAY';
      if (o.status === 'PHLEBOTOMIST_ASSIGNED' || o.phlebotomistId) return 'ASSIGNED';
      return 'CONFIRMED';
  }
}

/** Adds the timeline fields the customer app reads to an order from GET /orders or GET /orders/:id. */
export function withTracking<T extends Trackable>(order: T) {
  const logs = [...order.statusLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const first = (s: OrderStatus) => logs.find((l) => l.status === s)?.createdAt ?? null;
  const last = (s: OrderStatus) => [...logs].reverse().find((l) => l.status === s)?.createdAt ?? null;
  const trackingStatus = trackingStatusOf(order);
  const p = order.phlebotomist;
  return {
    ...order,
    // The existing object stays (the website reads phlebotomist.user); name / phone / experienceYears are added flat.
    phlebotomist: p ? { ...p, name: p.user.name, phone: p.user.phone, experienceYears: p.experienceYears ?? null } : null,
    // A reassignment logs PHLEBOTOMIST_ASSIGNED again — the latest one is the current phlebotomist's.
    assignedAt: p ? last('PHLEBOTOMIST_ASSIGNED') : null,
    onTheWayAt: order.onTheWayAt,
    reachedAt: order.reachedAt,
    sampleCollectedAt: first('SAMPLE_COLLECTED'),
    handedOverAt: order.handedOverAt,
    inLabAt: order.sampleReceivedAt ?? first('IN_LAB'),
    reportReadyAt: first('REPORT_READY'),
    cancelledAt: order.status === 'CANCELLED' ? last('CANCELLED') : null,
    phlebotomistStatus: toPhlebotomistStatusLabel(order.status),
    trackingStatus,
    trackingStatusLabel: TRACKING_STATUS_LABELS[trackingStatus],
  };
}
