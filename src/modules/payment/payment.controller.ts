import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/apiResponse';
import { config } from '../../config/env';
import { getStripe, isStripeConfigured } from './stripe.client';
import { createSetupIntent, getCustomerId, listCards, removeCard, resolveCardOwner, setDefaultCard } from './card.service';
import { cardsForOrder, chargeOrder } from './charge.service';

const user = (req: Request) => (req as any).user;

/** Whether card payments are on, and the publishable key the portals can fall back to. */
export const getPaymentConfig = asyncHandler(async (_req: Request, res: Response) => {
  const configured = isStripeConfigured();
  return ApiResponse.success(res, 200, 'Payment configuration', {
    configured,
    publishableKey: configured ? config.stripe.publishableKey : '',
  });
});

export const getCards = asyncHandler(async (req: Request, res: Response) => {
  getStripe();
  const ownerId = resolveCardOwner(user(req), req.query.userId);
  const cards = await listCards(await getCustomerId(ownerId));
  return ApiResponse.success(res, 200, 'Saved cards retrieved', cards);
});

export const postSetupIntent = asyncHandler(async (req: Request, res: Response) => {
  getStripe();
  const data = await createSetupIntent(String(user(req)._id));
  return ApiResponse.success(res, 201, 'Card setup started', data);
});

export const patchDefaultCard = asyncHandler(async (req: Request, res: Response) => {
  getStripe();
  const cards = await setDefaultCard(String(user(req)._id), String(req.params.paymentMethodId));
  return ApiResponse.success(res, 200, 'Default card updated', cards);
});

export const deleteCard = asyncHandler(async (req: Request, res: Response) => {
  getStripe();
  const cards = await removeCard(String(user(req)._id), String(req.params.paymentMethodId));
  return ApiResponse.success(res, 200, 'Card removed', cards);
});

export const getOrderCards = asyncHandler(async (req: Request, res: Response) => {
  getStripe();
  const data = await cardsForOrder(String(req.params.id), user(req));
  return ApiResponse.success(res, 200, 'Cards for order retrieved', data);
});

export const postChargeOrder = asyncHandler(async (req: Request, res: Response) => {
  getStripe();
  const data = await chargeOrder(String(req.params.id), String(req.body?.paymentMethodId || ''), user(req));
  return ApiResponse.success(res, 200, 'Payment processed', data);
});
