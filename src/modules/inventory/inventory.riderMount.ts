import { AppError } from '../../utils/apiError';

/**
 * How a rider is mounted decides which visualizer slots it can go in (slot keys as in order.postSetups.ts):
 * - No Grommets          → Top Rider 1 only            (top1)
 * - Top Grommets Only    → Bottom Rider only           (bottom)
 * - Top/Bottom Grommets  → Top Rider 2 or Bottom Rider (top2, bottom)
 * Riders without a mount type saved are not restricted. Mirrored in the portals' `helpers/riderMount.ts`.
 */
export const RIDER_MOUNT_TYPES = ['No Grommets', 'Top Grommets Only', 'Top/Bottom Grommets'] as const;
export type RiderMountType = (typeof RIDER_MOUNT_TYPES)[number];
export type RiderSlotKey = 'top1' | 'main' | 'bottom' | 'top2';

export const RIDER_MOUNT_SLOTS: Record<RiderMountType, RiderSlotKey[]> = {
  'No Grommets': ['top1'],
  'Top Grommets Only': ['bottom'],
  'Top/Bottom Grommets': ['top2', 'bottom'],
};

const ALL_RIDER_SLOTS: RiderSlotKey[] = ['top1', 'bottom', 'top2'];

const matchMount = (v: unknown): RiderMountType | undefined => {
  const s = String(v ?? '').trim().toLowerCase();
  return RIDER_MOUNT_TYPES.find((m) => m.toLowerCase() === s);
};

/** Slots a rider with this mount type may fill; an empty or unknown value allows every rider slot. */
export function riderSlotsFor(mountType: unknown): RiderSlotKey[] {
  const hit = matchMount(mountType);
  return hit ? RIDER_MOUNT_SLOTS[hit] : ALL_RIDER_SLOTS;
}

export const isRider = (itemType: unknown) => /^rider$/i.test(String(itemType ?? '').trim());

/**
 * For riders, `mountType` must be one of RIDER_MOUNT_TYPES (or '' to clear it); other item types keep free text
 * (e.g. a post's "Top Mount"). An older rider's unchanged free-text value (`current`) is let through so other
 * edits still save. Returns the payload with the cleaned value.
 */
export function cleanRiderMount<T extends Record<string, any>>(payload: T, itemType: unknown, current = ''): T {
  if (!isRider(itemType) || payload?.mountType === undefined) return payload;
  const raw = String(payload.mountType ?? '').trim();
  if (!raw) return { ...payload, mountType: '' };
  if (current && raw === String(current).trim()) return payload;
  const hit = matchMount(raw);
  if (!hit) throw new AppError(`Rider mount type must be one of: ${RIDER_MOUNT_TYPES.join(', ')}.`, 400);
  return { ...payload, mountType: hit };
}
