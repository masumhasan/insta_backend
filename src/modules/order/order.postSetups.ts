import { Inventory } from '../inventory/inventory.model';
import { ownerScopeFilter } from '../inventory/inventory.service';
import { fitsPost } from '../inventory/inventory.postTypes';
import { riderSlotsFor } from '../inventory/inventory.riderMount';
import { ServiceItem } from '../catalog/service.model';
import { findOrderableAddOns } from '../catalog/catalog.addons';
import { AppError } from '../../utils/apiError';
import { itemFeeOf, moneyOf as money, round2 as round, setupTotal } from './order.postMath';
import { isCustomSlot, loadPrintCatalog, resolveCustomSlot, type CustomDesign, type PrintCatalog } from './order.customPrint';

/**
 * New Sign Install with 1–3 posts at one address. Each post setup has its own post, main panel and riders and is
 * charged its own install fee. Stored on `order.specifications.postSetups`; the first setup is mirrored onto the
 * older single-post keys (`postId`, `postLabel`, `slots`) so existing screens keep working.
 */
export const MAX_POSTS = 3;
export const SLOT_KEYS = ['top1', 'top2', 'main', 'bottom'] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];
export const SLOT_NAMES: Record<SlotKey, string> = { top1: 'Top Rider', top2: 'Bottom Rider 2', main: 'Main Panel', bottom: 'Bottom Rider' };
const SLOT_TYPE: Record<SlotKey, RegExp> = { top1: /^rider$/i, top2: /^rider$/i, main: /^(main panel|sign)$/i, bottom: /^rider$/i };

export type PricedSlot = { id: string; name: string; size: string; image: string; owner: string; price: number; custom?: true; design?: CustomDesign };
export type PricedSetup = {
  postId: string;
  postName: string;
  postLabel: string;
  postImage: string;
  postOwner: string;
  installFee: number;
  itemsFee: number;
  total: number;
  slots: Partial<Record<SlotKey, PricedSlot>>;
};

const idOf = (v: any) => String(v?.id ?? v?._id ?? v ?? '').trim();
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Inventory rows by id, limited to what this user may see (same scope as `GET /inventory`). */
async function loadVisible(ids: string[], user: any) {
  const clean = Array.from(new Set(ids.filter((id) => OBJECT_ID.test(id))));
  if (!clean.length) return new Map<string, any>();
  const scope = ownerScopeFilter(user, false);
  const rows = await Inventory.find(scope ? { $and: [{ _id: { $in: clean } }, scope] } : { _id: { $in: clean } }).lean();
  return new Map(rows.map((r: any) => [String(r._id), r]));
}

/** Cheapest active catalog "Installation" service: the install fee for a post without its own Install Price. */
async function catalogInstallFee() {
  const [cheapest] = await ServiceItem.find({ type: 'service', category: /^installation$/i, price: { $gt: 0 }, 'options.active': { $ne: false } }).sort({ price: 1 }).limit(1).lean();
  return cheapest ? Number(cheapest.price) || 0 : 0;
}

const postLabelOf = (p: any) => [p.size, p.product, p.color].filter(Boolean).join(', ');
const slotOf = (r: any): PricedSlot => ({ id: String(r._id), name: String(r.product || ''), size: String(r.size || ''), image: String(r.imageUrl || ''), owner: String(r.owner || ''), price: itemFeeOf(r) });

/** Validates the post setups against inventory and prices each one on the server. */
export async function resolvePostSetups(raw: unknown, user: any): Promise<{ setups: PricedSetup[]; subtotal: number }> {
  if (!Array.isArray(raw) || raw.length === 0) throw new AppError('Add at least one post to the order.', 400);
  if (raw.length > MAX_POSTS) throw new AppError(`An address can have at most ${MAX_POSTS} posts.`, 400);
  const ids = raw.flatMap((s: any) => [
    idOf(s?.postId),
    ...SLOT_KEYS.map((k) => s?.slots?.[k]).map((v) => (isCustomSlot(v) ? idOf(v?.design?.templateId) : idOf(v))).filter(Boolean),
  ]);
  const anyCustom = raw.some((s: any) => SLOT_KEYS.some((k) => isCustomSlot(s?.slots?.[k])));
  const [items, fallbackFee, printing] = await Promise.all([loadVisible(ids, user), catalogInstallFee(), anyCustom ? loadPrintCatalog() : null]);

  const setups = raw.map((s: any, i: number): PricedSetup => {
    const n = i + 1;
    const post = items.get(idOf(s?.postId));
    if (!post || !/^sign post$/i.test(String(post.itemType || ''))) throw new AppError(`Post ${n}: select a post type.`, 400);
    const installFee = money(post.installPrice) || fallbackFee;
    if (!(installFee > 0)) throw new AppError(`Post ${n}: the install price is not configured (set an Install Price on the post or add an Installation service).`, 400);
    const slots: PricedSetup['slots'] = {};
    for (const k of SLOT_KEYS) {
      const v = s?.slots?.[k];
      if (isCustomSlot(v)) {
        const tpl = items.get(idOf(v?.design?.templateId));
        const template = tpl && SLOT_TYPE[k].test(String(tpl.itemType || '')) ? tpl : undefined;
        slots[k] = resolveCustomSlot(v, k !== 'main', `Post ${n} ${SLOT_NAMES[k].toLowerCase()}`, printing as PrintCatalog, template);
        continue;
      }
      const id = idOf(v);
      if (!id) continue;
      const it = items.get(id);
      if (!it || !SLOT_TYPE[k].test(String(it.itemType || ''))) throw new AppError(`Post ${n}: the ${SLOT_NAMES[k].toLowerCase()} is not available.`, 400);
      if (!fitsPost(it, post.product)) throw new AppError(`Post ${n}: "${it.product}" does not fit on ${post.product}.`, 400);
      if (k !== 'main' && !riderSlotsFor(it.mountType).includes(k)) throw new AppError(`Post ${n}: "${it.product}" (${it.mountType}) cannot be mounted as the ${SLOT_NAMES[k].toLowerCase()}.`, 400);
      slots[k] = slotOf(it);
    }
    const t = setupTotal(installFee, Object.values(slots).map((x) => x!.price));
    return {
      postId: String(post._id),
      postName: String(post.product || ''),
      postLabel: postLabelOf(post),
      postImage: String(post.imageUrl || ''),
      postOwner: String(post.owner || ''),
      installFee: round(installFee),
      ...t,
      slots,
    };
  });
  return { setups, subtotal: round(setups.reduce((s, x) => s + x.total, 0)) };
}

/** Lockbox and add-on charges of a New Sign Install, priced from inventory and the add-on catalog. */
export async function priceInstallExtras(specs: any, user: any): Promise<number> {
  let total = 0;
  const lockboxId = idOf(specs?.lockbox);
  if (lockboxId) {
    const lb = (await loadVisible([lockboxId], user)).get(lockboxId);
    if (!lb || !/^lockbox$/i.test(String(lb.itemType || ''))) throw new AppError('The selected lockbox is not available.', 400);
    total += itemFeeOf(lb);
  }
  const addOnIds = (Array.isArray(specs?.addons) ? specs.addons : []).map(idOf).filter((id: string) => OBJECT_ID.test(id));
  if (addOnIds.length) {
    const valid = await findOrderableAddOns(addOnIds, 'sign_installations', user);
    total += valid.reduce((s: number, r: any) => s + money(r.price), 0);
  }
  return round(total);
}

/** Keys older screens read for a single-post order, filled from the setups (all posts' items, first post's layout). */
export function legacyPostKeys(setups: PricedSetup[]) {
  const first = setups[0];
  return {
    postId: first.postId,
    postLabel: setups.length > 1 ? setups.map((s, i) => `Post ${i + 1}: ${s.postLabel}`).join(' · ') : first.postLabel,
    slots: first.slots,
    postCount: setups.length,
    // Custom (designed / uploaded) pieces waiting for the customer's design approval.
    customItems: setups.flatMap((s, i) =>
      SLOT_KEYS.filter((k) => s.slots[k]?.custom).map((k) => ({ post: i + 1, slot: k, slotName: SLOT_NAMES[k], name: s.slots[k]!.name, price: s.slots[k]!.price, ...s.slots[k]!.design })),
    ),
  };
}
