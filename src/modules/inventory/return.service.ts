import { ReturnRecord } from './return.model';
import { Inventory } from './inventory.model';
import { AppError } from '../../utils/apiError';
import { NotificationService } from '../notification/notification.service';

/**
 * Manages field return inspections, review queues, and restock/decommission transitions.
 */
export class InventoryReturnService {
  static async getReturns(query: { condition?: string; status?: string; search?: string } = {}) {
    const filter: any = {};
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
      scrap: mapped.filter((r) => r.condition === 'scrap' || r.condition === 'damaged').length,
      newItems: mapped.filter((r) => r.condition === 'new_item').length,
    };

    return { records: mapped, stats };
  }

  static async createReturn(payload: any) {
    const qty = Math.max(1, Number(payload.quantity) || 1);
    const cond = (payload.condition || 'reusable') as any;
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
      status: cond === 'reusable' ? 'Restored & Added to Inventory' : 'Pending Review',
      agent: payload.agent || inventoryDoc?.owner || 'Instapost LLC',
      office: payload.office || inventoryDoc?.office || 'Main Office',
      recoveredFrom: payload.recoveredFrom || payload.orderId || 'Field Removal',
      recoveredBy: payload.recoveredBy || 'Installer',
      inspectionNotes: payload.inspectionNotes || '',
    });

    await NotificationService.safeNotify({
      recipientRole: 'Warehouse manager',
      title: `Return Logged: ${itemName}`,
      message: `Qty ${qty} (${cond}) recovered by ${record.recoveredBy}. ${record.inspectionNotes}`.trim(),
      type: 'system',
      referenceId: record._id.toString(),
      createdBy: record.recoveredBy,
    });

    if (inventoryDoc && cond === 'reusable') {
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
          notes: `Returned (${cond}, qty: ${qty}) ${payload.inspectionNotes || ''}`.trim(),
        },
        ...(inventoryDoc.history || []),
      ];
      await inventoryDoc.save();
    } else if (cond === 'new_item' && !inventoryDoc) {
      await Inventory.create({
        product: itemName,
        itemType: payload.itemType || 'Rider',
        size: payload.size || 'Standard',
        owner: record.agent || 'Instapost LLC',
        available: qty,
        installed: 0,
        total: qty,
        barcode: `BAR-${Date.now().toString().slice(-6)}`,
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

    return record;
  }

  static async processQueueItem(id: string, payload: { status?: string; notes?: string; condition?: string }) {
    const record = await ReturnRecord.findById(id);
    if (!record) throw new AppError('Return record not found.', 404);

    if (payload.status) record.status = payload.status as any;
    if (payload.condition) record.condition = payload.condition as any;
    if (payload.notes !== undefined) record.inspectionNotes = payload.notes;
    await record.save();

    if (payload.status === 'Restored & Added to Inventory') {
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

