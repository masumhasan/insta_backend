// Run: npx ts-node src/scripts/testGeocode.ts  (no network, no database)
import assert from 'node:assert/strict';
import { pickBest } from '../modules/geo/geocode.service';

const feature = (props: Record<string, any>, lng = -96.8, lat = 32.78) => ({
  geometry: { coordinates: [lng, lat] },
  properties: props,
});

const dallasStreet = feature({ street: 'Main Street', city: 'Dallas', state: 'Texas', postcode: '75201', osm_key: 'highway' }, -96.8, 32.78);
const houstonExact = feature({ housenumber: '123', street: 'Main Street', city: 'Houston', state: 'Texas', postcode: '77002' }, -95.36, 29.76);
const dallasExact = feature({ housenumber: '123', street: 'Main Street', city: 'Dallas', state: 'Texas', postcode: '75201' }, -96.79, 32.77);
const dallasArea = feature({ name: 'Dallas', city: 'Dallas', state: 'Texas', osm_key: 'place' });

// 1. Exact house number in the named city wins and is marked address precision.
let r = pickBest([dallasStreet, houstonExact, dallasExact], '123 Main St, Dallas, TX 75201');
assert.equal(r?.precision, 'address');
assert.equal(r?.city, 'Dallas');

// 2. A house-number match in ANOTHER city must not beat a street match in the named city.
r = pickBest([dallasStreet, houstonExact], '123 Main St, Dallas, TX');
assert.equal(r?.city, 'Dallas');
assert.equal(r?.precision, 'street');

// 3. City-only results are marked area (shown as approximate on the map).
r = pickBest([dallasArea], 'Dallas, TX');
assert.equal(r?.precision, 'area');

// 4. No results at all is a miss.
assert.equal(pickBest([], '123 Main St, Dallas, TX'), null);

console.log('geocode tests passed');
