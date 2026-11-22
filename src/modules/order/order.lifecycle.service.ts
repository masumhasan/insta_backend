import { Order } from './order.model';
import { Inventory } from '../inventory/inventory.model';
import { codeLookupFilter } from '../inventory/inventory.codes';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/apiError';
import { formatUsDate } from '../../utils/formatUsDate';
import { isOrderVisibleToUser } from './order.service';

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
  /**
   * Reprocess a failed/unpaid order (or release an order on HOLD) by charging the card on file.
   * NOTE: live card charging (Stripe) is intentionally deferred — this records the payment as successful.
   * Plug the payment gateway in at the marked line when it is integrated.
   */
  static async processPayment(id: string, currentUser?: any) {
    const order = await findOrderOrThrow(id);
    const unpaid = ['Unpaid', 'Failed', 'Pending'].includes(String(order.paymentStatus || ''));
    const onHold = /^(on hold|waiting on payment)$/i.test(order.status);
    if (!unpaid && !onHold) throw new AppError('This order has no outstanding payment to process.', 400);

    // TODO(payments): charge the stored card here and throw AppError on a declined charge.
    order.paymentStatus = 'Paid';
    order.paymentMethod = 'credit_card';
    order.specifications = {
      ...(order.specifications || {}),
      paymentProcessedAt: new Date().toISOString(),
      paymentProcessedBy: currentUser?.name || 'Staff',
    };
    // Releasing a hold is handled by the Order pre-save hook (paymentStatus → Paid).
    if (onHold && !unpaid) order.markModified('paymentStatus');
    await order.save();

    const { ClientInvoice } = await import('../invoice/invoice.model');
    await ClientInvoice.updateOne({ orderId: order.orderNumber }, { $set: { payment: 'Paid' } }).catch(() => {});

    await NotificationService.safeNotify({
      recipientRole: 'Sign company',
      title: `Payment Processed (${order.orderNumber})`,
      message: `Payment for ${order.type} at ${order.address} was processed. Status: ${order.status}.`,
      type: 'order',
      referenceId: order.orderNumber,
    });

    return {
      id: order.orderNumber,
      _id: order._id.toString(),
      paymentStatus: order.paymentStatus,
      status: order.status,
    };
  }

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
    if (currentUser && !(await isOrderVisibleToUser(order, currentUser))) throw new AppError('Access forbidden for this order.', 403);
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
        message: `${order.dueDateRequest.requestedBy} requested moving due date to ${formatUsDate(payload.requestedDate)}.`,
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

  /**
   * Pull list: the warehouse/installer verifies every item for an order, then marks it Ready for Install.
   * Readiness is its own flag (it never overwrites the order status) and is cleared again if an item is un-verified.
   */
  static async updatePullList(
    id: string,
    payload: { pullList?: any[]; readyForInstall?: boolean; missingItems?: string[] },
    user?: any
  ) {
    const order = await findOrderOrThrow(id);
    if (user && !(await isOrderVisibleToUser(order, user))) throw new AppError('Access forbidden for this order.', 403);

    if (Array.isArray(payload.pullList)) {
      const before = new Map((order.pullList || []).map((i: any) => [i.id, i]));
      const now = new Date().toISOString();
      order.pullList = payload.pullList.map((raw: any) => {
        const prev: any = before.get(raw.id);
        const checked = !!raw.checked;
        const justChecked = checked && !prev?.checked;
        return {
          id: raw.id,
          product: raw.product,
          itemId: raw.itemId ?? prev?.itemId ?? '',
          barcode: raw.barcode ?? prev?.barcode ?? '',
          quantity: raw.quantity ?? prev?.quantity ?? 1,
          owner: raw.owner ?? prev?.owner ?? '',
          location: raw.location ?? prev?.location ?? '',
          instruction: raw.instruction ?? prev?.instruction ?? '',
          imageUrl: raw.imageUrl ?? prev?.imageUrl ?? '',
          publicId: raw.publicId ?? prev?.publicId ?? '',
          checked,
          checkedAt: checked ? (justChecked ? now : prev?.checkedAt || now) : '',
          checkedBy: checked ? (justChecked ? user?.name || '' : prev?.checkedBy || '') : '',
        };
      }) as any;
    }
    if (Array.isArray(payload.missingItems)) order.missingItems = payload.missingItems;

    const list: any[] = order.pullList || [];
    const unverified = list.filter((i) => !i.checked).length;
    const missing = (order.missingItems || []).length;

    if (payload.readyForInstall === true) {
      if (list.length === 0) throw new AppError('This order has no pull list items.', 400);
      if (unverified > 0) throw new AppError(`Verify every item first (${unverified} still to verify).`, 400);
      if (missing > 0) throw new AppError('Resolve the items flagged missing before marking the order ready.', 400);
      order.pullReadyAt = new Date();
      order.pullReadyBy = user?.name || '';
      if (order.type === 'Sign Printing' && order.status === 'In Production') order.status = 'Ready for Install';
    } else if (payload.readyForInstall === false || unverified > 0 || missing > 0) {
      order.pullReadyAt = undefined;
      order.pullReadyBy = '';
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
    } else if (payload.readyForInstall === true) {
      await NotificationService.safeNotify({
        recipientRole: 'Sign company',
        title: `Pull Ready for Install (${order.orderNumber})`,
        message: `${order.type} at ${order.address} has every pull item verified and is ready for the field.`,
        type: 'order',
        referenceId: order.orderNumber,
      });
    }

    return {
      id: order.orderNumber,
      _id: order._id.toString(),
      status: order.status,
      pullList: order.pullList,
      missingItems: order.missingItems || [],
      readyForInstall: !!order.pullReadyAt,
      readyForInstallAt: order.pullReadyAt ? order.pullReadyAt.toISOString() : '',
      readyForInstallBy: order.pullReadyBy || '',
    };
  }

  /** Verifies one pull item by scanning a barcode: an item barcode, a unit barcode or an item id from inventory. */
  static async scanPullItem(id: string, code: string, user?: any) {
    const order = await findOrderOrThrow(id);
    if (user && !(await isOrderVisibleToUser(order, user))) throw new AppError('Access forbidden for this order.', 403);
    const clean = String(code || '').trim();
    if (!clean) throw new AppError('Scan or type a barcode.', 400);

    // Matches current, custom and legacy codes (PST-0042, PST-0042-07, the sign company's own number, BAR-123456 …).
    const inv: any = await Inventory.findOne(codeLookupFilter(clean)).lean();
    if (!inv) throw new AppError(`No inventory item has the barcode "${clean}".`, 404);

    const invIds = [inv.itemId, ...(inv.legacyCodes || [])].filter(Boolean).map((c: string) => String(c).toLowerCase());
    const same = (i: any) =>
      (i.itemId && invIds.includes(String(i.itemId).toLowerCase())) ||
      String(i.product || '').trim().toLowerCase() === String(inv.product || '').trim().toLowerCase();
    const list: any[] = order.pullList || [];
    const target = list.find((i) => !i.checked && same(i));
    if (!target) {
      throw new AppError(
        list.some(same) ? `"${inv.product}" is already verified on this order.` : `"${inv.product}" is not on this order's pull list.`,
        list.some(same) ? 409 : 404
      );
    }
    target.checked = true;
    target.barcode = clean;
    target.checkedAt = new Date().toISOString();
    target.checkedBy = user?.name || '';
    order.markModified('pullList');
    if (list.some((i) => !i.checked)) {
      order.pullReadyAt = undefined;
      order.pullReadyBy = '';
    }
    await order.save();
    return { _id: order._id.toString(), verified: inv.product, pullList: order.pullList, remaining: list.filter((i) => !i.checked).length };
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

