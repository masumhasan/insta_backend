import { Order } from './order.model';

/**
 * Sorting and date-range filtering for GET /orders.
 *
 * Query params:
 *   sortBy   = orderDate (default, newest first) | dueDate | completedDate
 *   sortDir  = desc (default) | asc
 *   dateField = order (default) | due | completed   (which date startDate/endDate apply to)
 *
 * Due dates are stored as text ("2026-11-21", "Rush", "ASAP", "Standard"), so a real date is derived in the
 * pipeline: ISO and MM/DD/YYYY dates as written, Rush/ASAP on the order date, Standard from the date picked on the form.
 * Orders without the sort date (e.g. no due date, not completed) always come last.
 */

const SORT_FIELDS: Record<string, string> = {
  orderDate: 'createdAt',
  createdAt: 'createdAt',
  dueDate: 'dueAt',
  completedDate: 'completedAt',
  completedAt: 'completedAt',
};

const textOf = (path: string) => ({ $cond: [{ $eq: [{ $type: path }, 'string'] }, path, ''] });
const isoDay = (path: string) => ({
  $dateFromString: { dateString: { $substrCP: [path, 0, 10] }, format: '%Y-%m-%d', onError: null, onNull: null },
});
const matches = (path: string, regex: string) => ({ $regexMatch: { input: textOf(path), regex } });

const DUE_AT = {
  $switch: {
    branches: [
      { case: matches('$dueDate', '^\\d{4}-\\d{2}-\\d{2}'), then: isoDay('$dueDate') },
      {
        case: matches('$dueDate', '^\\d{1,2}/\\d{1,2}/\\d{4}$'),
        then: { $dateFromString: { dateString: '$dueDate', format: '%m/%d/%Y', onError: null, onNull: null } },
      },
      { case: { $in: [{ $toLower: textOf('$dueDate') }, ['rush', 'asap']] }, then: '$createdAt' },
      { case: matches('$specifications.dueDate', '^\\d{4}-\\d{2}-\\d{2}'), then: isoDay('$specifications.dueDate') },
    ],
    default: null,
  },
};

export interface IListQuery {
  sortBy?: string;
  sortDir?: string;
  dateField?: string;
  startDate?: string;
  endDate?: string;
}

const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999Z`);
const isIsoDay = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d.trim());

/** Date-range clause for startDate/endDate (YYYY-MM-DD), applied after the due date is derived. */
export function dateRangeClause(q: IListQuery): Record<string, any> | null {
  const start = isIsoDay(q.startDate) ? dayStart(q.startDate!.trim()) : null;
  const end = isIsoDay(q.endDate) ? dayEnd(q.endDate!.trim()) : null;
  if (!start && !end) return null;
  const range: any = {};
  if (start) range.$gte = start;
  if (end) range.$lte = end;
  const field = q.dateField === 'due' ? 'dueAt' : q.dateField === 'completed' ? 'completedAt' : 'createdAt';
  return { [field]: range };
}

/** Runs the list query: filter, derived due date, optional date range, sort (missing dates last) and paging. */
export async function listOrders(filter: Record<string, any>, q: IListQuery, skip: number, limit: number) {
  const field = SORT_FIELDS[String(q.sortBy || '')] || 'createdAt';
  const dir = String(q.sortDir || '').toLowerCase() === 'asc' ? 1 : -1;
  const range = dateRangeClause(q);

  const [result] = await Order.aggregate([
    { $match: filter },
    { $addFields: { dueAt: DUE_AT } },
    ...(range ? [{ $match: range }] : []),
    { $addFields: { _sortMissing: { $cond: [{ $ifNull: [`$${field}`, false] }, 0, 1] } } },
    {
      $facet: {
        rows: [{ $sort: { _sortMissing: 1, [field]: dir, createdAt: -1, _id: -1 } }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  return { orders: (result?.rows || []) as any[], total: Number(result?.total?.[0]?.n) || 0 };
}
