import { User } from '../auth/user.model';
import { AppError } from '../../utils/apiError';
import { isStaff } from '../../middlewares/roleGuard.middleware';
import { config } from '../../config/env';
import { getStripe, isStripeError } from './stripe.client';

export interface SavedCardDto {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holder: string;
  isDefault: boolean;
}

const isObjectId = (v: string) => /^[0-9a-fA-F]{24}$/.test(v);

/**
 * Whose cards a request works on. Everyone works on their own cards; staff may name another user (`userId`)
 * only for reading their cards (see the routes: adding, removing and default changes are self-service).
 */
export const resolveCardOwner = (currentUser: any, userId?: unknown): string => {
  const selfId = String(currentUser?._id || '');
  const target = typeof userId === 'string' ? userId.trim() : '';
  if (!target || target === selfId) return selfId;
  if (!isStaff(currentUser)) throw new AppError('You can only use your own saved cards.', 403);
  if (!isObjectId(target)) throw new AppError('Invalid user id.', 400);
  return target;
};

const loadUser = async (userId: string) => {
  if (!isObjectId(userId)) throw new AppError('Invalid user id.', 400);
  const user = await User.findById(userId).select('+stripeCustomerId name email');
  if (!user) throw new AppError('User not found.', 404);
  return user;
};

/** The user's Stripe customer id. With `create`, makes the customer the first time (race-safe). */
export const getCustomerId = async (userId: string, create = false): Promise<string | null> => {
  const user = await loadUser(userId);
  if (user.stripeCustomerId) {
    if (!create) return user.stripeCustomerId;
    // Verify it still exists (e.g. the keys were switched to another Stripe account).
    const existing = await getStripe().customers.retrieve(user.stripeCustomerId).catch((err) => {
      if (isStripeError(err) && err.code === 'resource_missing') return null;
      throw err;
    });
    if (existing && !(existing as any).deleted) return user.stripeCustomerId;
    await User.updateOne({ _id: userId }, { $set: { stripeCustomerId: '' } });
  }
  if (!create) return null;
  const customer = await getStripe().customers.create({
    name: user.name,
    email: user.email,
    metadata: { userId },
  });
  const updated = await User.findOneAndUpdate(
    { _id: userId, $or: [{ stripeCustomerId: '' }, { stripeCustomerId: { $exists: false } }] },
    { $set: { stripeCustomerId: customer.id } },
    { new: true }
  ).select('+stripeCustomerId');
  if (updated) return customer.id;
  // Another request created one first: keep theirs and drop ours.
  await getStripe().customers.del(customer.id).catch(() => undefined);
  return (await loadUser(userId)).stripeCustomerId || null;
};

export const listCards = async (customerId: string | null): Promise<SavedCardDto[]> => {
  if (!customerId) return [];
  const stripe = getStripe();
  try {
    const [customer, methods] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 50 }),
    ]);
    if ((customer as any).deleted) return [];
    const def = (customer as any).invoice_settings?.default_payment_method;
    const defaultId = typeof def === 'string' ? def : def?.id || '';
    const cards = methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || 'card',
      last4: pm.card?.last4 || '',
      expMonth: pm.card?.exp_month || 0,
      expYear: pm.card?.exp_year || 0,
      holder: pm.billing_details?.name || '',
      isDefault: pm.id === defaultId,
    }));
    return cards.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  } catch (err) {
    if (isStripeError(err) && err.code === 'resource_missing') return [];
    throw err;
  }
};

/** Throws 404 unless the payment method is a card attached to this customer. */
export const assertOwnedCard = async (customerId: string, paymentMethodId: string) => {
  if (!/^pm_[A-Za-z0-9_]+$/.test(String(paymentMethodId || ''))) throw new AppError('Choose a saved card.', 400);
  const pm = await getStripe().paymentMethods.retrieve(paymentMethodId).catch(() => null);
  const owner = typeof pm?.customer === 'string' ? pm.customer : pm?.customer?.id;
  if (!pm || owner !== customerId) throw new AppError('Card not found on this account.', 404);
  return pm;
};

export const createSetupIntent = async (userId: string) => {
  const customerId = await getCustomerId(userId, true);
  const intent = await getStripe().setupIntents.create({
    customer: customerId!,
    usage: 'off_session',
    allowed_payment_method_types: ['card'],
    metadata: { userId },
  });
  return { clientSecret: intent.client_secret, publishableKey: config.stripe.publishableKey };
};

export const setDefaultCard = async (userId: string, paymentMethodId: string) => {
  const customerId = await getCustomerId(userId);
  if (!customerId) throw new AppError('No saved cards on this account.', 404);
  await assertOwnedCard(customerId, paymentMethodId);
  await getStripe().customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  return listCards(customerId);
};

export const removeCard = async (userId: string, paymentMethodId: string) => {
  const customerId = await getCustomerId(userId);
  if (!customerId) throw new AppError('No saved cards on this account.', 404);
  await assertOwnedCard(customerId, paymentMethodId);
  await getStripe().paymentMethods.detach(paymentMethodId);
  return listCards(customerId);
};
