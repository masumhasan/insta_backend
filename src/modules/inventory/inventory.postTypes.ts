import { AppError } from '../../utils/apiError';

/**
 * Post-type compatibility for main panels and riders.
 * A post type is the name of a "Sign post" inventory item. A panel/rider lists the post types it fits in
 * `compatiblePostTypes`; older records only have the single `postType`, which is read as `[postType]`.
 */
export const NEEDS_POST_TYPE = /^(main panel|sign)$/i;
export const PLY_OPTIONS = ['Single Ply', 'Double Ply'] as const;

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const uniqueClean = (values: unknown[]) => {
  const out: string[] = [];
  for (const v of values) {
    const t = String(v ?? '').trim().slice(0, 120);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 20);
};

/** Post types sent by a client: `compatiblePostTypes` (array or "a|b"), else the legacy `postType`. `undefined` = not sent. */
export function readPostTypes(payload: any): string[] | undefined {
  const raw = payload?.compatiblePostTypes;
  if (Array.isArray(raw)) return uniqueClean(raw);
  if (typeof raw === 'string') return uniqueClean(raw.split('|'));
  if (payload?.postType !== undefined) return uniqueClean([payload.postType]);
  return undefined;
}

/** Post types stored on an item, reading legacy single values as a one-item list. */
export function postTypesOf(item: any): string[] {
  const list = Array.isArray(item?.compatiblePostTypes) ? uniqueClean(item.compatiblePostTypes) : [];
  if (list.length) return list;
  return uniqueClean([item?.postType]);
}

/** Does this panel/rider fit on the post with this name? Items with no post types saved are not restricted. */
export function fitsPost(item: any, postName: string): boolean {
  const types = postTypesOf(item);
  return !types.length || types.some((t) => t.toLowerCase() === String(postName || '').trim().toLowerCase());
}

/** Mongo clause: items made for any of `types`, plus items with no post type saved yet (older records). */
export function postTypeClause(types: string[]) {
  const res = types.map((t) => new RegExp('^' + escapeRe(t) + '$', 'i'));
  return {
    $or: [
      { compatiblePostTypes: { $in: res } },
      { postType: { $in: res } },
      { $and: [{ $or: [{ compatiblePostTypes: { $exists: false } }, { compatiblePostTypes: { $size: 0 } }] }, { $or: [{ postType: '' }, { postType: { $exists: false } }] }] },
    ],
  };
}

/** Normalises the rider ply value; anything else is a 400. */
export function cleanPly(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const hit = PLY_OPTIONS.find((p) => p.toLowerCase() === s.toLowerCase());
  if (!hit) throw new AppError(`Ply must be one of: ${PLY_OPTIONS.join(', ')}.`, 400);
  return hit;
}

/**
 * Applies post types / ply from a create or update payload onto `target`. The Main Panel rule is checked on
 * create, and on update only when the item type or post types are being changed (so stock edits on older
 * records without a post type keep working).
 */
export function applyPostFields(target: any, payload: any, itemType: string, isCreate: boolean) {
  const types = readPostTypes(payload);
  if (types !== undefined) {
    target.compatiblePostTypes = types;
    target.postType = types[0] || '';
  }
  if (payload?.ply !== undefined) target.ply = cleanPly(payload.ply);
  const enforce = isCreate || types !== undefined || payload?.itemType !== undefined;
  if (enforce && NEEDS_POST_TYPE.test(itemType || '') && !postTypesOf(target).length) {
    throw new AppError('Select at least one Post Type for Main panel / Sign items.', 400);
  }
}
