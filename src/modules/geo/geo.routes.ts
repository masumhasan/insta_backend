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
      const usOnly = (s: Suggestion | null): s is Suggestion => !!s && /united states|^usa?$/i.test(s.country);
      data = (await photonSearch(q, 6, '&lat=32.78&lon=-96.8')).map(toSuggestion).filter(usOnly);
      // OpenStreetMap often lacks house numbers, so "5800 Legacy Dr Plano" may only match the street. Look the street
      // up without the number and put the typed number back in front. A street must contain the typed street name
      // (the provider's fuzzy matching otherwise offers unrelated streets).
      const numbered = q.match(/^(\d+[a-z]?)\s+(.{3,})$/i);
      if (numbered) {
        const [, num, rest] = numbered;
        const nameWord = (rest.match(/[a-z]{3,}/i)?.[0] || '').toLowerCase();
        const exact = data.filter((s) => s.street.startsWith(`${num} `));
        // Only when no house-level match exists; a failed street lookup must not drop the exact matches.
        const streets = exact.length
          ? []
          : (await photonSearch(rest, 6, '&lat=32.78&lon=-96.8&osm_tag=highway').catch(() => []))
              .map(toSuggestion)
              .filter(usOnly)
              .filter((s) => !/^\d/.test(s.street) && s.street.toLowerCase().includes(nameWord))
              .map((s) => {
                const street = `${num} ${s.street}`;
                return { ...s, street, label: s.label.replace(s.street, street) };
              });
        data = [...exact, ...streets];
      }
      data = data.filter((s, i, all) => all.findIndex((x) => x.label === s.label) === i).slice(0, 8);
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
