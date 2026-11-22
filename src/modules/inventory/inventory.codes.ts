import { Inventory } from './inventory.model';
import { nextSequence } from './counter.model';
import { AppError } from '../../utils/apiError';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CODE128 } = require('jsbarcode/bin/barcodes/CODE128');

/**
 * Inventory codes.
 *  - Item code:  category prefix + sequence, e.g. PST-0042 (stored in `itemId`).
 *  - Unit code:  item code + unit number, e.g. PST-0042-07 (stored in `units[].unitId`).
 *  - Custom barcode: the sign company's own number (optional). When set it is printed and scanned instead.
 *  - `barcode` always holds the code that is printed (custom, else the generated code).
 *  - `legacyCodes` keeps older identifiers (BAR-123456, PST-0042-001, …) so labels already in the field still scan.
 * Labels print as Code-128.
 */

const ITEM_PREFIX: Record<string, string> = {
  'sign post': 'PST',
  'main panel': 'PNL',
  sign: 'SGN',
  rider: 'RDR',
  lockbox: 'LBX',
  'brochure box': 'BRO',
  directional: 'DIR',
  'hardware / stakes': 'HDW',
};
export const prefixFor = (itemType?: string) => ITEM_PREFIX[String(itemType || '').trim().toLowerCase()] || 'ITM';

/** A short item code already in the new format (e.g. PST-0042, SC-0001). */
export const SHORT_ITEM_ID_RE = /^[A-Z]{2,4}-\d{4,6}$/;

export const formatItemCode = (prefix: string, seq: number) => `${prefix}-${String(seq).padStart(4, '0')}`;
export const formatUnitCode = (itemId: string, n: number) => `${itemId}-${String(n).padStart(2, '0')}`;

/** Next free item code for a category. The counter is atomic; the loop skips codes taken by seeded/imported items. */
export const generateItemId = async (itemType?: string) => {
  const prefix = prefixFor(itemType);
  for (let i = 0; i < 50; i++) {
    const code = formatItemCode(prefix, await nextSequence(`inventory:${prefix}`));
    if (!(await Inventory.exists({ $or: [{ itemId: code }, { legacyCodes: code }] }))) return code;
  }
  throw new AppError('Could not allocate an item code. Try again.', 500);
};

export const UNIT_STATUSES = ['Available', 'Installed', 'Missing', 'Damaged', 'Needs Repair', 'Scrapped'] as const;

/** Trailing unit number of a unit code (PST-0042-07 -> 7, SC-0001-U1 -> 1). */
export const unitNumberOf = (code?: string) => Number((String(code || '').match(/(\d+)$/) || [])[1]) || 0;

export const buildUnits = (itemId: string, count: number, startAt = 0) =>
  Array.from({ length: Math.max(0, count) }, (_, i) => {
    const code = formatUnitCode(itemId, startAt + i + 1);
    return { unitId: code, barcode: code, customBarcode: '', legacyCodes: [] as string[], status: 'Available', notes: '', updatedAt: new Date().toISOString() };
  });

export const CUSTOM_BARCODE_MAX = 24;

/** A manual barcode: printable ASCII only (what Code-128 encodes), trimmed, at most 24 characters. '' = none. */
export const cleanCustomBarcode = (raw: unknown): string => {
  const value = String(raw ?? '').replace(/[^\x20-\x7E]/g, '').trim();
  if (value.length > CUSTOM_BARCODE_MAX) {
    throw new AppError(`Barcode "${value.slice(0, 30)}…" is too long: use at most ${CUSTOM_BARCODE_MAX} characters.`, 400);
  }
  return value;
};

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every field a scanned or typed code can match (current, custom and legacy codes on items and units). */
export const CODE_FIELDS = [
  'itemId', 'barcode', 'customBarcode', 'legacyCodes',
  'units.unitId', 'units.barcode', 'units.customBarcode', 'units.legacyCodes',
] as const;

/** Mongo filter that finds the item holding `code` (case-insensitive, exact). */
export const codeLookupFilter = (code: string) => {
  const exact = new RegExp('^' + escapeRe(String(code || '').trim()) + '$', 'i');
  return { $or: CODE_FIELDS.map((f) => ({ [f]: exact })) };
};

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Which slot of an item holds `code`: 'item', the unitId of a unit, or null. */
export const slotOfCode = (doc: any, code: string): string | null => {
  const itemCodes = [doc.itemId, doc.barcode, doc.customBarcode, ...(doc.legacyCodes || [])];
  if (itemCodes.some((c) => same(c, code))) return 'item';
  const unit = (doc.units || []).find((u: any) =>
    [u.unitId, u.barcode, u.customBarcode, ...(u.legacyCodes || [])].some((c) => same(c, code))
  );
  return unit ? `unit:${unit.unitId || unit.barcode}` : null;
};

/**
 * Refuses codes that already identify another item or unit, so a scan always finds exactly one thing.
 * `self` names the slot being edited (its own current codes are allowed).
 */
export const assertCodesFree = async (codes: string[], self?: { itemId: string; slot: string }) => {
  const dup = codes.find((c, i) => codes.findIndex((o) => same(o, c)) !== i);
  if (dup) throw new AppError(`Barcode "${dup}" is listed twice.`, 400);
  for (const code of codes) {
    const hits = await Inventory.find(codeLookupFilter(code)).lean();
    for (const hit of hits) {
      const slot = slotOfCode(hit, code);
      if (self && String(hit._id) === self.itemId && slot === self.slot) continue;
      throw new AppError(`Barcode "${code}" is already used by ${hit.product || 'another item'}.`, 409);
    }
  }
};

/** Code-128 bar pattern ('1' = black module, '0' = white) for backend-rendered labels. */
export const encodeCode128Modules = (text: string): string => {
  const encoder = new CODE128(String(text || '').replace(/[^\x20-\x7E]/g, '') || '0', {});
  return String(encoder.encode().data);
};

/** Runs of black modules as {x, width} in module units, plus the total width. */
export const code128Bars = (text: string) => {
  const data = encodeCode128Modules(text);
  const bars: { x: number; width: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== '1') continue;
    const start = i;
    while (data[i + 1] === '1') i++;
    bars.push({ x: start, width: i - start + 1 });
  }
  return { bars, totalWidth: data.length };
};
