import { ClientInvoice, IClientInvoiceDocument } from './invoice.model';
import { Order } from '../order/order.model';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/apiError';
import { buildInvoicePdfBuffer, type IPdfLine } from './invoice.pdf';

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const findClientInvoiceOrThrow = async (id: string) => {
  const clean = decodeURIComponent(String(id || '').trim());
  const clauses: any[] = [{ invoiceNo: clean }, { orderId: clean }];
  if (OBJECT_ID_RE.test(clean)) clauses.unshift({ _id: clean });
  const doc = await ClientInvoice.findOne({ $or: clauses });
  if (!doc) throw new AppError('Client invoice not found.', 404);
  return doc;
};

export const formatClientInvoice = (doc: any) => ({
  id: doc._id.toString(),
  _id: doc._id.toString(),
  invoiceNo: doc.invoiceNo,
  orderId: doc.orderId || '',
  clientName: doc.clientName || 'Client',
  clientEmail: doc.clientEmail || '',
  address: doc.address || '',
  type: doc.type || 'Installation',
  orderDate: doc.orderDate || (doc.createdAt ? new Date(doc.createdAt).toISOString().split('T')[0] : ''),
  dueDate: doc.dueDate || '',
  subtotal: Number(doc.subtotal) || Number(doc.price) || 0,
  taxAmount: Number(doc.taxAmount) || 0,
  discountAmount: Number(doc.discountAmount) || 0,
  price: Number(doc.price) || 0,
  payment: doc.payment || 'Unpaid',
  paymentMethod: doc.paymentMethod || '',
  paymentDate: doc.paymentDate || '',
  paymentReference: doc.paymentReference || '',
  notes: doc.notes || '',
  lineItems: Array.isArray(doc.lineItems) ? doc.lineItems : [],
  refunds: Array.isArray(doc.refunds) ? doc.refunds : [],
  createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
});

export class ClientInvoiceService {
  static async getInvoices(query: { status?: string; searchQuery?: string; page?: any; limit?: any }, currentUser?: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query.status && query.status !== 'all') {
      filter.payment = { $regex: `^${String(query.status).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }
    if (query.searchQuery && query.searchQuery.trim() !== '') {
      const term = query.searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { invoiceNo: { $regex: term, $options: 'i' } },
        { orderId: { $regex: term, $options: 'i' } },
        { clientName: { $regex: term, $options: 'i' } },
        { type: { $regex: term, $options: 'i' } },
        { address: { $regex: term, $options: 'i' } },
      ];
    }
    if (currentUser?.role && ['Agent', 'Team Lead', 'Assistant'].includes(currentUser.role)) {
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ clientEmail: currentUser.email?.toLowerCase() }, { clientName: currentUser.name }] },
      ];
    }

    const [total, docs] = await Promise.all([
      ClientInvoice.countDocuments(filter),
      ClientInvoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return {
      invoices: docs.map(formatClientInvoice),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  static async getInvoiceById(id: string) {
    const doc = await findClientInvoiceOrThrow(id);
    return formatClientInvoice(doc.toObject());
  }

  static async createInvoice(payload: any) {
    const count = await ClientInvoice.countDocuments();
    const invoiceNo = payload.invoiceNo || `INV-${7511 + count + Math.floor(Math.random() * 50)}`;
    const price = Number(payload.price) || 0;
    const lineItems = Array.isArray(payload.lineItems) && payload.lineItems.length > 0
      ? payload.lineItems
      : [{ label: payload.type || 'Signage Service', quantity: 1, unitPrice: price, total: price }];

    const doc = await ClientInvoice.create({
      invoiceNo,
      orderId: payload.orderId || '',
      clientName: payload.clientName || 'Client',
      clientEmail: (payload.clientEmail || '').toLowerCase(),
      address: payload.address || '',
      type: payload.type || 'Installation',
      orderDate: payload.orderDate || new Date().toISOString().split('T')[0],
      dueDate: payload.dueDate || '',
      subtotal: Number(payload.subtotal) || price,
      taxAmount: Number(payload.taxAmount) || 0,
      discountAmount: Number(payload.discountAmount) || 0,
      price,
      payment: payload.payment || 'Unpaid',
      paymentMethod: payload.paymentMethod || '',
      paymentDate: payload.paymentDate || '',
      paymentReference: payload.paymentReference || '',
      notes: payload.notes || '',
      lineItems,
      refunds: Array.isArray(payload.refunds) ? payload.refunds : [],
    });
    return formatClientInvoice(doc.toObject());
  }

  static async syncFromOrder(order: any) {
    try {
      const orderNum = String(order.orderNumber || order.id || '').trim();
      if (!orderNum) return;
      const invoiceNo = `INV-${orderNum.replace(/^#/, '')}`;
      const exists = await ClientInvoice.findOne({ $or: [{ invoiceNo }, { orderId: orderNum }] });
      if (exists) return;
      const price = Number(order.totalAmount) || Number(String(order.price || '').replace(/[^0-9.-]/g, '')) || 0;
      await ClientInvoice.create({
        invoiceNo,
        orderId: orderNum,
        clientName: order.agent || 'Client',
        address: order.address || '',
        type: order.type || 'Installation',
        orderDate: order.orderDate || new Date().toISOString().split('T')[0],
        dueDate: order.dueDate || 'Standard',
        subtotal: Number(order.subtotal) || price,
        taxAmount: Number(order.taxAmount) || 0,
        discountAmount: Number(order.discountAmount) || 0,
        price,
        payment: order.paymentStatus === 'Paid' ? 'Paid' : 'Unpaid',
        paymentMethod: order.paymentMethod || '',
        lineItems: [{ label: `${order.type || 'Service'} — ${order.address || orderNum}`, quantity: 1, unitPrice: price, total: price }],
      });
    } catch {
      // Non-blocking sync so order placement never fails
    }
  }

  static async recordPayment(id: string, payload: { paymentAmount?: any; paymentMethod?: string; paymentDate?: string; reference?: string }) {
    const doc = await findClientInvoiceOrThrow(id);
    const amountNum = Number(String(payload.paymentAmount || '').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(amountNum) && amountNum > 0) doc.price = amountNum;
    doc.payment = 'Paid';
    doc.paymentMethod = payload.paymentMethod || doc.paymentMethod || 'Check';
    doc.paymentDate = payload.paymentDate || new Date().toISOString().split('T')[0];
    doc.paymentReference = String(payload.reference || doc.paymentReference || '').trim();
    await doc.save();

    if (doc.orderId) {
      await Order.updateOne(
        { orderNumber: doc.orderId },
        { $set: { paymentStatus: 'Paid', totalAmount: doc.price, price: `$${doc.price.toFixed(2)}` } }
      ).catch(() => {});
    }

    await NotificationService.safeNotify({
      recipientRole: 'Sign company',
      title: `Invoice Paid (${doc.invoiceNo})`,
      message: `Payment of $${doc.price.toFixed(2)} via ${doc.paymentMethod} recorded for ${doc.clientName}.`,
      type: 'order',
      referenceId: doc.invoiceNo,
    });

    return formatClientInvoice(doc.toObject());
  }

  static async refundInvoice(id: string, payload: { type: 'full' | 'partial'; amount: number; reason?: string }) {
    const doc = await findClientInvoiceOrThrow(id);
    const total = Number(doc.price) || 0;
    const prevRefunded = (doc.refunds || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const remaining = Math.max(0, Number((total - prevRefunded).toFixed(2)));

    const requested = payload.type === 'full' ? (remaining > 0 ? remaining : total) : Number(payload.amount) || 0;
    if (requested <= 0) throw new AppError('Refund amount must be positive.', 400);
    if (remaining > 0 && requested > remaining + 0.01) {
      throw new AppError(`Refund exceeds remaining balance ($${remaining.toFixed(2)}).`, 400);
    }

    const entry = {
      id: `ref-${Date.now()}`,
      type: payload.type || 'partial',
      amount: Number(requested.toFixed(2)),
      reason: String(payload.reason || 'Invoice refund').trim(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    doc.refunds.push(entry);

    const newTotalRefunded = prevRefunded + entry.amount;
    doc.payment = newTotalRefunded >= total && total > 0 ? 'Refunded' : 'Partially Refunded';
    await doc.save();

    if (doc.orderId) {
      await Order.updateOne(
        { orderNumber: doc.orderId },
        { $set: { paymentStatus: doc.payment, refunds: doc.refunds } }
      ).catch(() => {});
    }

    await NotificationService.safeNotify({
      recipientRole: 'Sign company',
      title: `Refund Issued (${doc.invoiceNo})`,
      message: `${doc.payment} — $${entry.amount.toFixed(2)} (${entry.reason})`,
      type: 'order',
      referenceId: doc.invoiceNo,
    });

    return formatClientInvoice(doc.toObject());
  }

  static async generatePdf(id: string): Promise<{ filename: string; buffer: Buffer }> {
    const doc = await findClientInvoiceOrThrow(id);
    const inv: IClientInvoiceDocument = doc;
    const refundedTotal = (inv.refunds || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const lines: IPdfLine[] = [
      { text: `Invoice Number: ${inv.invoiceNo}`, bold: true, size: 11 },
      { text: `Order ID: ${inv.orderId || 'N/A'}    |    Service Type: ${inv.type}` },
      { text: `Order Date: ${inv.orderDate}    |    Due Date: ${inv.dueDate || 'Due on Receipt'}` },
      { text: `Payment Status: ${inv.payment}${inv.paymentMethod ? ` (${inv.paymentMethod})` : ''}`, bold: true },
      ...(inv.paymentDate ? [{ text: `Paid Date: ${inv.paymentDate}${inv.paymentReference ? `  Ref: ${inv.paymentReference}` : ''}` }] : []),
      { text: '' },
      { text: 'BILL TO', bold: true, size: 11 },
      { text: `${inv.clientName}${inv.clientEmail ? ` (${inv.clientEmail})` : ''}` },
      { text: `Property / Address: ${inv.address || 'N/A'}` },
      { text: '' },
      { text: 'LINE ITEMS', bold: true, size: 11 },
      ...(inv.lineItems || []).map((li) => ({
        text: `  - ${li.label}   x${li.quantity}   @ $${Number(li.unitPrice).toFixed(2)}   = $${Number(li.total).toFixed(2)}`,
      })),
      { text: '' },
      { text: `Subtotal: $${Number(inv.subtotal || inv.price).toFixed(2)}` },
      { text: `Discount: -$${Number(inv.discountAmount || 0).toFixed(2)}` },
      { text: `Tax: $${Number(inv.taxAmount || 0).toFixed(2)}` },
      { text: `TOTAL AMOUNT: $${Number(inv.price).toFixed(2)}`, bold: true, size: 12 },
      ...(refundedTotal > 0
        ? [
            { text: '' },
            { text: `REFUNDS APPLIED (-$${refundedTotal.toFixed(2)})`, bold: true },
            ...inv.refunds.map((r) => ({ text: `  - [${r.createdAt}] ${r.type}: $${Number(r.amount).toFixed(2)} (${r.reason})` })),
          ]
        : []),
    ];

    return {
      filename: `${inv.invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`,
      buffer: buildInvoicePdfBuffer(`Client Invoice ${inv.invoiceNo}`, lines),
    };
  }
}

