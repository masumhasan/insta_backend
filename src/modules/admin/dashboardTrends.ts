import { AppError } from '../../utils/apiError';

/** Revenue / Orders Trend charts on the Admin and Sign Company dashboards (GET /admin/dashboard-stats?granularity=). */
export const TREND_GRANULARITIES = ['daily', 'monthly', 'yearly'] as const;
export type TrendGranularity = (typeof TREND_GRANULARITIES)[number];

/** How many buckets each view shows, ending with the current day / month / year. */
const SPAN: Record<TrendGranularity, number> = { daily: 30, monthly: 12, yearly: 5 };

export function parseGranularity(raw: unknown): TrendGranularity {
  const g = String(raw ?? '').trim().toLowerCase() || 'monthly';
  if (!(TREND_GRANULARITIES as readonly string[]).includes(g)) {
    throw new AppError(`granularity must be one of: ${TREND_GRANULARITIES.join(', ')}.`, 400);
  }
  return g as TrendGranularity;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Start of the bucket `back` steps before the current one (server local time, like the other dashboard metrics). */
function bucketStart(g: TrendGranularity, back: number, now: Date) {
  if (g === 'daily') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  if (g === 'monthly') return new Date(now.getFullYear(), now.getMonth() - back, 1);
  return new Date(now.getFullYear() - back, 0, 1);
}

function label(g: TrendGranularity, d: Date) {
  if (g === 'daily') return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  if (g === 'monthly') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return String(d.getFullYear());
}

/**
 * Buckets orders by their created date. `orders` counts every order that was not cancelled; `revenue` is the net
 * paid amount (same rule as Monthly Net Income: paid or refunded orders, minus refunds).
 */
export function buildTrends(
  orders: any[],
  g: TrendGranularity,
  amountOf: (o: any) => number,
  refundedOf: (o: any) => number,
  now = new Date()
) {
  const points = Array.from({ length: SPAN[g] }, (_, i) => {
    const start = bucketStart(g, SPAN[g] - 1 - i, now);
    return { label: label(g, start), start, revenue: 0, orders: 0 };
  });
  const first = points[0].start;
  for (const o of orders) {
    const at = o.createdAt ? new Date(o.createdAt) : null;
    if (!at || at < first || /^cancell?ed$/i.test(o.status || '')) continue;
    let idx = points.length - 1;
    while (idx > 0 && at < points[idx].start) idx--;
    const p = points[idx];
    p.orders += 1;
    if (o.paymentStatus === 'Paid' || /refunded/i.test(o.paymentStatus || '')) p.revenue += amountOf(o) - refundedOf(o);
  }
  return {
    granularity: g,
    points: points.map((p) => ({ label: p.label, start: p.start.toISOString(), revenue: Math.round(p.revenue * 100) / 100, orders: p.orders })),
  };
}
