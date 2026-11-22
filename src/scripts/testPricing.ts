// Run: npx ts-node src/scripts/testPricing.ts   (offline, no database)
import assert from 'node:assert/strict';
import { computeTotals, DEFAULT_PRICING } from '../modules/order/order.pricing';
import { itemFeeOf, setupTotal } from '../modules/order/order.postMath';

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

console.log('pricing tests passed');
