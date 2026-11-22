import Stripe from 'stripe';
import { config } from '../../config/env';
import { AppError } from '../../utils/apiError';

let client: Stripe | null = null;

/** True when STRIPE_SECRET_KEY is set. The server boots without it; payment routes then answer 503. */
export const isStripeConfigured = (): boolean => !!config.stripe.secretKey;

/** Lazily builds the Stripe client, or throws 503 "Payments not configured". */
export const getStripe = (): Stripe => {
  if (!isStripeConfigured()) throw new AppError('Payments not configured. Set STRIPE_SECRET_KEY on the server.', 503);
  if (!client) client = new Stripe(config.stripe.secretKey, { maxNetworkRetries: 1, appInfo: { name: 'Instapost' } });
  return client;
};

export const isStripeError = (err: unknown): err is { type: string; code?: string; message: string; decline_code?: string } =>
  !!err && typeof err === 'object' && typeof (err as any).type === 'string' && String((err as any).type).startsWith('Stripe');
