import { Order } from './order.model';
import { User } from '../auth/user.model';
import { InventoryService } from '../inventory/inventory.service';
import { AppError } from '../../utils/apiError';

/**
 * On "Ready to Install" every custom piece of an order becomes one inventory item owned by the order's agent
 * (an assistant's order goes to their agent; a team lead's or office's own order to that office), so it shows in
 * their own inventory under the normal ownerScopeFilter. Item codes and barcodes come from inventory.codes.ts
 * through InventoryService.createInventoryItem.
 *
 * Idempotent: the created id is saved on the custom item (`inventoryId`) right after each create, and a short
 * per-order lock (`designApproval.lockedAt`) stops two requests from creating the same pieces at once.
 */
const LOCK_MS = 2 * 60 * 1000;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const OFFICE_ROLES = ['Team Lead', 'Office Manager'];

async function inventoryOwnerOf(order: any): Promise<{ ownerType: 'Agent' | 'Office'; ownerId: string }> {
  let id = String(order.agentId || '');
  let user: any = OBJECT_ID.test(id) ? await User.findById(id).select('role parentAgentId').lean() : null;
  if (user?.role === 'Assistant' && user.parentAgentId) {
    id = String(user.parentAgentId);
    user = await User.findById(id).select('role').lean();
  }
  if (user?.role === 'Agent') return { ownerType: 'Agent', ownerId: id };
  if (OFFICE_ROLES.includes(user?.role)) return { ownerType: 'Office', ownerId: id };
  throw new AppError('This order is not linked to an agent account, so its custom pieces cannot be added to inventory. Set the agent first.', 409);
}

const pieceToItem = (piece: any, order: any, owner: { ownerType: string; ownerId: string }) => {
  const setup = order.specifications?.postSetups?.[Number(piece.post) - 1];
  const main = piece.slot === 'main';
  return {
    product: String(piece.name || (main ? 'Custom panel' : 'Custom rider')).slice(0, 120),
    itemType: main ? 'Main Panel' : 'Rider',
    size: piece.size || 'Standard',
    material: piece.material || '',
    compatiblePostTypes: [setup?.postName || 'Sign post'],
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    available: 1,
    imageUrl: piece.imageUrl || '',
    publicId: piece.publicId || '',
    notes: `Custom print from order ${order.orderNumber}${piece.slotName ? ` (post ${piece.post}, ${piece.slotName})` : ''}.`,
  };
};

export async function createCustomPieceInventory(orderId: unknown): Promise<string[]> {
  const stale = new Date(Date.now() - LOCK_MS);
  const order: any = await Order.findOneAndUpdate(
    { _id: orderId, $or: [{ 'designApproval.lockedAt': null }, { 'designApproval.lockedAt': { $lt: stale } }] },
    { $set: { 'designApproval.lockedAt': new Date() } },
    { new: true }
  );
  if (!order) throw new AppError('This order is already being marked Ready to Install. Try again in a moment.', 409);
  try {
    const pieces: any[] = Array.isArray(order.specifications?.customItems) ? [...order.specifications.customItems] : [];
    const missing = pieces.some((p) => !p?.inventoryId);
    const owner = missing ? await inventoryOwnerOf(order) : null;
    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i]?.inventoryId) continue;
      const created: any = await InventoryService.createInventoryItem(pieceToItem(pieces[i], order, owner!));
      pieces[i] = { ...pieces[i], inventoryId: String(created._id), inventoryItemId: created.itemId || '' };
      // Saved after every piece so a failure half way never re-creates the ones already made.
      await Order.updateOne({ _id: order._id }, { $set: { 'specifications.customItems': pieces } });
    }
    return pieces.map((p) => String(p.inventoryId || '')).filter(Boolean);
  } finally {
    await Order.updateOne({ _id: order._id }, { $set: { 'designApproval.lockedAt': null } });
  }
}
