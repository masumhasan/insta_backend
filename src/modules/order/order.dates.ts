import { assignedStatusFor, pendingStatusFor } from './order.workflow';

/**
 * Status timestamps on an order and everything derived from them (completed date, days in field, reschedule window).
 *
 * - installedAt: the sign went up ("Installed").
 * - removedAt:   the sign came down ("Removed").
 * - completedAt: the order's field work is done. Installs complete when "Installed", removals when "Removed",
 *                every other type when "Completed".
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Types whose sign stays up in the field after the visit, so "days in field" applies. */
const FIELD_TYPES = ['Installation', 'For Sale Directionals', 'Open House Services'];
/** Types that are put up and later taken down by the same order. */
const UP_AND_DOWN = ['For Sale Directionals', 'Open House Services'];
/** Legacy orders (no installedAt) whose status shows the sign went up. */
const POST_INSTALL = ['Installed', 'Pending Down', 'Scheduled Down', 'Assigned Down', 'Removed', 'Completed'];

export const isCompletionStatus = (type: string, status: string): boolean =>
  status === 'Completed' || (type === 'Installation' && status === 'Installed') || (type === 'Removal' && status === 'Removed');

/** Statuses before any field work for this order type (pending, scheduled, assigned, holds, production). */
export const preFieldStatuses = (type: string): string[] => {
  const pending = pendingStatusFor(type);
  return [
    pending,
    pending.replace('Pending', 'Scheduled'),
    assignedStatusFor(type),
    'Waiting on Payment',
    'On Hold',
    'Delayed by Weather',
    'In Production',
    'Ready for Install',
    'Ready to Install',
  ];
};

/** Called from the Order pre-save hook whenever the status is set: stamps (or clears, when moved back) the dates. */
export function stampStatusDates(doc: any, now = new Date()) {
  const type = String(doc.type || '');
  const status = String(doc.status || '');
  if (preFieldStatuses(type).includes(status)) {
    doc.installedAt = undefined;
    doc.removedAt = undefined;
    doc.completedAt = undefined;
    return;
  }
  if (status === 'Installed' && !doc.installedAt) doc.installedAt = now;
  if (status === 'Removed' && !doc.removedAt) doc.removedAt = now;
  if (isCompletionStatus(type, status) && !doc.completedAt) doc.completedAt = now;
}

export const parseFlexibleDate = (raw?: string, fallback?: Date): Date | null => {
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (raw && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [a, b, y] = raw.split('/').map(Number);
    // Order dates are stored day-first (en-GB); a first part above 12 can only be a day.
    const month = a > 12 ? b - 1 : a - 1;
    const day = a > 12 ? a : b;
    const d = new Date(Date.UTC(y, month, day));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback && !Number.isNaN(fallback.getTime()) ? fallback : null;
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const dayIndex = (d: Date) => Math.floor(d.getTime() / DAY_MS);

/**
 * Days in field: 0 until the sign is installed, then 1 on the next calendar day (UTC) and counting.
 * It stops counting once the sign is removed (or the put-up-and-down order is completed).
 */
export function computeDaysInField(o: any, now = new Date()): number {
  const type = String(o.type || '');
  if (!FIELD_TYPES.includes(type)) return 0;
  const status = String(o.status || '');
  let start = toDate(o.installedAt);
  let end = toDate(o.removedAt) || (UP_AND_DOWN.includes(type) && status === 'Completed' ? toDate(o.completedAt) : null);
  if (!start) {
    // Orders installed before the timestamp existed: fall back to the order date while the status shows it went up.
    if (!POST_INSTALL.includes(status)) return 0;
    start = parseFlexibleDate(o.orderDate, toDate(o.createdAt) || undefined);
    if (!start) return 0;
    if (!end && ['Removed', 'Completed'].includes(status)) end = toDate(o.updatedAt);
  }
  return Math.max(0, dayIndex(end || now) - dayIndex(start));
}

/** Agents, assistants and team leads may move the due date only before any field work has happened. */
export const canCustomerReschedule = (o: any): boolean =>
  !o.installedAt && !o.completedAt && preFieldStatuses(String(o.type || '')).includes(String(o.status || ''));

const REQUESTER_ROLES = ['Agent', 'Assistant', 'Team Lead'];
/** Whether this user sees the "Reschedule" option on this order (rush orders stay with the sign company). */
export const canRescheduleFor = (o: any, user?: { role?: string }): boolean =>
  REQUESTER_ROLES.includes(String(user?.role || '')) && canCustomerReschedule(o) && !/^rush$/i.test(String(o.dueDate || ''));
