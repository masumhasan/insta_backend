// Run: npx ts-node src/scripts/seedScenarios/index.ts            (adds sample data for every scenario; safe to repeat)
//      npx ts-node src/scripts/seedScenarios/index.ts --remove   (takes all of it out again)
// Writes to the database in backend/.env. It never creates users: it reuses the existing accounts.
import mongoose from 'mongoose';
import { config } from '../../config/env';
import { Order } from '../../modules/order/order.model';
import { ClientInvoice, TechnicianInvoice } from '../../modules/invoice/invoice.model';
import { ReturnRecord } from '../../modules/inventory/return.model';
import { Inventory } from '../../modules/inventory/inventory.model';
import { ServiceItem } from '../../modules/catalog/service.model';
import { Coupon } from '../../modules/catalog/coupon.model';
import { Package } from '../../modules/catalog/package.model';
import { Favorite } from '../../modules/favorite/favorite.model';
import { MediaTask, CalendarEvent, MediaDelivery, AppSetting } from '../../modules/ops/ops.model';
import { Notification } from '../../modules/notification/notification.model';
import { TAG, initOrderBase, loadPeople } from './helpers';
import { seedOrders, seedReturns, SCENARIOS } from './orders';
import { seedInventory } from './inventory';
import { seedCatalog, BROKERAGES, COUPON_CODES, PACKAGE_TITLES } from './catalog';
import { seedMedia, seedNotifications, seedTechnicianInvoices, SEED_NOTIFICATION_AUTHOR } from './ops';

async function remove() {
  const orderNumbers = (await Order.find({ 'specifications.seed': TAG }).select('orderNumber').lean()).map((o: any) => o.orderNumber as string);
  const r = {
    orders: (await Order.deleteMany({ 'specifications.seed': TAG })).deletedCount,
    invoices: (await ClientInvoice.deleteMany({ notes: `seed:${TAG}` })).deletedCount,
    technicianInvoices: (await TechnicianInvoice.deleteMany({ invoiceNumber: /^TINV-900\d$/ })).deletedCount,
    returns: (await ReturnRecord.deleteMany({ $or: [{ orderId: { $in: orderNumbers } }, { orderId: '', itemName: 'White Textured Sign Post (7 ft)', inspectionNotes: 'Found bent behind a property; no order linked.' }] })).deletedCount,
    inventory: (await Inventory.deleteMany({ additionalSpecs: `seed:${TAG}` })).deletedCount,
    catalogItems: (await ServiceItem.deleteMany({ 'options.seed': TAG, type: { $in: ['brokerage', 'announcement', 'option'] } })).deletedCount,
    coupons: (await Coupon.deleteMany({ code: { $in: COUPON_CODES }, description: 'Sample promotional coupon' })).deletedCount,
    packages: (await Package.deleteMany({ title: { $in: PACKAGE_TITLES } })).deletedCount,
    favorites: (await Favorite.deleteMany({ createdBy: 'seed' })).deletedCount,
    mediaTasks: (await MediaTask.deleteMany({ tags: 'seed' })).deletedCount,
    deliveries: (await MediaDelivery.deleteMany({ orderNumber: { $in: orderNumbers } })).deletedCount,
    notifications: (await Notification.deleteMany({ createdBy: SEED_NOTIFICATION_AUTHOR })).deletedCount,
    rescheduleReasons: (await AppSetting.deleteMany({ key: 'schedules_reschedule_reasons', updatedBy: 'seed' })).deletedCount,
  };
  // Calendar events carry no tag; the seeded ones are the "Listing shoot" and "Lunch break" entries.
  (r as any).calendar = (await CalendarEvent.deleteMany({ title: /^(Listing shoot — |Lunch break$)/ })).deletedCount;
  console.log('[Seed] removed:', JSON.stringify(r));
}

async function main() {
  await mongoose.connect(config.mongodbUri);
  if (process.argv.includes('--remove')) {
    await remove();
  } else {
    await initOrderBase();
    const people = await loadPeople();
    await seedInventory(people);
    await seedOrders(people);
    await seedReturns(people);
    await seedCatalog(people);
    await seedMedia(people);
    await seedTechnicianInvoices(people);
    await seedNotifications(people);
    console.log(`[Seed] scenarios ready: ${SCENARIOS.length} orders with invoices, inventory, returns, catalog, media, notifications. (${BROKERAGES.length} brokerages)`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
