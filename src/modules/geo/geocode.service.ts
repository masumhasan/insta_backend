export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  /** address = house number matched, street = street matched only, area = city/ZIP level */
  precision: 'address' | 'street' | 'area';
};

const cache = new Map<string, { at: number; value: GeocodeResult | null }>();
const TTL_MS = 24 * 60 * 60 * 1000;

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

const toResult = (f: any, wantedNumber: string): GeocodeResult | null => {
  const p = f?.properties || {};
  const [lng, lat] = f?.geometry?.coordinates || [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ').trim();
  const label = [street, p.city || p.town || p.village || p.county, p.state, p.postcode].filter(Boolean).join(', ');
  const precision: GeocodeResult['precision'] = p.housenumber && (!wantedNumber || p.housenumber === wantedNumber)
    ? 'address'
    : p.street || p.osm_key === 'highway'
    ? 'street'
    : 'area';
  return { lat, lng, label: label || String(p.name || ''), precision };
};

/**
 * Looks an address up (Photon / OpenStreetMap, US only) and returns the best match with its precision.
 * Results — including misses — are cached for a day. Swap the provider here (e.g. Google) without touching callers.
 */
export async function geocodeAddress(rawAddress: string): Promise<GeocodeResult | null> {
  const address = normalise(String(rawAddress || ''));
  if (address.length < 5) return null;

  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const wantedNumber = (address.match(/^\s*(\d+[A-Za-z]?)\b/) || [])[1] || '';
  let value: GeocodeResult | null = null;
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=5&lang=en&bbox=-125,24,-66,50`;
    const res = await fetch(url, { headers: { 'User-Agent': 'instapost-geocoder' }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const json: any = await res.json();
      const results = (json.features || []).map((f: any) => toResult(f, wantedNumber)).filter(Boolean) as GeocodeResult[];
      const rank = { address: 0, street: 1, area: 2 } as const;
      value = results.sort((a, b) => rank[a.precision] - rank[b.precision])[0] || null;
    }
  } catch {
    value = null;
  }
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
