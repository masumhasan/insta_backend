import { Order } from './order.model';
import { User } from '../auth/user.model';
import { Notification } from '../notification/notification.model';
import { AppError } from '../../utils/apiError';
import { assertNoBase64 } from '../../utils/imageGuard';
import { IN_PRODUCTION, READY_TO_INSTALL, assertDispatchAllowed, pendingStatusFor } from './order.workflow';
import { createCustomPieceInventory } from './order.designInventory';

/**
 * Customer approval of custom printed pieces (`specifications.customItems`, see order.customPrint.ts).
 *
 * pending -> approved (order "In Production") -> staff mark "Ready to Install" (inventory rows created) -> dispatch.
 * pending -> changes_requested -> staff upload a new proof -> pending again.
 * Orders created before this existed have no `designApproval` and are never blocked.
 */
export type DesignAction = 'approve' | 'request_changes';
type Actor = { _id?: unknown; name?: string; role?: string } | undefined;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[^\s]+$/i;
const CLOSED = /^(cancelled|canceled|completed)$/i;
const HOLD = /^(on hold|waiting on payment)$/i;

export const hasCustomItems = (specs: any) => Array.isArray(specs?.customItems) && specs.customItems.length > 0;

const historyEntry = (action: string, actor: Actor, note = '') => ({
  action,
  by: actor?.name || 'System',
  byId: actor?._id ? String(actor._id) : '',
  role: actor?.role || '',
  note,
  at: new Date(),
});

/** The sub-document a new order with custom pieces starts with. */
export const newDesignApproval = (actor: Actor) => ({
  required: true,
  status: 'pending' as const,
  requestedAt: new Date(),
  proofs: [],
  inventoryIds: [],
  history: [historyEntry('requested', actor)],
});

/**
 * PATCH /orders/:id on an order waiting for design approval: no installer or "Assigned" status before it is
 * Ready to Install, "Ready to Install" only through production-complete, "In Production" only once approved.
 */
export function assertDesignOrderEdit(order: any, payload: any) {
  const da = order?.designApproval;
  if (!da?.required) return;
  const next = String(payload?.status || '');
  if (next === READY_TO_INSTALL && !da.productionCompletedAt) {
    throw new AppError('Use "Mark Ready to Install" on the order so its custom pieces are added to inventory.', 409);
  }
  if (next === IN_PRODUCTION && da.status !== 'approved') {
    throw new AppError('The customer has not approved the custom design yet, so the order cannot go into production.', 409);
  }
  const assigning = !!String(payload?.installerName ?? '').trim() || !!String(payload?.installerId ?? '').trim() || /^assigned/i.test(next);
  if (assigning) assertDispatchAllowed(order);
}

/** Shape sent to the portals (no lock field). */
export const formatDesignApproval = (da: any) => {
  if (!da?.required) return null;
  const { lockedAt: _lock, ...rest } = da;
  return rest;
};

const orderLink = (orderNumber: string) => `/orders?search=${encodeURIComponent(orderNumber)}`;

/** The customer side of an order: its owner (the parent agent when an assistant owns it) and whoever placed and pays for it. */
async function customerIds(order: any): Promise<string[]> {
  const ids = new Set<string>();
  const ownerId = String(order.agentId || '');
  if (OBJECT_ID.test(ownerId)) {
    ids.add(ownerId);
    const owner: any = await User.findById(ownerId).select('role parentAgentId').lean();
    if (owner?.role === 'Assistant' && owner.parentAgentId) ids.add(String(owner.parentAgentId));
  }
  const payer = String(order.payment?.payerId || '');
  if (OBJECT_ID.test(payer)) ids.add(payer);
  return Array.from(ids);
}

async function notify(docs: Record<string, unknown>[]) {
  try {
    if (docs.length) await Notification.insertMany(docs);
  } catch {
    /* a failed notification must not undo the approval step */
  }
}

export async function notifyCustomers(order: any, title: string, message: string, by = 'Sign company') {
  const ids = await customerIds(order);
  const base = { title, message, type: 'approval', referenceId: order.orderNumber, link: orderLink(order.orderNumber), createdBy: by };
  // recipientRole '' so only that user sees it ('all' would broadcast).
  await notify(ids.map((id) => ({ ...base, recipientUserId: id, recipientEmail: '', recipientRole: '' })));
}

const notifyStaff = (order: any, title: string, message: string, by: string) =>
  notify([{ recipientRole: 'Sign company', title, message, type: 'approval', referenceId: order.orderNumber, link: orderLink(order.orderNumber), createdBy: by }]);

export const notifyDesignRequested = (order: any, by?: string) =>
  notifyCustomers(order, `Design approval needed (${order.orderNumber})`, `Please review the custom design for ${order.type} at ${order.address} and approve it or request changes.`, by);

const findOrder = async (id: string) => {
  const order = await Order.findOne({ $or: [{ _id: OBJECT_ID.test(id) ? id : null }, { orderNumber: id }] });
  if (!order) throw new AppError('Order not found.', 404);
  return order;
};

const requireApproval = (order: any) => {
  if (!order.designApproval?.required) throw new AppError('This order has no custom design waiting for approval.', 409);
  if (CLOSED.test(String(order.status || ''))) throw new AppError(`This order is ${order.status}.`, 409);
  return order.designApproval;
};

/** Customer (the order's owner side; visibility is checked by the caller) approves or asks for changes. */
export async function respondToDesign(order: any, action: DesignAction, rawNote: unknown, actor: Actor) {
  const da = requireApproval(order);
  if (da.status !== 'pending') throw new AppError(`The design is already ${da.status === 'approved' ? 'approved' : 'waiting for a new proof'}.`, 409);
  const note = String(rawNote ?? '').trim().slice(0, 1000);
  if (action === 'request_changes' && note.length < 3) throw new AppError('Describe the changes you need.', 400);
  const now = new Date();
  order.designApproval = {
    ...da,
    status: action === 'approve' ? 'approved' : 'changes_requested',
    respondedAt: now,
    respondedBy: actor?.name || '',
    respondedById: actor?._id ? String(actor._id) : '',
    note,
    history: [...(da.history || []), historyEntry(action === 'approve' ? 'approved' : 'changes_requested', actor, note)],
  };
  // A hold set by staff (payment, on hold) stays; staff move the order to In Production when they release it.
  const held = HOLD.test(String(order.status || ''));
  if (action === 'approve' && !held) order.status = IN_PRODUCTION;
  order.markModified('designApproval');
  await order.save();
  const who = actor?.name || 'The customer';
  if (action === 'approve') {
    const next = held ? `It stays ${order.status}; move it to In Production when the hold is released.` : 'The order is now In Production.';
    await notifyStaff(order, `Design approved (${order.orderNumber})`, `${who} approved the custom design. ${next}`, who);
  } else {
    await notifyStaff(order, `Design changes requested (${order.orderNumber})`, `${who} asked for changes: "${note}"`, who);
  }
  return order;
}

/** Staff upload a new proof (a Cloudinary image): the design goes back to the customer for approval. */
export async function addDesignProof(id: string, body: any, actor: Actor) {
  const order: any = await findOrder(id);
  const da = requireApproval(order);
  if (da.productionCompletedAt) throw new AppError('This order is already Ready to Install; its design can no longer change.', 409);
  const imageUrl = String(body?.imageUrl ?? '').trim();
  assertNoBase64(imageUrl, 'imageUrl');
  if (!CLOUDINARY.test(imageUrl)) throw new AppError('Upload the proof image first (it must be an uploaded image).', 400);
  const note = String(body?.note ?? '').trim().slice(0, 1000);
  const proof = { imageUrl, publicId: String(body?.publicId ?? '').slice(0, 200), note, uploadedBy: actor?.name || 'Staff', at: new Date() };
  order.designApproval = {
    ...da,
    status: 'pending',
    requestedAt: new Date(),
    proofs: [...(da.proofs || []), proof],
    history: [...(da.history || []), historyEntry('proof_uploaded', actor, note)],
  };
  // A new proof after approval takes the order out of production until it is approved again.
  if (order.status === IN_PRODUCTION) order.status = pendingStatusFor(order.type);
  order.markModified('designApproval');
  await order.save();
  await notifyDesignRequested(order, actor?.name);
  return order;
}

/** Staff finish production: the order becomes "Ready to Install" and each custom piece becomes an inventory item owned by the agent. */
export async function completeProduction(id: string, actor: Actor) {
  const order: any = await findOrder(id);
  const da = requireApproval(order);
  if (da.status !== 'approved') throw new AppError('The customer has not approved the design yet.', 409);
  if (!da.productionCompletedAt && order.status !== IN_PRODUCTION) {
    throw new AppError(`Only an order that is In Production can be marked Ready to Install (this one is ${order.status}).`, 409);
  }
  const inventoryIds = await createCustomPieceInventory(order._id);
  const fresh: any = await findOrder(String(order._id));
  if (!fresh.designApproval.productionCompletedAt) {
    fresh.designApproval = {
      ...fresh.designApproval,
      productionCompletedAt: new Date(),
      productionCompletedBy: actor?.name || '',
      inventoryIds,
      history: [...(fresh.designApproval.history || []), historyEntry('ready_to_install', actor)],
    };
    fresh.status = READY_TO_INSTALL;
    fresh.markModified('designApproval');
    await fresh.save();
    await notifyCustomers(fresh, `Custom signs ready (${fresh.orderNumber})`, `Your custom pieces are printed and in your inventory. The order is Ready to Install.`, actor?.name);
  }
  return fresh;
}

export { findOrder as findDesignOrder };
