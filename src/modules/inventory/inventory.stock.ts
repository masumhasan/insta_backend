/**
 * Stock level thresholds, the single source of truth for every portal.
 * Each inventory item in an API response carries `stockLevel`, so portals never compute it themselves.
 */
export const LOW_STOCK_AT = 3;
export const CRITICAL_STOCK_AT = 1;

export const STOCK_LEVELS = ['In Stock', 'Low Stock', 'Critically Low', 'Out of Stock'] as const;
export type StockLevel = (typeof STOCK_LEVELS)[number];

/** In Stock above 3 available, Low Stock at 2–3, Critically Low at 1, Out of Stock at 0. */
export const stockLevelOf = (available: unknown): StockLevel => {
  const n = Number(available) || 0;
  if (n <= 0) return 'Out of Stock';
  if (n <= CRITICAL_STOCK_AT) return 'Critically Low';
  if (n <= LOW_STOCK_AT) return 'Low Stock';
  return 'In Stock';
};

const STOCK_STATUS_RE = /^(in stock|low stock|critically low|out of stock)?$/i;

/**
 * Status shown in inventory tables: a workflow status saved on the item (In Field, Damaged, Checked Out, …) wins;
 * a stock status ("In Stock", "Low Stock") or no status is replaced by the live stock level.
 */
export const displayStatusOf = (status: unknown, available: unknown): string => {
  const saved = String(status ?? '').trim();
  return STOCK_STATUS_RE.test(saved) ? stockLevelOf(available) : saved;
};

/** Default `status` for an item with no status saved (the status options stay In Stock / Low Stock / Checked Out). */
export const defaultStatusOf = (available: unknown): string => {
  const n = Number(available) || 0;
  return n > LOW_STOCK_AT ? 'In Stock' : n > 0 ? 'Low Stock' : 'Checked Out';
};
