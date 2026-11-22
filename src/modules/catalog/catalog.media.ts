import { Request, Response } from 'express';
import { ServiceItem } from './service.model';
import { Package } from './package.model';
import { listAddOns } from './catalog.addons';
import { AppError } from '../../utils/apiError';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { isStaff } from '../../middlewares/roleGuard.middleware';

/**
 * What the Media Services order form offers, built from the catalog:
 * - Photography / Videography: `settings_service` items of the "Media Services" category (Items & Pricing → Services),
 *   split by `options.mediaGroup` when set, else by name / icon (video words → videography, photo words → photography).
 * - Media Packages: `Package` rows of the `media` category.
 * - Extras (Additional Services step): the other media services (virtual staging, floor plans, …) and the
 *   `media_service` add-ons. Extras are priced but do not lengthen the onsite appointment.
 * Duration of a service is `options.duration` (minutes). A package uses its own `durationMinutes`, else the summed
 * durations of the services named in its features, else the default.
 */
export type MediaGroup = 'photography' | 'videography' | 'package' | 'extra' | 'addon';
export type MediaOffering = {
  id: string;
  kind: 'service' | 'package' | 'addon';
  group: MediaGroup;
  name: string;
  price: number;
  description: string;
  imageUrl: string;
  features: string[];
  durationMinutes: number;
  linked: string[];
};

export const DEFAULT_MEDIA_DURATION = 60;
const VIDEO = /video|film|walk-?through|reel/i;
const PHOTO = /photo|hdr|twilight/i;
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const minutes = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v)) : 0);

function serviceGroup(item: any): MediaGroup {
  const o = item.options || {};
  if (['photography', 'videography', 'extra'].includes(o.mediaGroup)) return o.mediaGroup;
  if (o.iconType === 'video' || VIDEO.test(item.name)) return 'videography';
  if (PHOTO.test(item.name) || o.iconType === 'camera') return 'photography';
  return 'extra';
}

/** Items limited to some agents or offices are only shown to them; staff see everything. An empty list means everyone. */
function canSee(user: any, visibility: unknown, agents: unknown, offices: unknown): boolean {
  if (isStaff(user)) return true;
  const v = norm(visibility || 'all');
  if (v !== 'agent' && v !== 'office') return true;
  const list = ((v === 'agent' ? agents : offices) as string[]) || [];
  if (!Array.isArray(list) || list.length === 0) return true;
  const mine = [user?.name, user?.office, user?.email, user?._id].map(norm).filter(Boolean);
  return list.some((entry) => mine.includes(norm(entry)));
}

export async function loadMediaOfferings(user: any) {
  const [services, packages, addOns] = await Promise.all([
    ServiceItem.find({ type: 'settings_service', 'options.active': { $ne: false }, 'options.addOn': { $ne: true } }).sort({ price: 1 }).lean(),
    Package.find({ $or: [{ category: 'media' }, { category: { $exists: false } }] }).sort({ price: 1 }).lean(),
    listAddOns('media_service', user),
  ]);
  const media = services.filter((s: any) => /media/i.test(String(s.category || s.options?.type || '')) || s.options?.mediaGroup);
  const durationByName = new Map(media.map((s: any) => [norm(s.name), minutes(s.options?.duration) || DEFAULT_MEDIA_DURATION]));

  const fromService = (s: any): MediaOffering => ({
    id: String(s._id),
    kind: 'service',
    group: serviceGroup(s),
    name: s.name,
    price: Number(s.price) || 0,
    description: s.description || s.options?.note || '',
    imageUrl: s.imageUrl || '',
    features: Array.isArray(s.options?.features) ? s.options.features.map(String).filter(Boolean) : [],
    durationMinutes: minutes(s.options?.duration) || DEFAULT_MEDIA_DURATION,
    linked: Array.isArray(s.options?.linkedServices) ? s.options.linkedServices.map((l: any) => String(l?.name || '')).filter(Boolean) : [],
  });
  const fromPackage = (p: any): MediaOffering => {
    const features: string[] = (p.features || []).map((f: any) => String(typeof f === 'string' ? f : f?.name || '')).filter(Boolean);
    const summed = features.reduce((sum, f) => sum + (durationByName.get(norm(f)) || 0), 0);
    return {
      id: String(p._id),
      kind: 'package',
      group: 'package',
      name: p.title,
      price: Number(p.price) || 0,
      description: p.description || '',
      imageUrl: p.imageUrl || p.image || '',
      features,
      durationMinutes: minutes(p.durationMinutes) || summed || DEFAULT_MEDIA_DURATION,
      linked: (p.linkedServices || []).filter((l: any) => l?.active !== false).map((l: any) => String(l?.name || '')).filter(Boolean),
    };
  };

  const visibleServices = media
    .filter((s: any) => canSee(user, s.options?.visibility, s.options?.agents, s.options?.offices))
    .map(fromService);
  return {
    photography: visibleServices.filter((s) => s.group === 'photography'),
    videography: visibleServices.filter((s) => s.group === 'videography'),
    packages: packages
      .filter((p: any) => (p.category ? p.category === 'media' : !/open house|for sale|directional/i.test(String(p.title || ''))))
      .filter((p: any) => canSee(user, p.visibility, p.agents, p.offices))
      .map(fromPackage),
    extras: visibleServices.filter((s) => s.group === 'extra'),
    addOns: addOns.map(
      (a): MediaOffering => ({
        id: a.id,
        kind: 'addon',
        group: 'addon',
        name: a.name,
        price: a.price,
        description: a.description,
        imageUrl: a.imageUrl,
        features: [],
        durationMinutes: 0,
        linked: [],
      })
    ),
  };
}

const ids = (raw: unknown): string[] =>
  Array.from(new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map((v) => String(v ?? '').trim()).filter(Boolean)));

/**
 * Prices a media selection on the server: `{ packageId?, serviceIds[], extraServiceIds[], addOnIds[] }`.
 * Every id must be an offering this user can order; the onsite duration is the package plus the chosen services.
 */
export async function resolveMediaSelection(raw: any, user: any) {
  const sel = raw && typeof raw === 'object' ? raw : {};
  const offers = await loadMediaOfferings(user);
  const pick = (list: MediaOffering[], wanted: string[]) =>
    wanted.map((id) => {
      const hit = list.find((o) => o.id === id);
      if (!hit) throw new AppError('One of the selected media services is not available.', 400);
      return hit;
    });
  const pkg = pick(offers.packages, ids(sel.packageId).slice(0, 1));
  const services = pick([...offers.photography, ...offers.videography], ids(sel.serviceIds));
  const extras = pick(offers.extras, ids(sel.extraServiceIds));
  const addOns = pick(offers.addOns, ids(sel.addOnIds));
  if (pkg.length + services.length === 0) {
    throw new AppError('Choose a photography or videography service, or a media package.', 400);
  }
  const lines = [...pkg, ...services, ...extras, ...addOns].map((o) => ({
    id: o.id,
    kind: o.kind,
    group: o.group,
    name: o.name,
    price: o.price,
    durationMinutes: o.group === 'extra' || o.group === 'addon' ? 0 : o.durationMinutes,
  }));
  return {
    packageId: pkg[0]?.id || '',
    serviceIds: services.map((s) => s.id),
    extraServiceIds: extras.map((s) => s.id),
    addOnIds: addOns.map((s) => s.id),
    lines,
    subtotal: Number(lines.reduce((sum, l) => sum + l.price, 0).toFixed(2)),
    durationMinutes: lines.reduce((sum, l) => sum + l.durationMinutes, 0) || DEFAULT_MEDIA_DURATION,
  };
}

export const getMediaOfferings = asyncHandler(async (req: Request, res: Response) => {
  const data = await loadMediaOfferings((req as any).user);
  return ApiResponse.success(res, 200, 'Media offerings retrieved', data);
});
