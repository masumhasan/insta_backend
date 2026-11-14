import { Order } from './order.model';
import { Inventory } from '../inventory/inventory.model';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/apiError';

const findOrderOrThrow = async (id: string) => {
  const order = await Order.findOne({
    $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }],
  });
  if (!order) throw new AppError('Order not found.', 404);
  return order;
};

const parseMoney = (val: any): number => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const num = Number(String(val || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
};

/**
 * Handles secondary order workflows: refunds, due-date requests, pull-list intake, CSV migration, and revenue.
 */
export class OrderLifecycleService {
  static async addRefund(
    id: string,
    payload: { type: 'full' | 'partial'; amount: number; reason?: string }
  ) {
    const order = await findOrderOrThrow(id);
    const total = order.totalAmount || parseMoney(order.price);
    const amount = payload.type === 'full' ? total : Math.min(total || payload.amount, Number(payload.amount) || 0);
    if (amount <= 0) throw new AppError('Refund amount must be positive.', 400);

    const existing = Array.isArray(order.refunds) ? [...order.refunds] : [];
    const refundEntry = {
      id: `ref-${Date.now()}`,
      type: payload.type || 'partial',
      amount,
      reason: String(payload.reason || 'Admin refund').trim(),
      createdAt: new Date().toISOString(),
    };
    existing.push(refundEntry as any);
    order.refunds = existing as any;

    const totalRefunded = existing.reduce((s, r: any) => s + (Number(r.amount) || 0), 0);
    order.paymentStatus = totalRefunded >= total && total > 0 ? 'Refunded' : 'Partially Refunded';
    await order.save();

    const { ClientInvoice } = await import('../invoice/invoice.model');
    await ClientInvoice.updateOne(
      { orderId: order.orderNumber },
      { $set: { payment: order.paymentStatus, refunds: order.refunds } }
    ).catch(() => {});

    await NotificationService.safeNotify({
      recipientRole: 'Sign company',
      title: `Refund Issued (${order.orderNumber})`,
      message: `${order.paymentStatus} refund of $${amount.toFixed(2)} — ${refundEntry.reason}`,
      type: 'order',
      referenceId: order.orderNumber,
    });

    return {
      id: order.orderNumber,
      _id: order._id.toString(),
      paymentStatus: order.paymentStatus,
      refunds: order.refunds,
    };
  }

  static async handleDueDateRequest(
    id: string,
    payload: { requestedDate?: string; reason?: string; action?: 'request' | 'approve' | 'reject'; requestedBy?: string },
    currentUser?: any
  ) {
    const order = await findOrderOrThrow(id);
    const action = payload.action || 'request';

    if (action === 'approve' || action === 'reject') {
      if (currentUser?.role && !['Admin', 'Sign company', 'Office Manager'].includes(currentUser.role)) {
        throw new AppError('Only dispatcher/admin roles can approve or reject due date requests.', 403);
      }
    }

    if (action === 'approve') {
      const nextDate = payload.requestedDate || order.dueDateRequest?.requestedDate || order.dueDate;
      order.dueDate = nextDate;
      order.dueDateRequest = { ...(order.dueDateRequest || {}), status: 'approved', requestedDate: nextDate };
      await NotificationService.safeNotify({
        recipientRole: 'Warehouse manager',
        title: `Due Date Approved (${order.orderNumber})`,
        message: `Due date updated to ${nextDate}.`,
        type: 'due_date',
        referenceId: order.orderNumber,
      });
    } else if (action === 'reject') {
      order.dueDateRequest = { ...(order.dueDateRequest || {}), status: 'rejected' };
      await NotificationService.safeNotify({
        recipientRole: 'Warehouse manager',
        title: `Due Date Request Declined (${order.orderNumber})`,
        message: `Reschedule request for ${order.orderNumber} was declined.`,
        type: 'due_date',
        referenceId: order.orderNumber,
      });
    } else {
      if (!payload.requestedDate) throw new AppError('Requested due date is required.', 400);
      order.dueDateRequest = {
        requestedDate: payload.requestedDate,
        reason: payload.reason || '',
        status: 'pending',
        requestedBy: payload.requestedBy || currentUser?.name || order.agent,
      };
      await NotificationService.safeNotify({
        recipientRole: 'Sign company',
        title: `Due Date Change Request (${order.orderNumber})`,
        message: `${order.dueDateRequest.requestedBy} requested moving due date to ${payload.requestedDate}.`,
        type: 'due_date',
        referenceId: order.orderNumber,
      });
    }

    await order.save();
    return {
      id: order.orderNumber,
      _id: order._id.toString(),
      dueDate: order.dueDate,
      dueDateRequest: order.dueDateRequest,
    };
  }

  static async updatePullList(
    id: string,
    payload: {
      pullList?: any[];
      readyForInstall?: boolean;
      missingItems?: string[];
      newPickedItems?: { product: string; size?: string; owner?: string; quantity?: number; location?: string; barcode?: string }[];
    }
  ) {
    const order = await findOrderOrThrow(id);
    if (Array.isArray(payload.pullList)) {
      order.pullList = payload.pullList as any;
    }
    if (Array.isArray(payload.missingItems)) {
      order.missingItems = payload.missingItems;
    }
    if (payload.readyForInstall) {
      order.status = order.status.includes('Up') ? 'Assigned Up' : 'Ready for Install';
    }
    await order.save();

    if (Array.isArray(payload.missingItems) && payload.missingItems.length > 0) {
      await NotificationService.safeNotify({
        recipientRole: 'Sign company',
        title: `Missing Items Flagged (${order.orderNumber})`,
        message: `Missing hardware reported: ${payload.missingItems.join(', ')}`,
        type: 'order',
        referenceId: order.orderNumber,
      });
    } else if (payload.readyForInstall) {
      await NotificationService.safeNotify({
        recipientRole: 'Sign company',
        title: `Pull Ready for Install (${order.orderNumber})`,
        message: `${order.type} at ${order.address} marked ready for field install.`,
        type: 'order',
        referenceId: order.orderNumber,
      });
    }

    const createdInventory: any[] = [];
    if (Array.isArray(payload.newPickedItems)) {
      for (const np of payload.newPickedItems) {
        if (!np?.product) continue;
        const qty = Math.max(1, Number(np.quantity) || 1);
        const doc = await Inventory.create({
          product: np.product.trim(),
          size: np.size || 'Standard',
          owner: np.owner || order.agent || 'Instapost LLC',
          available: qty,
          installed: 0,
          total: qty,
          itemType: np.size || 'Rider',
          barcode: np.barcode || `BAR-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`,
          location: np.location || 'Field Pickup -> Warehouse Queue',
          history: [
            {
              id: `hist-${Date.now()}`,
              date: new Date().toISOString().split('T')[0],
              status: 'Processing for Return',
              address: order.address,
              installer: order.installerName || 'Field Installer',
              agent: order.agent,
              notes: `New item picked up from order ${order.orderNumber}`,
            },
          ],
        });
        createdInventory.push({ id: doc._id.toString(), product: doc.product, barcode: doc.barcode });
      }
    }

    return {
      id: order.orderNumber,
      _id: order._id.toString(),
      status: order.status,
      pullList: order.pullList,
      missingItems: order.missingItems || [],
      createdInventory,
    };
  }

  static async importCsvRows(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new AppError('CSV rows array is required.', 400);
    }
    if (rows.length > 2000) {
      throw new AppError('Maximum 2,000 rows per import batch.', 400);
    }

    const baseCount = await Order.countDocuments();
    const batch = rows
      .filter((r) => r && (r.address || r.Address || r.propertyAddress))
      .map((r, idx) => {
        const rawPrice = parseMoney(r.price ?? r.Price ?? r.totalAmount ?? 150);
        const rawType = String(r.type || r.Type || r.orderType || 'Installation').trim();
        return {
          orderNumber: r.orderNumber || `#IMP-${8000 + baseCount + idx + 1}`,
          type: rawType.toLowerCase() === 'change' ? 'Sign Change' : rawType,
          address: String(r.address || r.Address || r.propertyAddress).trim(),
          agent: String(r.agent || r.Agent || r.agentName || 'Imported Agent').trim(),
          orderDate: String(r.orderDate || r.OrderDate || new Date().toLocaleDateString('en-GB')),
          dueDate: String(r.dueDate || r.DueDate || 'Standard'),
          price: `$${rawPrice.toFixed(2)}`,
          totalAmount: rawPrice,
          notes: String(r.notes || r.Notes || '').trim(),
          status: String(r.status || r.Status || 'Installed'),
          installerName: String(r.installerName || r.Installer || '').trim(),
          paymentStatus: String(r.paymentStatus || 'Paid'),
          specifications: { importedFrom: r.source || 'UpSignDown CSV' },
        };
      });

    if (batch.length === 0) {
      throw new AppError('No valid rows with property address found in CSV.', 400);
    }

    const inserted = await Order.insertMany(batch, { ordered: false });
    const { ClientInvoiceService } = await import('../invoice/clientInvoice.service');
    await Promise.allSettled(inserted.map((ord) => ClientInvoiceService.syncFromOrder(ord)));
    return { importedCount: inserted.length };
  }

  static async getRevenueSummary(query: { search?: string; startDate?: string; endDate?: string; service?: string }) {
    const filter: any = { status: { $nin: ['Cancelled', 'cancelled', 'Canceled'] } };
    if (query.service && query.service !== 'all') {
      filter.type = { $regex: query.service, $options: 'i' };
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    const mapped = orders
      .map((o: any) => {
        const gross = o.totalAmount || parseMoney(o.price);
        const refunded = Array.isArray(o.refunds)
          ? o.refunds.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
          : 0;
        const net = Math.max(0, gross - refunded);
        const isoDate = o.createdAt ? new Date(o.createdAt).toISOString().split('T')[0] : '';
        return {
          id: o._id.toString(),
          orderId: o.orderNumber || o._id.toString(),
          serviceName: o.type || 'Installation',
          agent: o.agent || 'Agent',
          address: o.address || '',
          date: isoDate,
          grossAmount: gross,
          refundedAmount: refunded,
          amount: net,
          paymentStatus: o.paymentStatus || 'Paid',
        };
      })
      .filter((r) => {
        const matchSearch =
          !query.search ||
          r.serviceName.toLowerCase().includes(query.search.toLowerCase()) ||
          r.agent.toLowerCase().includes(query.search.toLowerCase()) ||
          r.orderId.toLowerCase().includes(query.search.toLowerCase());
        const matchStart = !query.startDate || (r.date && r.date >= query.startDate);
        const matchEnd = !query.endDate || (r.date && r.date <= query.endDate);
        return matchSearch && matchStart && matchEnd;
      });

    const byServiceMap = new Map<string, { service: string; total: number; count: number }>();
    for (const item of mapped) {
      const curr = byServiceMap.get(item.serviceName) || { service: item.serviceName, total: 0, count: 0 };
      curr.total += item.amount;
      curr.count += 1;
      byServiceMap.set(item.serviceName, curr);
    }

    return {
      records: mapped,
      totalRevenue: mapped.reduce((s, r) => s + r.amount, 0),
      byService: Array.from(byServiceMap.values()),
    };
  }
}

