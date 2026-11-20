import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth.middleware';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { photonSearch } from './geocode.service';

const router = Router();
router.use(authenticate);
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

type Suggestion = {
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  lat: number;
  lng: number;
};

const cache = new Map<string, { at: number; data: Suggestion[] }>();
const TTL = 10 * 60_000;

const toSuggestion = (f: any): Suggestion | null => {
  const p = f?.properties || {};
  const [lng, lat] = f?.geometry?.coordinates || [];
  const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ').trim();
  if (!street || typeof lat !== 'number') return null;
  const city = p.city || p.town || p.village || p.county || '';
  const state = p.state || '';
  const zip = p.postcode || '';
  const label = [street, city, [state, zip].filter(Boolean).join(' ').trim(), p.country].filter(Boolean).join(', ');
  return { label, street, city, state, zip, country: p.country || '', lat, lng };
};

/** Address lookup/autocomplete (Photon / OpenStreetMap). Swap for Google Places later without changing the API. */
router.get(
  '/autocomplete',
  asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim().slice(0, 120);
    if (q.length < 3) return ApiResponse.success(res, 200, 'Suggestions', []);

    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return ApiResponse.success(res, 200, 'Suggestions', hit.data);

    let data: Suggestion[];
    try {
      data = (await photonSearch(q, 6, '&lat=32.78&lon=-96.8')).map(toSuggestion).filter(Boolean) as Suggestion[];
    } catch {
      // Provider hiccup: answer empty but do not cache it.
      return ApiResponse.success(res, 200, 'Suggestions', []);
    }
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), data });
    return ApiResponse.success(res, 200, 'Suggestions', data);
  })
);

export const geoRoutes = router;
