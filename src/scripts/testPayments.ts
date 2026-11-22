// Run: npx ts-node src/scripts/testPayments.ts
// End-to-end check of Stripe card charging in TEST mode (refuses to run with a live key).
// Creates a temporary "guardtest" agent + On Hold order, saves Stripe test cards, charges, and checks that a second
// charge is refused and that a decline is recorded. Everything it creates (DB rows and the Stripe customer) is removed.
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { config } from '../config/env';
import { User } from '../modules/auth/user.model';
import { Order } from '../modules/order/order.model';
import { Notification } from '../modules/notification/notification.model';
import { getStripe } from '../modules/payment/stripe.client';
import { getCustomerId, listCards, setDefaultCard } from '../modules/payment/card.service';
import { cardsForOrder, chargeOrder } from '../modules/payment/charge.service';

const results: string[] = [];
const check = (ok: boolean, label: string) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
const expectError = async (fn: () => Promise<unknown>, status: number, label: string) => {
  try {
    await fn();
    check(false, `${label} (no error)`);
  } catch (e: any) {
    check(e?.statusCode === status, `${label} -> ${e?.statusCode} ${e?.message}`);
  }
};

async function main() {
  if (!config.stripe.secretKey.startsWith('sk_test_')) throw new Error('STRIPE_SECRET_KEY must be a test key (sk_test_...).');
  await connectDatabase();
  const stripe = getStripe();
  const stamp = Date.now();
  const agent: any = await User.create({ name: 'guardtest pay', email: `guardtest+pay${stamp}@example.com`, password: `Guard#${stamp}`, role: 'Agent' });
  const staff = { _id: new mongoose.Types.ObjectId(), role: 'Sign company', name: 'guardtest staff' };
  const mkOrder = (n: string) =>
    Order.create({ orderNumber: `GUARDTEST-PAY-${stamp}-${n}`, type: 'Installation', address: '1 Main St, Dallas, TX', agent: agent.name, agentId: String(agent._id), status: 'On Hold', paymentStatus: 'Unpaid', totalAmount: 12.34, price: '$12.34' });
  const order = await mkOrder('A');
  const declineOrder = await mkOrder('B');
  const lead: any = await User.create({ name: 'guardtest lead', email: `guardtest+lead${stamp}@example.com`, password: `Guard#${stamp}`, role: 'Team Lead' });
  const leadOrder = await Order.create({ orderNumber: `GUARDTEST-PAY-${stamp}-C`, type: 'Installation', address: '1 Main St, Dallas, TX', agent: agent.name, agentId: String(agent._id), status: 'Pending Up', paymentStatus: 'Unpaid', totalAmount: 20, price: '$20.00', payment: { payerId: String(lead._id) } });
  let customerId: string | null = null;
  let leadCustomerId: string | null = null;
  try {
    customerId = await getCustomerId(String(agent._id), true);
    const visa = await stripe.paymentMethods.attach('pm_card_visa', { customer: customerId! });
    const sca = await stripe.paymentMethods.attach('pm_card_authenticationRequired', { customer: customerId! });
    await setDefaultCard(String(agent._id), visa.id);
    const cards = await listCards(customerId);
    check(cards.length === 2 && cards[0].id === visa.id && cards[0].isDefault, `cards listed, default first (${cards.map((c) => `${c.brand} ${c.last4}${c.isDefault ? ' default' : ''}`).join(', ')})`);

    const forOrder = await cardsForOrder(order.orderNumber, staff);
    check(forOrder.cards.length === 2 && forOrder.amount === 12.34, 'staff sees the customer cards and the server amount');

    const paid = await chargeOrder(order.orderNumber, visa.id, staff);
    check(paid.paymentStatus === 'Paid' && !/on hold/i.test(paid.status), `charge succeeds and releases the hold (status ${paid.status})`);
    const saved: any = await Order.findById(order._id).lean();
    const pi = await stripe.paymentIntents.retrieve(saved.payment.intentId);
    check(pi.amount === 1234 && pi.status === 'succeeded', 'Stripe charged the server-side total (1234 cents)');
    await expectError(() => chargeOrder(order.orderNumber, visa.id, staff), 409, 'second charge of a paid order is refused');

    await expectError(() => chargeOrder(declineOrder.orderNumber, sca.id, agent), 402, 'off-session charge needing authentication is declined');
    const failed: any = await Order.findById(declineOrder._id).lean();
    check(failed.paymentStatus === 'Failed' && failed.payment.attempts === 1 && !!failed.payment.lastError?.message, 'decline recorded on the order (Failed, attempt 1)');
    const retry = await chargeOrder(declineOrder.orderNumber, visa.id, agent);
    check(retry.paymentStatus === 'Paid', 'customer retries the failed order with another of their cards');

    await expectError(() => chargeOrder(declineOrder.orderNumber, 'pm_card_visa', { ...staff, role: 'Agent', _id: new mongoose.Types.ObjectId() }), 404, "another agent cannot charge this order");

    // A Team Lead's order for an agent: the lead (payer) can charge it, and staff see the lead's cards.
    leadCustomerId = await getCustomerId(String(lead._id), true);
    const leadVisa = await stripe.paymentMethods.attach('pm_card_mastercard', { customer: leadCustomerId! });
    const staffView = await cardsForOrder(leadOrder.orderNumber, staff);
    check(staffView.cards.length === 1 && staffView.cards[0].last4 === '4444' && staffView.customerName === 'guardtest lead', 'staff see the paying team lead cards on an order for an agent');
    const leadPaid = await chargeOrder(leadOrder.orderNumber, leadVisa.id, lead);
    check(leadPaid.paymentStatus === 'Paid', 'team lead charges the order they placed for an agent');
  } finally {
    if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
    if (leadCustomerId) await stripe.customers.del(leadCustomerId).catch(() => undefined);
    await Order.deleteMany({ _id: { $in: [order._id, declineOrder._id, leadOrder._id] } });
    await Notification.deleteMany({ referenceId: { $in: [order.orderNumber, declineOrder.orderNumber, leadOrder.orderNumber] } });
    await User.deleteMany({ _id: { $in: [agent._id, lead._id] } });
  }
  console.log(results.join('\n'));
  const failedCount = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failedCount}/${results.length} checks passed`);
  await mongoose.disconnect();
  process.exit(failedCount ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
