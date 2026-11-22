/** Pure post-setup maths (no database), shared by the order pricing and `scripts/testPricing.ts`. */

export const moneyOf = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const round2 = (n: number) => Number(n.toFixed(2));

/** Same rule as the order forms: sign-company rentals cost their Rental Price, own items their Unit Price, plus Install Price. */
export function itemFeeOf(item: any): number {
  const rental = (item?.ownerType || 'Sign company') === 'Sign company' && !item?.assignedAgentId;
  return round2((rental ? moneyOf(item?.rentalPrice) : moneyOf(item?.unitPrice)) + moneyOf(item?.installPrice));
}

/** One post setup = the post's install fee + the fee of every item mounted on it. */
export function setupTotal(installFee: number, slotPrices: number[]) {
  const itemsFee = round2(slotPrices.reduce((s, p) => s + Math.max(0, p || 0), 0));
  return { itemsFee, total: round2(Math.max(0, installFee) + itemsFee) };
}
