import { AppSetting } from '../ops/ops.model';
import { Coupon } from '../catalog/coupon.model';
import { AppError } from '../../utils/apiError';

/** Business rates. Stored in the `pricing` app setting (editable by staff); these are only the starting values. */
export type PricingConfig = { rushFee: number; creditCardFeePct: number; taxRatePct: number };
export const DEFAULT_PRICING: PricingConfig = { rushFee: 25, creditCardFeePct: 3, taxRatePct: 8.25 };

export async function getPricingConfig(): Promise<PricingConfig> {
  const doc: any = await AppSetting.findOne({ key: 'pricing' }).lean();
  const v = doc?.value || {};
  const num = (x: unknown, d: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : d);
  return {
    rushFee: num(v.rushFee, DEFAULT_PRICING.rushFee),
    creditCardFeePct: num(v.creditCardFeePct, DEFAULT_PRICING.creditCardFeePct),
    taxRatePct: num(v.taxRatePct, DEFAULT_PRICING.taxRatePct),
  };
}

const money = (n: number) => Number(n.toFixed(2));

export type OrderTotals = {
  subtotal: number;
  discountAmount: number;
  rushFee: number;
  creditCardFee: number;
  taxAmount: number;
  totalAmount: number;
};

/** Pure maths so it can be tested without a database. Mirrors the checkout page: fees and tax apply to (subtotal + rush - discount). */
export function computeTotals(
  input: { subtotal: number; rush: boolean; creditCard: boolean; discountAmount: number },
  cfg: PricingConfig
): OrderTotals {
  const subtotal = money(Math.max(0, input.subtotal));
  const rushFee = input.rush ? cfg.rushFee : 0;
  const discountAmount = money(Math.min(Math.max(0, input.discountAmount), subtotal + rushFee));
  const taxable = Math.max(0, subtotal + rushFee - discountAmount);
  const creditCardFee = input.creditCard ? money((taxable * cfg.creditCardFeePct) / 100) : 0;
  const taxAmount = money((taxable * cfg.taxRatePct) / 100);
  return { subtotal, discountAmount, rushFee, creditCardFee, taxAmount, totalAmount: money(taxable + creditCardFee + taxAmount) };
}

/** Looks the coupon up on the server. An unknown or expired code is an error, never a silent discount. */
export async function couponDiscount(code: unknown, subtotal: number): Promise<number> {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return 0;
  const coupon = await Coupon.findOne({ code: clean }).lean();
  if (!coupon || coupon.status !== 'active') throw new AppError('This coupon code is not valid.', 400);
  if (coupon.validUntil && new Date(coupon.validUntil).getTime() < Date.now()) throw new AppError('This coupon has expired.', 400);
  if ((coupon.usageLimit ?? 0) > 0 && (coupon.usageCount ?? 0) >= (coupon.usageLimit ?? 0)) throw new AppError('This coupon has been fully used.', 400);
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) throw new AppError(`This coupon needs an order of at least $${coupon.minOrderAmount}.`, 400);
  const value = Number(coupon.discountValue) || 0;
  return coupon.discountType === 'percentage' ? money((subtotal * value) / 100) : value;
}

/** Totals for a customer order (agent, assistant, team lead, warehouse). Staff may still enter custom totals. */
export async function priceCustomerOrder(payload: any, paymentMethod: string): Promise<OrderTotals> {
  const subtotal = Number(payload.subtotal);
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new AppError('Order subtotal is required.', 400);
  const cfg = await getPricingConfig();
  const discountAmount = await couponDiscount(payload.couponCode, subtotal);
  return computeTotals(
    {
      subtotal,
      rush: String(payload.dueDate || '').toLowerCase() === 'rush' || Number(payload.rushFee) > 0,
      creditCard: paymentMethod === 'credit_card',
      discountAmount,
    },
    cfg
  );
}
