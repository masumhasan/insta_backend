// Run: npx ts-node src/scripts/testPricing.ts   (offline, no database)
import assert from 'node:assert/strict';
import { computeTotals, DEFAULT_PRICING } from '../modules/order/order.pricing';
import { customPrintPrice, itemFeeOf, normalizeSize, setupTotal } from '../modules/order/order.postMath';
import { computeSlots, toMinutes } from '../modules/ops/ops.availability';

const cfg = DEFAULT_PRICING; // rush 25, card 3%, tax 8.25%

// Card order, no rush, no discount: taxable 100 -> fee 3.00, tax 8.25, total 111.25
assert.deepEqual(computeTotals({ subtotal: 100, rush: false, creditCard: true, discountAmount: 0 }, cfg), {
  subtotal: 100, discountAmount: 0, rushFee: 0, creditCardFee: 3, taxAmount: 8.25, totalAmount: 111.25,
});

// Invoice order has no card fee; rush adds the rush fee before tax: taxable 125 -> tax 10.31
const inv = computeTotals({ subtotal: 100, rush: true, creditCard: false, discountAmount: 0 }, cfg);
assert.equal(inv.rushFee, 25);
assert.equal(inv.creditCardFee, 0);
assert.equal(inv.taxAmount, 10.31);
assert.equal(inv.totalAmount, 135.31);

// A discount can never push the total below zero or exceed the order value.
const free = computeTotals({ subtotal: 20, rush: false, creditCard: true, discountAmount: 500 }, cfg);
assert.equal(free.discountAmount, 20);
assert.equal(free.totalAmount, 0);

// Negative subtotal is clamped to zero (the route rejects it earlier with a 400).
assert.equal(computeTotals({ subtotal: -5, rush: false, creditCard: true, discountAmount: 0 }, cfg).totalAmount, 0);

// Rates come from the config, not from constants in the maths.
assert.equal(computeTotals({ subtotal: 100, rush: false, creditCard: false, discountAmount: 0 }, { rushFee: 0, creditCardFeePct: 0, taxRatePct: 10 }).totalAmount, 110);

// Post setups (New Sign Install, 1–3 posts): each post = its own install fee + the fee of each mounted item.
assert.deepEqual(setupTotal(45, [10, 5, 5]), { itemsFee: 20, total: 65 });
assert.deepEqual(setupTotal(40, []), { itemsFee: 0, total: 40 });
assert.equal(setupTotal(45, [-3, 2.25]).itemsFee, 2.25);
// Item fee: sign-company rental = Rental Price + Install Price; an agent's own item = Unit Price + Install Price.
assert.equal(itemFeeOf({ ownerType: 'Sign company', rentalPrice: '$10.00', unitPrice: '$55.00', installPrice: '' }), 10);
assert.equal(itemFeeOf({ ownerType: 'Agent', assignedAgentId: 'x', rentalPrice: '$10.00', unitPrice: '$60.00', installPrice: '5' }), 65);
assert.equal(itemFeeOf({ ownerType: 'Sign company', rentalPrice: 'n/a' }), 0);
// Two posts at one address are two install fees.
const twoPosts = [setupTotal(45, [10]), setupTotal(40, [10, 5])].reduce((s, x) => s + x.total, 0);
assert.equal(twoPosts, 110);


// Media appointment slots: every 15 minutes, only when the whole shoot ends by close, never over a booked shoot.
const day = { open: toMinutes('11:00 AM - CDT')!, close: toMinutes('6:00 PM')!, capacity: 1 };
const openDay = computeSlots({ ...day, duration: 90, busy: [] });
assert.equal(openDay[0], '11:00 AM');
assert.equal(openDay[openDay.length - 1], '4:30 PM'); // 4:30 + 90 min = 6:00 PM
const booked = computeSlots({ ...day, duration: 60, busy: [{ start: toMinutes('1:00 PM')!, end: toMinutes('2:30 PM')! }] });
assert.ok(booked.includes('12:00 PM') && booked.includes('2:30 PM'));
assert.ok(!booked.includes('12:15 PM') && !booked.includes('2:15 PM') && !booked.includes('1:00 PM'));
// Two photographers can take overlapping shoots; a third overlapping one is refused.
const twoTeam = computeSlots({ ...day, capacity: 2, duration: 60, busy: [{ start: 780, end: 840 }, { start: 780, end: 840 }] });
assert.ok(!twoTeam.includes('1:00 PM') && computeSlots({ ...day, capacity: 2, duration: 60, busy: [{ start: 780, end: 840 }] }).includes('1:00 PM'));
// Today: nothing at or before the current time, aligned to the 15-minute grid.
assert.equal(computeSlots({ ...day, duration: 30, busy: [], notBefore: toMinutes('1:07 PM')! })[0], '1:15 PM');
assert.deepEqual(computeSlots({ ...day, duration: 480, busy: [] }), []);
// Custom (designed / uploaded) pieces: Printing size (rider sizes for riders) + material + option.
const printCat = {
  sizes: [{ name: '24" x 6"', price: 20, category: 'Rider' }, { name: '24x6', price: 50, category: 'Yard Sign' }, { name: '18x24', price: 30, category: 'Yard Sign' }],
  materials: [{ name: 'Reflective ACM', price: 6.5 }],
};
assert.equal(normalizeSize('24 in x 6 in'), '24x6');
assert.equal(customPrintPrice(printCat, { size: '24x6', material: 'reflective acm', optionPrice: 2, rider: true }), 28.5);
assert.equal(customPrintPrice(printCat, { size: '24x6', material: '', rider: false }), 50);
assert.equal(customPrintPrice(printCat, { size: '18 x 24', material: 'Unknown', rider: true }), 30);
assert.equal(customPrintPrice(printCat, { size: '', material: '', rider: true }), 0);
console.log('pricing tests passed');
