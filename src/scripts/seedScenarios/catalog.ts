import { ServiceItem } from '../../modules/catalog/service.model';
import { Coupon } from '../../modules/catalog/coupon.model';
import { Package } from '../../modules/catalog/package.model';
import { Favorite } from '../../modules/favorite/favorite.model';
import { AppSetting } from '../../modules/ops/ops.model';
import { Inventory } from '../../modules/inventory/inventory.model';
import { TAG, iso, type People } from './helpers';

export const BROKERAGES = ['RE/MAX Metroplex', 'Keller Williams Dallas', 'Compass Texas', 'Coldwell Banker Realty', 'Ebby Halliday Realtors', 'Century 21 Judge Fite'];
export const COUPON_CODES = ['WELCOME10', 'SAVE25', 'SPRING15', 'PARTNER20', 'ONEUSE'];
export const PACKAGE_TITLES = ['Open House Starter Kit', 'Open House Premium Kit', 'Directional Pack - 3 Arrows', 'Directional Pack - 6 Arrows'];

const item = (type: string, name: string, price: number, extra: Record<string, any> = {}, category = '') =>
  ServiceItem.updateOne({ type, name }, { $setOnInsert: { type, name, price, category, options: { seed: TAG, ...extra } } }, { upsert: true });

export async function seedCatalog(people: People) {
  for (const b of BROKERAGES) await item('brokerage', b, 0);

  // Announcements shown in the portals' banner (audience + active window).
  await ServiceItem.updateOne({ type: 'announcement', name: 'Holiday schedule' }, { $setOnInsert: { type: 'announcement', name: 'Holiday schedule', price: 0, description: 'Installs are paused on the public holiday. Orders placed that day are scheduled for the next business day.', options: { seed: TAG, audience: ['all'], active: true, startsAt: iso(-1), endsAt: iso(21) } } }, { upsert: true });
  await ServiceItem.updateOne({ type: 'announcement', name: 'New rider designs available' }, { $setOnInsert: { type: 'announcement', name: 'New rider designs available', price: 0, description: 'Rental riders now include OPEN HOUSE and PENDING. Order them with your next install.', options: { seed: TAG, audience: ['agent', 'assistant', 'team_lead'], active: true, startsAt: iso(-3), endsAt: iso(30) } } }, { upsert: true });
  await ServiceItem.updateOne({ type: 'announcement', name: 'Pull list reminder' }, { $setOnInsert: { type: 'announcement', name: 'Pull list reminder', price: 0, description: 'Scan every item on the pull list before leaving the warehouse.', options: { seed: TAG, audience: ['installer', 'warehouse'], active: true, startsAt: iso(-2), endsAt: iso(14) } } }, { upsert: true });

  // Print order options (priced extras) and sign types are used by the print forms.
  await item('option', 'Lamination', 4, {}, 'Print');
  await item('option', 'Grommets', 2, {}, 'Print');
  await item('option', 'Double-sided print', 6, {}, 'Print');

  // Coupons in every state: active percent, active fixed with a minimum, expired, disabled, fully used.
  const coupons = [
    { code: 'WELCOME10', discountType: 'percentage', discountValue: 10, minOrderAmount: 0, status: 'active', usageLimit: 500, usageCount: 12, validUntil: new Date(Date.now() + 120 * 86400000) },
    { code: 'SAVE25', discountType: 'fixed', discountValue: 25, minOrderAmount: 150, status: 'active', usageLimit: 100, usageCount: 3, validUntil: new Date(Date.now() + 60 * 86400000) },
    { code: 'SPRING15', discountType: 'percentage', discountValue: 15, minOrderAmount: 0, status: 'expired', usageLimit: 200, usageCount: 87, validUntil: new Date(Date.now() - 30 * 86400000) },
    { code: 'PARTNER20', discountType: 'percentage', discountValue: 20, minOrderAmount: 100, status: 'disabled', usageLimit: 50, usageCount: 0, validUntil: new Date(Date.now() + 90 * 86400000) },
    { code: 'ONEUSE', discountType: 'fixed', discountValue: 10, minOrderAmount: 0, status: 'active', usageLimit: 1, usageCount: 1, validUntil: new Date(Date.now() + 90 * 86400000) },
  ];
  for (const c of coupons) await Coupon.updateOne({ code: c.code }, { $setOnInsert: { ...c, description: 'Sample promotional coupon' } }, { upsert: true });

  // Packages for the Open House and For Sale Directionals tabs (the Media tab already has packages).
  const shoeCovers = await ServiceItem.findOne({ type: 'settings_service', name: 'Shoe Covers' }).lean();
  const linked = shoeCovers ? [{ id: String(shoeCovers._id), name: 'Shoe Covers', price: shoeCovers.price, active: true }] : [];
  const packages = [
    { title: 'Open House Starter Kit', category: 'open_house', price: 89, description: '3 directional arrows and one open house rider for a weekend event.', features: ['3 directional arrows', 'Open house rider', 'Same-day setup'] },
    { title: 'Open House Premium Kit', category: 'open_house', price: 149, description: '6 directional arrows, rider and balloons-ready bracket with pickup after the event.', features: ['6 directional arrows', 'Open house rider', 'Pickup after the event'] },
    { title: 'Directional Pack - 3 Arrows', category: 'for_sale', price: 59, description: 'Three directional arrows placed on your route.', features: ['3 arrows', 'Placement and removal'] },
    { title: 'Directional Pack - 6 Arrows', category: 'for_sale', price: 99, description: 'Six directional arrows for larger neighbourhoods.', features: ['6 arrows', 'Placement and removal'] },
  ];
  for (const p of packages) {
    await Package.updateOne(
      { title: p.title },
      { $setOnInsert: { title: p.title, category: p.category, price: p.price, description: p.description, visibility: 'all', agents: [], offices: [], features: p.features.map((name) => ({ name })), linkedServices: linked } },
      { upsert: true }
    );
  }
  // Packages saved before categories existed get one (by their title, like the old tabs did).
  for (const [re, category] of [[/open house/i, 'open_house'], [/for sale|directional/i, 'for_sale']] as const) {
    await Package.updateMany({ category: { $exists: false }, title: re }, { $set: { category } });
  }
  await Package.updateMany({ category: { $exists: false } }, { $set: { category: 'media' } });

  // Reschedule reasons (cancellation reasons already exist).
  await AppSetting.updateOne(
    { key: 'schedules_reschedule_reasons' },
    { $setOnInsert: { key: 'schedules_reschedule_reasons', updatedBy: 'seed', value: { addOtherReason: true, reasons: ['Seller is not ready', 'Weather conditions', 'Access to the property changed', 'Listing photos rescheduled'].map((text, i) => ({ id: `rr-${i + 1}`, text, active: true })) } } },
    { upsert: true }
  );

  // Favorite sign layouts for two agents, built from real inventory items.
  const pickItem = async (re: RegExp) => Inventory.findOne({ itemType: re, ownerType: 'Sign company', available: { $gt: 0 } }).lean();
  const [post, rider, panel, lockbox] = await Promise.all([pickItem(/sign post/i), pickItem(/^rider$/i), pickItem(/main panel/i), pickItem(/lockbox/i)]);
  const ref = (d: any, extra: Record<string, any> = {}) =>
    d ? { id: String(d._id), itemId: d.itemId || '', name: d.product, itemType: d.itemType, size: d.size, imageUrl: d.imageUrl || '', ownerName: d.owner, ownerType: d.ownerType, isRental: d.ownerType === 'Sign company', postType: d.postType || '', unitPrice: parseFloat(String(d.unitPrice).replace(/[^0-9.]/g, '')) || 0, rentalPrice: parseFloat(String(d.rentalPrice).replace(/[^0-9.]/g, '')) || 0, installPrice: parseFloat(String(d.installPrice).replace(/[^0-9.]/g, '')) || 0, fee: parseFloat(String(d.rentalPrice || d.unitPrice).replace(/[^0-9.]/g, '')) || 0, ...extra } : null;
  if (post && panel) {
    const layouts = [
      { name: 'Standard listing', propertyType: 'Single Family', isDefault: true, layout: { posts: [ref(post, { qty: 1 })], topRider1: ref(rider), topRider2: null, mainPanel: ref(panel), bottomRider: null, lockbox: ref(lockbox), propertyType: 'Single Family' } },
      { name: 'Condo with rider', propertyType: 'Condo', isDefault: false, layout: { posts: [ref(post, { qty: 1 })], topRider1: ref(rider), topRider2: null, mainPanel: ref(panel), bottomRider: null, lockbox: null, propertyType: 'Condo' } },
    ];
    for (const agent of people.agents.slice(0, 2)) {
      for (const l of layouts) {
        await Favorite.updateOne({ ownerId: agent.id, name: l.name }, { $setOnInsert: { ownerId: agent.id, createdBy: 'seed', name: l.name, propertyType: l.propertyType, isDefault: l.isDefault, layout: l.layout } }, { upsert: true });
      }
    }
  }
}
