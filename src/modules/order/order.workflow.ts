import { AppError } from '../../utils/apiError';

/**
 * Field workflow for installers and photographers.
 *
 * An order reaches them as "Assigned ..." (set by the sign company or warehouse). From there they can only move it
 * forward through the steps below; everything else (payment, scheduling, cancelling) stays with staff.
 */
export const FIELD_ROLES = ['Installer', 'Photographer'];
export const isFieldUser = (user?: { role?: string }) => !!user?.role && FIELD_ROLES.includes(user.role);

type Table = Record<string, string[]>;

// One-visit jobs: assigned -> completed.
const SINGLE_VISIT: Table = {
  Assigned: ['Completed', 'On Hold', 'Delayed by Weather'],
  'On Hold': ['Assigned'],
  'Delayed by Weather': ['Assigned', 'Completed'],
};
// Directionals and open houses are put up and later taken down.
const PUT_UP_AND_DOWN: Table = {
  Assigned: ['Installed', 'On Hold', 'Delayed by Weather'],
  Installed: ['Removed', 'Completed'],
  Removed: ['Completed'],
  'On Hold': ['Assigned'],
  'Delayed by Weather': ['Assigned'],
};

const TABLES: Record<string, Table> = {
  Installation: { 'Assigned Up': ['Installed', 'On Hold', 'Delayed by Weather'], 'On Hold': ['Assigned Up'], 'Delayed by Weather': ['Assigned Up', 'Installed'] },
  Removal: { 'Assigned Down': ['Removed', 'On Hold', 'Delayed by Weather'], 'On Hold': ['Assigned Down'], 'Delayed by Weather': ['Assigned Down', 'Removed'] },
  'For Sale Directionals': PUT_UP_AND_DOWN,
  'Open House Services': PUT_UP_AND_DOWN,
  'Sign Change': SINGLE_VISIT,
  'Media Services': SINGLE_VISIT,
  'Other Services': SINGLE_VISIT,
  'Sign Printing': { ...SINGLE_VISIT, 'Ready for Install': ['Completed'] },
};

const NEEDS_PROOF_PHOTO = ['Installed', 'Removed', 'Completed'];
const NEEDS_VERIFIED_PULL = ['Installed', 'Completed'];
const NEEDS_REASON = ['On Hold', 'Delayed by Weather'];

/** The statuses this user may move the order to right now (empty for roles that are not field staff). */
/**
 * Queue status of a new or unassigned order, matching the TABLES above: installs go up, removals come down,
 * every other type is a single visit with no direction.
 */
export const pendingStatusFor = (type: string): string =>
  type === 'Installation' ? 'Pending Up' : type === 'Removal' ? 'Pending Down' : 'Pending';

/** Status once a technician is assigned ("Assigned Up" / "Assigned Down" / "Assigned"). */
export const assignedStatusFor = (type: string): string => pendingStatusFor(type).replace('Pending', 'Assigned');

export const nextStatuses = (order: any, user?: { role?: string }): string[] =>
  isFieldUser(user) ? TABLES[order?.type]?.[order?.status] ?? [] : [];

/** Custom-print orders (order.designApproval.ts): approved design -> "In Production" -> "Ready to Install" -> dispatch. */
export const IN_PRODUCTION = 'In Production';
export const READY_TO_INSTALL = 'Ready to Install';

/** Why this order may not be dispatched yet ('' when it may). Only orders carrying `designApproval.required`. */
export function designDispatchBlock(order: any): string {
  const da = order?.designApproval;
  if (!da?.required || da.productionCompletedAt) return '';
  const ref = order.orderNumber ? `Order ${order.orderNumber}` : 'This order';
  if (da.status === 'approved') return `${ref} is still In Production. Mark it Ready to Install before assigning an installer.`;
  if (da.status === 'changes_requested') {
    return `The customer asked for changes to the custom design on ${ref.toLowerCase()}. Upload a new proof and wait for approval before assigning an installer.`;
  }
  return `${ref} is waiting for the customer to approve its custom design. An installer can be assigned once it is approved and marked Ready to Install.`;
}

/** Refuses installer assignment / dispatch while the custom design is unapproved or still in production (409). */
export function assertDispatchAllowed(order: any) {
  const reason = designDispatchBlock(order);
  if (reason) throw new AppError(reason, 409);
}

/** Throws when a field user's status change breaks the workflow. Returns the note to append to the order. */
export function assertFieldStatusChange(order: any, payload: { status?: string; statusNote?: string }): string {
  const next = String(payload.status || '');
  const allowed = TABLES[order.type]?.[order.status] ?? [];
  if (!allowed.includes(next)) {
    throw new AppError(
      allowed.length
        ? `A ${order.type} order that is "${order.status}" can only move to: ${allowed.join(', ')}.`
        : `This ${order.type} order is "${order.status}", so there is nothing for you to change. Contact the sign company.`,
      403
    );
  }
  if (NEEDS_PROOF_PHOTO.includes(next) && !(Array.isArray(order.photos) && order.photos.length > 0)) {
    throw new AppError(`Upload at least one photo as proof before marking the order ${next}.`, 400);
  }
  const pull: any[] = Array.isArray(order.pullList) ? order.pullList : [];
  if (NEEDS_VERIFIED_PULL.includes(next) && pull.some((i) => !i.checked)) {
    throw new AppError(`Verify every item on the pull list (${pull.filter((i) => !i.checked).length} left) before marking the order ${next}.`, 400);
  }
  const note = String(payload.statusNote || '').trim();
  if (NEEDS_REASON.includes(next) && note.length < 3) {
    throw new AppError(`Add a short reason before marking the order ${next}.`, 400);
  }
  return note;
}
