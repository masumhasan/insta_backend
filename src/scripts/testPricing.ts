// Run: npx ts-node src/scripts/testPricing.ts   (offline, no database)
import assert from 'node:assert/strict';
import { computeTotals, DEFAULT_PRICING } from '../modules/order/order.pricing';

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

console.log('pricing tests passed');
