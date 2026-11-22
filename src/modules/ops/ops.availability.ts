import { Request, Response } from 'express';
import { AppSetting, CalendarEvent } from './ops.model';
import { Order } from '../order/order.model';
import { User } from '../auth/user.model';
import { AppError } from '../../utils/apiError';
import { formatUsDate } from '../../utils/formatUsDate';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

/**
 * Live media appointment slots.
 * - Business hours come from the `working_hours` setting (Media → Working Days & Hours): per weekday `enabled`,
 *   `start` and `end` ("11:00 AM - CDT"). Without the setting every day runs 9:00 AM - 6:00 PM.
 * - A start time is offered every 15 minutes when the whole appointment ends by the end-of-day time.
 * - Busy time = photographer calendar events plus Media Services orders booked that day (not cancelled).
 *   The team can run as many appointments at once as there are active photographers (at least one).
 */
export const SLOT_STEP_MINUTES = 15;
const DEFAULT_DAY = { enabled: true, start: '9:00 AM', end: '6:00 PM' };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ZONES: Record<string, string> = {
  E: 'America/New_York',
  C: 'America/Chicago',
  M: 'America/Denver',
  P: 'America/Los_Angeles',
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "10:15 AM", "9am", "14:30" -> minutes after midnight, or null. */
export function toMinutes(label: unknown): number | null {
  const m = String(label ?? '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!m) return null;
  let hr = Number(m[1]);
  const min = Number(m[2] || 0);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && hr < 12) hr += 12;
  if (ampm === 'AM' && hr === 12) hr = 0;
  if (hr > 23 || min > 59) return null;
  return hr * 60 + min;
}

export function toLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Pure slot maths (tested offline): starts every step from open while start + duration <= close, free of overlaps. */
export function computeSlots(input: {
  open: number;
  close: number;
  duration: number;
  busy: { start: number; end: number }[];
  capacity: number;
  notBefore?: number;
}): string[] {
  const out: string[] = [];
  const firstStart = Math.max(input.open, input.notBefore ?? input.open);
  const aligned = Math.ceil((firstStart - input.open) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES + input.open;
  for (let start = aligned; start + input.duration <= input.close; start += SLOT_STEP_MINUTES) {
    const end = start + input.duration;
    const overlapping = input.busy.filter((b) => b.start < end && start < b.end).length;
    if (overlapping < Math.max(1, input.capacity)) out.push(toLabel(start));
  }
  return out;
}

const zoneOf = (label: string) => {
  const m = String(label).match(/\b([ECMP])[SD]?T\b/);
  return { timeZone: ZONES[m?.[1] || 'C'], abbr: (m?.[0] || 'CT').toUpperCase() };
};

/** Today's date (YYYY-MM-DD) and minute of the day in the business time zone. */
function nowIn(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

async function businessDay(date: string) {
  const doc: any = await AppSetting.findOne({ key: 'working_hours' }).lean();
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const days: any[] = Array.isArray(doc?.value?.days) ? doc.value.days : [];
  const row = days.find((d) => String(d?.id || d?.label || '').toLowerCase() === weekday) || (days.length ? null : DEFAULT_DAY);
  return { row, weekday };
}

/** Media orders booked on `date`. New orders keep `specifications.appointmentDate` (ISO); older ones only `appointmentTime`. */
async function bookedOrders(date: string, excludeOrderId?: string) {
  const [y, m, d] = date.split('-');
  const rows = await Order.find({
    type: 'Media Services',
    status: { $nin: ['Cancelled', 'Canceled'] },
    $or: [
      { 'specifications.appointmentDate': date },
      { appointmentTime: { $regex: `^${date}\\b` } },
      { appointmentTime: { $regex: `^${d}/${m}/${y}\\b` } },
    ],
  })
    .select('appointmentTime onsiteDuration specifications.appointmentSlot specifications.appointmentDate')
    .lean();
  return rows
    .filter((o: any) => !excludeOrderId || String(o._id) !== excludeOrderId)
    .map((o: any) => {
      const slot = o.specifications?.appointmentDate === date ? o.specifications?.appointmentSlot : String(o.appointmentTime || '').split(' ').slice(1).join(' ');
      const start = toMinutes(slot);
      return start === null ? null : { start, end: start + (Number(o.onsiteDuration) || 60) };
    })
    .filter(Boolean) as { start: number; end: number }[];
}

export async function getMediaAvailability(query: { date?: unknown; durationMinutes?: unknown; excludeOrderId?: string }) {
  const date = String(query.date || '').trim();
  if (!ISO_DATE.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) throw new AppError('date must be YYYY-MM-DD.', 400);
  const duration = Math.round(Number(query.durationMinutes) || 60);
  if (duration < 15 || duration > 720) throw new AppError('durationMinutes must be between 15 and 720.', 400);

  const { row } = await businessDay(date);
  const zone = zoneOf(row?.start || row?.end || '');
  const base = { date, durationMinutes: duration, timeZone: zone.abbr, stepMinutes: SLOT_STEP_MINUTES };
  if (!row || row.enabled === false) return { ...base, open: '', close: '', closed: true, reason: 'Closed on this day.', slots: [] as string[] };
  const open = toMinutes(row.start) ?? 9 * 60;
  const close = toMinutes(row.end) ?? 18 * 60;
  const now = nowIn(zone.timeZone);
  if (date < now.date) return { ...base, open: toLabel(open), close: toLabel(close), closed: true, reason: 'This date has passed.', slots: [] as string[] };

  const [events, orders, photographers] = await Promise.all([
    CalendarEvent.find({ date }).select('time durationMinutes').lean(),
    bookedOrders(date, query.excludeOrderId),
    User.countDocuments({ role: 'Photographer', status: { $nin: ['blocked', 'rejected', 'pending_approval'] } }),
  ]);
  const busy = [
    ...events
      .map((e: any) => ({ start: toMinutes(e.time), len: Number(e.durationMinutes) || 60 }))
      .filter((e) => e.start !== null)
      .map((e) => ({ start: e.start as number, end: (e.start as number) + e.len })),
    ...orders,
  ];
  const slots = computeSlots({ open, close, duration, busy, capacity: photographers, notBefore: date === now.date ? now.minutes + 1 : undefined });
  return { ...base, open: toLabel(open), close: toLabel(close), closed: false, reason: slots.length ? '' : 'No open times left on this day.', slots };
}

/** Re-checked when a media order is placed so two people cannot book the same time. */
export async function assertMediaSlotFree(date: string, slot: string, durationMinutes: number, excludeOrderId?: string) {
  const start = toMinutes(slot);
  if (start === null) throw new AppError('Choose an appointment time.', 400);
  const day = await getMediaAvailability({ date, durationMinutes, excludeOrderId });
  if (!day.slots.includes(toLabel(start))) {
    throw new AppError(`${toLabel(start)} on ${formatUsDate(date)} is no longer available for a ${durationMinutes} minute appointment. Pick another time.`, 409);
  }
  return toLabel(start);
}

export const getMediaAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getMediaAvailability({ date: req.query.date, durationMinutes: req.query.durationMinutes ?? req.query.duration });
  return ApiResponse.success(res, 200, 'Media availability computed', data);
});
