export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  city: string;
  zip: string;
  /** address = house number matched, street = street matched only, area = city/ZIP level */
  precision: 'address' | 'street' | 'area';
};

const cache = new Map<string, { at: number; value: GeocodeResult | null }>();
const TTL_MS = 24 * 60 * 60 * 1000;

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Shared Photon (OpenStreetMap) search, US only. Throws when the provider fails, so callers never mistake an outage for "no match". */
export async function photonSearch(q: string, limit: number, extra = ''): Promise<any[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=en&bbox=-125,24,-66,50${extra}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'instapost-geocoder' }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Photon responded ${res.status}`);
  const json: any = await res.json();
  return Array.isArray(json.features) ? json.features : [];
}

export const toResult = (f: any, wantedNumber: string): GeocodeResult | null => {
  const p = f?.properties || {};
  const [lng, lat] = f?.geometry?.coordinates || [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ').trim();
  const city = String(p.city || p.town || p.village || p.county || '');
  const zip = String(p.postcode || '');
  const label = [street, city, p.state, zip].filter(Boolean).join(', ');
  const precision: GeocodeResult['precision'] = p.housenumber && (!wantedNumber || p.housenumber === wantedNumber)
    ? 'address'
    : p.street || p.osm_key === 'highway'
    ? 'street'
    : 'area';
  return { lat, lng, label: label || String(p.name || ''), city, zip, precision };
};

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Picks the best match. Only results in the city/ZIP the address names are considered when any exist, so "123 Main St, Dallas" never lands in another city. */
export function pickBest(features: any[], address: string): GeocodeResult | null {
  const wantedNumber = (address.match(/^\s*(\d+[A-Za-z]?)\b/) || [])[1] || '';
  const results = features.map((f) => toResult(f, wantedNumber)).filter(Boolean) as GeocodeResult[];
  const text = words(address);
  const local = results.filter((r) => (r.zip && text.includes(words(r.zip))) || (r.city && text.includes(words(r.city))));
  const rank = { address: 0, street: 1, area: 2 } as const;
  return (local.length ? local.sort((a, b) => rank[a.precision] - rank[b.precision]) : results)[0] || null;
}

/**
 * Looks an address up and returns the best match with its precision, or null when Photon found nothing.
 * Throws when Photon itself fails (timeout, rate limit): failures are never cached, real misses are cached for a day.
 * Swap the provider here (e.g. Google) without touching callers.
 */
export async function geocodeAddress(rawAddress: string): Promise<GeocodeResult | null> {
  const address = normalise(String(rawAddress || ''));
  if (address.length < 5) return null;

  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const value = pickBest(await photonSearch(address, 5), address);
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Runs async work over items with a small concurrency limit (be polite to the free geocoder). */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
