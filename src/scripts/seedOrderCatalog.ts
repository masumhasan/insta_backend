// Run: npx ts-node src/scripts/seedOrderCatalog.ts
// Idempotent. Moves values that used to be hardcoded in the portals' order forms into MongoDB:
//  - the `pricing` setting (rush fee, card fee %, tax %)
//  - order add-ons (settings_service with options.addOn = true)
//  - the "Other services" request list (service items in the "Other Services" category, price 0 = quote)
import mongoose from 'mongoose';
import { config } from '../config/env';
import { AppSetting } from '../modules/ops/ops.model';
import { ServiceItem } from '../modules/catalog/service.model';
import { DEFAULT_PRICING } from '../modules/order/order.pricing';

const ADD_ONS = [
  { name: 'Shoe Covers', price: 5, description: 'Installer wears shoe covers on the property.' },
  { name: 'Brochure Box', price: 10, description: 'Brochure box installed with the sign.' },
];

const OTHER_SERVICES = [
  'Custom Post Painting / Staining',
  'Rider Bracket Hardware Install',
  'Sign Relocation on Property',
  'Post Repair / Re-staking',
  'Brochure Box Restocking / Replacement',
  'Lockbox Retrieval & Return',
  'Specialty Site Inspection',
  'Commercial Post Removal',
];

(async () => {
  await mongoose.connect(config.mongodbUri);

  // $setOnInsert keeps any value staff already changed.
  await AppSetting.updateOne({ key: 'pricing' }, { $setOnInsert: { key: 'pricing', value: DEFAULT_PRICING, updatedBy: 'seed' } }, { upsert: true });

  for (const a of ADD_ONS) {
    await ServiceItem.updateOne(
      { type: 'settings_service', name: a.name, category: 'Add-on' },
      { $setOnInsert: { type: 'settings_service', name: a.name, category: 'Add-on', price: a.price, description: a.description, options: { addOn: true } } },
      { upsert: true }
    );
  }
  for (const name of OTHER_SERVICES) {
    await ServiceItem.updateOne(
      { type: 'service', name, category: 'Other Services' },
      { $setOnInsert: { type: 'service', name, category: 'Other Services', price: 0, description: 'Quoted by the sign company after review.' } },
      { upsert: true }
    );
  }

  console.log('[Seed] pricing setting, add-ons and other services are in place.');
  await mongoose.disconnect();
})();
