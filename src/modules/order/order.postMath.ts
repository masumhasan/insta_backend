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

/** "24\" x 6\"", "24 x 6 in", "24x6" -> "24x6" (how print sizes are matched between inventory and Printing → Size). */
export const normalizeSize = (s: unknown) => String(s ?? '').toLowerCase().replace(/["'\s]/g, '').replace(/inches|inch|in/g, '');

type PricedName = { name: string; price: number; category?: string };

/**
 * Print price of one custom piece, same rule as the order forms: Printing → Size price (a rider size for riders,
 * a sign size for panels, else any size with that name) + Material price + Option price.
 */
export function customPrintPrice(
  catalog: { sizes: PricedName[]; materials: PricedName[] },
  pick: { size?: string; material?: string; optionPrice?: number; rider: boolean },
) {
  const n = normalizeSize(pick.size);
  const sameKind = (z: PricedName) => /rider/i.test(String(z.category || '')) === pick.rider;
  const size = n ? catalog.sizes.find((z) => sameKind(z) && normalizeSize(z.name) === n) || catalog.sizes.find((z) => normalizeSize(z.name) === n) : undefined;
  const mat = catalog.materials.find((m) => m.name.trim().toLowerCase() === String(pick.material || '').trim().toLowerCase());
  return round2(moneyOf(size?.price) + moneyOf(mat?.price) + moneyOf(pick.optionPrice));
}
