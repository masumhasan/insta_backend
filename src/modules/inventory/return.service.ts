import { ReturnRecord } from './return.model';
import { Inventory } from './inventory.model';
import { generateItemId } from './inventory.codes';
import { AppError } from '../../utils/apiError';
import { NotificationService } from '../notification/notification.service';
import { Order } from '../order/order.model';
import { isOrderVisibleToUser } from '../order/order.service';
import { isFieldUser } from '../order/order.workflow';

const CONDITIONS = ['reusable', 'repair', 'damaged', 'scrap', 'new_item'];

/**
 * Manages field return inspections, review queues, and restock/decommission transitions.
 */
export class InventoryReturnService {
  static async getReturns(query: { condition?: string; status?: string; search?: string } = {}, user?: any) {
    const filter: any = {};
    // Installers and photographers only see the returns they logged themselves; the warehouse and staff see all.
    if (isFieldUser(user)) filter.recoveredBy = user.name;
    if (query.condition && query.condition !== 'all') filter.condition = query.condition;
    if (query.status && query.status !== 'all') filter.status = query.status;
    if (query.search?.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { itemName: { $regex: term, $options: 'i' } },
        { agent: { $regex: term, $options: 'i' } },
        { office: { $regex: term, $options: 'i' } },
        { orderId: { $regex: term, $options: 'i' } },
      ];
    }

    const records = await ReturnRecord.find(filter).sort({ createdAt: -1 }).lean();
    const mapped = records.map((r: any) => ({
      id: r._id.toString(),
      _id: r._id.toString(),
      inventoryId: r.inventoryId || '',
      itemName: r.itemName,
      name: r.itemName,
      orderId: r.orderId || '',
      quantity: r.quantity || 1,
      condition: r.condition,
      queueType: r.queueType,
      status: r.status,
      agent: r.agent || 'Instapost LLC',
      office: r.office || 'Main Office',
      recoveredFrom: r.recoveredFrom || r.orderId || 'Field Pickup',
      recoveredBy: r.recoveredBy || 'Field Technician',
      inspectionNotes: r.inspectionNotes || '',
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '',
    }));

    const stats = {
      total: mapped.length,
      reusable: mapped.filter((r) => r.condition === 'reusable').length,
      repair: mapped.filter((r) => r.condition === 'repair').length,
      damaged: mapped.filter((r) => r.condition === 'damaged').length,
      scrap: mapped.filter((r) => r.condition === 'scrap').length,
      newItems: mapped.filter((r) => r.condition === 'new_item').length,
      pendingReview: mapped.filter((r) => r.status === 'Pending Review').length,
    };

    return { records: mapped, stats };
  }

  static async createReturn(payload: any, user?: any) {
    const qty = Math.max(1, Number(payload.quantity) || 1);
    // The portals have used both "new" and "new_item", and "notes" / "inspectionNotes".
    const cond = (String(payload.condition || 'reusable') === 'new' ? 'new_item' : payload.condition || 'reusable') as any;
    if (!CONDITIONS.includes(cond)) throw new AppError(`Condition must be one of: ${CONDITIONS.join(', ')}.`, 400);
    const notes = String(payload.inspectionNotes ?? payload.notes ?? '').trim();
    const fieldStaff = isFieldUser(user);

    // A return can be linked to an order, but only one the person can see.
    let linkedOrder: any = null;
    if (payload.orderId) {
      linkedOrder = await Order.findOne({ orderNumber: String(payload.orderId) }).lean();
      if (!linkedOrder) throw new AppError('That order was not found.', 404);
      if (user && !(await isOrderVisibleToUser(linkedOrder, user))) throw new AppError('You cannot log a return for that order.', 403);
    }
    const queueType = cond === 'new_item' ? 'new_item' : cond === 'repair' ? 'repair' : cond === 'scrap' || cond === 'damaged' ? 'damaged' : 'reusable';
    let itemName = String(payload.itemName || '').trim();
    let inventoryDoc: any = null;

    if (payload.inventoryId && String(payload.inventoryId).match(/^[0-9a-fA-F]{24}$/)) {
      inventoryDoc = await Inventory.findById(payload.inventoryId);
      if (inventoryDoc && !itemName) itemName = inventoryDoc.product;
    }
    if (!itemName) throw new AppError('Item name is required.', 400);

    const record = await ReturnRecord.create({
      inventoryId: inventoryDoc?._id?.toString() || payload.inventoryId || '',
      itemName,
      orderId: payload.orderId || '',
      quantity: qty,
      condition: cond,
      queueType,
      // Field staff only report what they recovered; the warehouse confirms it and the stock is added at that point.
      status: cond === 'reusable' && !fieldStaff ? 'Restored & Added to Inventory' : 'Pending Review',
      agent: linkedOrder?.agent || payload.agent || inventoryDoc?.owner || 'Instapost LLC',
      office: payload.office || inventoryDoc?.office || 'Main Office',
      recoveredFrom: linkedOrder?.address || payload.recoveredFrom || 'Field pickup',
      recoveredBy: user?.name || payload.recoveredBy || 'Installer',
      inspectionNotes: notes,
    });

    await NotificationService.safeNotify({
      recipientRole: 'Warehouse manager',
      title: `Return Logged: ${itemName}`,
      message: `Qty ${qty} (${cond}) recovered by ${record.recoveredBy}. ${record.inspectionNotes}`.trim(),
      type: 'system',
      referenceId: record._id.toString(),
      createdBy: record.recoveredBy,
    });

    if (inventoryDoc && cond === 'reusable' && !fieldStaff) {
      inventoryDoc.available = (inventoryDoc.available || 0) + qty;
      inventoryDoc.installed = Math.max(0, (inventoryDoc.installed || 0) - qty);
      inventoryDoc.total = inventoryDoc.available + inventoryDoc.installed;
      inventoryDoc.history = [
        {
          id: `hist-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          status: 'In Stock',
          address: inventoryDoc.location || 'Warehouse-1',
          installer: record.recoveredBy,
          agent: inventoryDoc.owner,
          notes: `Returned (${cond}, qty: ${qty}) ${notes}`.trim(),
        },
        ...(inventoryDoc.history || []),
      ];
      await inventoryDoc.save();
    } else if (cond === 'new_item' && !inventoryDoc && !fieldStaff) {
      const newItemType = payload.itemType || 'Rider';
      const newItemId = await generateItemId(newItemType);
      await Inventory.create({
        product: itemName,
        itemType: newItemType,
        itemId: newItemId,
        size: payload.size || 'Standard',
        owner: record.agent || 'Instapost LLC',
        available: qty,
        installed: 0,
        total: qty,
        barcode: newItemId,
        location: 'Warehouse Queue (New Item)',
        history: [
          {
            id: `hist-${Date.now()}`,
            date: new Date().toISOString().split('T')[0],
            status: 'Processing for Return',
            address: record.recoveredFrom || 'Field Removal',
            installer: record.recoveredBy,
            agent: record.agent,
            notes: `New field item logged (${qty})`,
          },
        ],
      });
    }

    return { ...record.toObject(), id: String(record._id) };
  }

  static async processQueueItem(id: string, payload: { status?: string; notes?: string; condition?: string }) {
    const record = await ReturnRecord.findById(id);
    if (!record) throw new AppError('Return record not found.', 404);

    const wasRestored = record.status === 'Restored & Added to Inventory';
    if (payload.status) record.status = payload.status as any;
    if (payload.condition) record.condition = payload.condition as any;
    if (payload.notes !== undefined) record.inspectionNotes = payload.notes;
    await record.save();

    if (payload.status === 'Restored & Added to Inventory' && !wasRestored) {
      if (record.inventoryId && record.inventoryId.match(/^[0-9a-fA-F]{24}$/)) {
        const inv = await Inventory.findById(record.inventoryId);
        if (inv) {
          inv.available += record.quantity || 1;
          inv.total = inv.available + inv.installed;
          inv.history = [
            {
              id: `hist-${Date.now()}`,
              date: new Date().toISOString().split('T')[0],
              status: 'In Stock',
              address: inv.location || 'Warehouse',
              agent: inv.owner,
              notes: `Queue restored (+${record.quantity || 1})`,
            },
            ...(inv.history || []),
          ];
          await inv.save();
        }
      }
    }

    return record;
  }
}

