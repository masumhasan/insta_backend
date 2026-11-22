import { ServiceItem } from './service.model';
import { AppError } from '../../utils/apiError';
import { isStaff } from '../../middlewares/roleGuard.middleware';
import { normaliseAnnouncementOptions } from './catalog.announcements';

/**
 * Order add-ons and print options.
 * - An add-on is a `service` catalog item (Items & Pricing → Add-On Services) tied to one order form through
 *   `options.orderType`. Older add-ons were `settings_service` items flagged `options.addOn`; they still count as
 *   New Sign Install add-ons, and "Other Services" category rows without a type count as Other Service add-ons.
 * - A print option is an `option` catalog item (Printing → Options), e.g. grommet placement, with
 *   `options.appliesTo` (sign / rider) and `options.active`.
 */
export const ADD_ON_ORDER_TYPES = ['sign_installations', 'for_sale', 'open_house', 'media_service', 'other_services'] as const;
export type AddOnOrderType = (typeof ADD_ON_ORDER_TYPES)[number];

/** Order-form keys and order types the portals already use, mapped to the add-on order type. */
const ORDER_TYPE_ALIASES: Record<string, AddOnOrderType> = {
  'new-sign-install': 'sign_installations',
  installation: 'sign_installations',
  'sign installation': 'sign_installations',
  'order-for-sale-directionals': 'for_sale',
  'for sale directionals': 'for_sale',
  'order-open-house-services': 'open_house',
  'open house directionals': 'open_house',
  'order-media-services': 'media_service',
  'media services': 'media_service',
  'other-order-service': 'other_services',
  'other services': 'other_services',
};

export function cleanAddOnOrderType(raw: unknown): AddOnOrderType | '' {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return '';
  if ((ADD_ON_ORDER_TYPES as readonly string[]).includes(v)) return v as AddOnOrderType;
  const hit = ORDER_TYPE_ALIASES[v];
  if (!hit) throw new AppError(`Order type must be one of: ${ADD_ON_ORDER_TYPES.join(', ')}.`, 400);
  return hit;
}

const LEGACY: Partial<Record<AddOnOrderType, Record<string, unknown>>> = {
  sign_installations: { type: 'settings_service', 'options.addOn': true },
  other_services: { type: 'service', category: /^other services$/i, 'options.orderType': { $in: [null, ''] } },
};

/** Mongo filter for the active add-ons of one order form. */
export function addOnFilter(orderType: AddOnOrderType) {
  const legacy = LEGACY[orderType];
  const or: Record<string, unknown>[] = [{ type: 'service', 'options.orderType': orderType }];
  if (legacy) or.push(legacy);
  return { $and: [{ $or: or }, { 'options.active': { $ne: false } }] };
}

/** Add-ons limited to some agents or offices are only shown to those users; staff see every add-on. */
function visibleTo(item: any, user: any): boolean {
  if (isStaff(user)) return true;
  const o = item.options || {};
  const v = String(o.visibility || 'everyone').toLowerCase();
  if (v === 'agent') return Array.isArray(o.agents) && o.agents.includes(user?.name);
  if (v === 'office') return Array.isArray(o.offices) && (o.offices.includes(user?.office) || o.offices.includes(user?.name));
  return true;
}

export async function listAddOns(rawOrderType: unknown, user: any) {
  const orderType = cleanAddOnOrderType(rawOrderType);
  if (!orderType) throw new AppError('orderType is required.', 400);
  const rows = await ServiceItem.find(addOnFilter(orderType)).sort({ name: 1 }).lean();
  return rows
    .filter((r: any) => visibleTo(r, user))
    .map((r: any) => ({
      id: String(r._id),
      name: r.name,
      price: Number(r.price) || 0,
      description: r.description || '',
      imageUrl: r.imageUrl || '',
      orderType,
    }));
}

/** The add-ons of `orderType` with these ids that the user may order; a missing or hidden one is a 400. */
export async function findOrderableAddOns(ids: string[], orderType: AddOnOrderType, user: any) {
  const unique = Array.from(new Set(ids));
  const rows = await ServiceItem.find({ $and: [{ _id: { $in: unique } }, addOnFilter(orderType)] }).lean();
  const valid = rows.filter((r: any) => visibleTo(r, user));
  if (valid.length !== unique.length) throw new AppError('One of the selected add-on services is not available.', 400);
  return valid;
}

export const PRINT_OPTION_TARGETS = ['sign', 'rider'] as const;

const cleanTargets = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,|]/);
  const out = list.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const bad = out.find((t) => !(PRINT_OPTION_TARGETS as readonly string[]).includes(t));
  if (bad) throw new AppError(`Print options apply to: ${PRINT_OPTION_TARGETS.join(', ')}.`, 400);
  return Array.from(new Set(out));
};

const cleanFeatures = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) throw new AppError('Features must be a list of text lines.', 400);
  return raw.map((f) => String(f ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 50);
};

/** Checks the type-specific `options` keys of a catalog item before it is saved. */
export function normaliseItemOptions(type: string, options: any) {
  if (!options || typeof options !== 'object') return options;
  const out = { ...options };
  if (type === 'service' && out.orderType !== undefined) out.orderType = cleanAddOnOrderType(out.orderType);
  if (type === 'option' && out.appliesTo !== undefined) out.appliesTo = cleanTargets(out.appliesTo);
  if (type === 'settings_service' && out.features !== undefined) out.features = cleanFeatures(out.features);
  if (out.active !== undefined) out.active = out.active !== false && out.active !== 'false';
  return type === 'announcement' ? normaliseAnnouncementOptions(out) : out;
}

/** Active print options (grommet placement and the like), optionally only those for signs or riders. */
export async function listPrintOptions(rawTarget: unknown) {
  const target = String(rawTarget ?? '').trim().toLowerCase();
  if (target && !(PRINT_OPTION_TARGETS as readonly string[]).includes(target)) {
    throw new AppError(`appliesTo must be one of: ${PRINT_OPTION_TARGETS.join(', ')}.`, 400);
  }
  const rows = await ServiceItem.find({ type: 'option', 'options.active': { $ne: false } }).sort({ name: 1 }).lean();
  return rows
    .map((r: any) => {
      const appliesTo: string[] = Array.isArray(r.options?.appliesTo) && r.options.appliesTo.length ? r.options.appliesTo : ['sign', 'rider'];
      return { id: String(r._id), name: r.name, price: Number(r.price) || 0, description: r.description || '', appliesTo };
    })
    .filter((o) => !target || o.appliesTo.includes(target));
}
