import { Order } from '../order/order.model';
import { isOrderVisibleToUser } from '../order/order.service';
import { ClientInvoice } from '../invoice/invoice.model';
import { User } from '../auth/user.model';
import { NotificationService } from '../notification/notification.service';
import { isStaff } from '../../middlewares/roleGuard.middleware';
import { AppError } from '../../utils/apiError';
import { getStripe, isStripeError } from './stripe.client';
import { assertOwnedCard, getCustomerId, listCards } from './card.service';

/** A charge that has been running longer than this is treated as abandoned (crashed request) and may be retried. */
const LOCK_STALE_MS = 2 * 60 * 1000;
const DONE_STATUSES = ['Paid', 'Refunded', 'Partially Refunded'];
const OUTSTANDING = ['Unpaid', 'Failed', 'Pending'];

const findOrder = async (ref: string) => {
  const order = await Order.findOne({ $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(ref) ? ref : null }, { orderNumber: ref }] });
  if (!order) throw new AppError('Order not found.', 404);
  return order;
};

/** Orders the caller can see, plus orders they placed and pay for (a Team Lead's order for an agent). */
const loadVisibleOrder = async (ref: string, currentUser: any) => {
  const order = await findOrder(ref);
  const isPayer = !!order.payment?.payerId && order.payment.payerId === String(currentUser?._id || '');
  if (!isPayer && !(await isOrderVisibleToUser(order, currentUser))) throw new AppError('Order not found.', 404);
  return order;
};

/** Staff charge the order's customer (whoever placed it, else the order's agent); customers pay with their own cards. */
const payerIdFor = (order: any, currentUser: any): string => {
  const id = isStaff(currentUser) ? String(order.payment?.payerId || order.agentId || '') : String(currentUser?._id || '');
  if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new AppError('This order has no customer account to charge.', 400);
  return id;
};

const orderAmountCents = (order: any): number => {
  const total = Number(order.totalAmount) || Number(String(order.price || '').replace(/[^0-9.-]/g, '')) || 0;
  return Math.round(total * 100);
};

type CardLabel = { brand: string; last4: string };

const syncInvoice = (orderNumber: string, set: Record<string, any>) =>
  ClientInvoice.updateOne({ orderId: orderNumber }, { $set: set }).catch(() => undefined);

/** Cards that can pay this order (the customer's cards for staff, the caller's own cards otherwise). */
export const cardsForOrder = async (ref: string, currentUser: any) => {
  const order = await loadVisibleOrder(ref, currentUser);
  const payerId = payerIdFor(order, currentUser);
  const cards = await listCards(await getCustomerId(payerId));
  const payerName =
    payerId === String(order.agentId || '') ? order.agent : (await User.findById(payerId).select('name').lean())?.name || order.agent;
  return {
    orderId: order.orderNumber,
    customerName: payerName,
    amount: orderAmountCents(order) / 100,
    paymentStatus: order.paymentStatus,
    lastError: order.payment?.lastError?.message || '',
    canManageCards: payerId === String(currentUser?._id || ''),
    cards,
  };
};

/** Records a definite failure: the next attempt gets a new idempotency key. Declines mark the order/invoice Failed. */
const recordFailure = async (order: any, attempt: number, message: string, code: string, declined: boolean, card: CardLabel) => {
  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        'payment.lockedAt': null,
        'payment.attempts': attempt + 1,
        'payment.lastError': { message, code, at: new Date() },
        ...(declined ? { paymentStatus: 'Failed' } : {}),
      },
    }
  );
  if (!declined) return;
  await syncInvoice(order.orderNumber, { payment: 'Failed' });
  await NotificationService.safeNotify({
    recipientRole: 'Sign company',
    title: `Payment Failed (${order.orderNumber})`,
    message: `${card.brand} •••• ${card.last4}: ${message}`,
    type: 'order',
    referenceId: order.orderNumber,
  });
};

/**
 * Charges an order's server-side total to a saved card (off-session PaymentIntent).
 * Double charges are blocked by (1) refusing paid orders, (2) an atomic per-order lock and
 * (3) a Stripe idempotency key per attempt: the attempt number only grows after a definite decline.
 */
export const chargeOrder = async (ref: string, paymentMethodId: string, currentUser: any) => {
  const stripe = getStripe();
  const order = await loadVisibleOrder(ref, currentUser);
  if (order.paymentStatus === 'Paid') throw new AppError('This order is already paid.', 409);
  if (/cancel/i.test(order.status)) throw new AppError('Cancelled orders cannot be charged.', 400);
  const onHold = /^(on hold|waiting on payment)$/i.test(order.status);
  if (!OUTSTANDING.includes(String(order.paymentStatus || '')) && !onHold) {
    throw new AppError('This order has no outstanding payment to process.', 400);
  }
  const amount = orderAmountCents(order);
  if (amount < 50) throw new AppError('The order total must be at least $0.50 to charge a card.', 400);

  const customerId = await getCustomerId(payerIdFor(order, currentUser));
  if (!customerId) throw new AppError('There are no saved cards on this account.', 400);
  const pm = await assertOwnedCard(customerId, paymentMethodId);
  const card: CardLabel = { brand: pm.card?.brand || 'card', last4: pm.card?.last4 || '' };

  const now = new Date();
  const locked = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: { $nin: DONE_STATUSES },
      $or: [{ 'payment.lockedAt': null }, { 'payment.lockedAt': { $lt: new Date(now.getTime() - LOCK_STALE_MS) } }],
    },
    { $set: { 'payment.lockedAt': now } },
    { new: true }
  );
  if (!locked) throw new AppError('A payment for this order is already in progress or it is already paid.', 409);

  const attempt = Number(locked.payment?.attempts || 0);
  const by = currentUser?.name || 'Staff';
  const unlock = () => Order.updateOne({ _id: order._id }, { $set: { 'payment.lockedAt': null } });

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Instapost order ${order.orderNumber}`,
        metadata: { orderId: String(order._id), orderNumber: order.orderNumber, chargedBy: by },
      },
      { idempotencyKey: `order-${order._id}-charge-${attempt}` }
    );
  } catch (err: any) {
    if (isStripeError(err) && ['StripeCardError', 'StripeInvalidRequestError'].includes(err.type)) {
      const declined = err.type === 'StripeCardError';
      const message = String(err.message || '').replace(/^\[req_[^\]]*\]\s*/, '') || 'The card was declined.';
      await recordFailure(order, attempt, message, err.decline_code || err.code || '', declined, card);
      throw new AppError(declined ? `Payment declined: ${message}` : message, declined ? 402 : 400);
    }
    // Unknown outcome (network, outage, key reused with other details): keep the attempt number so a retry reuses the key.
    await unlock();
    const reuse = isStripeError(err) && err.type === 'StripeIdempotencyError';
    throw new AppError(
      reuse
        ? 'An earlier attempt for this order used different card details. Retry with the same card, or check the Stripe dashboard.'
        : 'The payment provider could not be reached. Try again in a moment; a retry will not charge twice.',
      reuse ? 409 : 502
    );
  }

  if (intent.status !== 'succeeded') {
    const message = `The payment was not completed (${intent.status.replace(/_/g, ' ')}).`;
    await recordFailure(order, attempt, message, intent.status, true, card);
    throw new AppError(message, 402);
  }

  try {
    const fresh = await findOrder(String(order._id));
    fresh.paymentStatus = 'Paid'; // the Order pre-save hook releases an On Hold order into the queue
    fresh.paymentMethod = 'credit_card';
    fresh.payment = { ...(fresh.payment || {}), attempts: attempt, intentId: intent.id, paidAt: new Date(), card, lastError: undefined, lockedAt: null };
    fresh.markModified('payment');
    await fresh.save();
    await syncInvoice(fresh.orderNumber, {
      payment: 'Paid',
      paymentMethod: 'credit_card',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentReference: intent.id,
    });
    await NotificationService.safeNotify({
      recipientRole: 'Sign company',
      title: `Payment Processed (${fresh.orderNumber})`,
      message: `$${(amount / 100).toFixed(2)} charged to ${card.brand} •••• ${card.last4} by ${by}. Status: ${fresh.status}.`,
      type: 'order',
      referenceId: fresh.orderNumber,
    });
    return { id: fresh.orderNumber, _id: String(fresh._id), paymentStatus: fresh.paymentStatus, status: fresh.status, amount: amount / 100, card };
  } catch {
    // The card WAS charged. A retry reuses the same idempotency key, so Stripe returns this charge and the order is marked paid.
    await unlock().catch(() => undefined);
    throw new AppError(`The card was charged (${intent.id}) but the order could not be updated. Retry to finish; it will not charge again.`, 500);
  }
};
