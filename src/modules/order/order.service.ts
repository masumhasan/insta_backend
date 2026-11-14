import { Order } from './order.model';
import { OrderMediaService, normalizePhotos } from './order.media.service';
import { User } from '../auth/user.model';
import { AppError } from '../../utils/apiError';
import { assertNoBase64 } from '../../utils/imageGuard';

export interface IGetOrdersQuery {
  type?: string;
  status?: string;
  installerEmail?: string;
  installerName?: string;
  agent?: string;
  parentAgentId?: string;
  searchQuery?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  page?: string | number;
  limit?: string | number;
}

const STATUS_FILTER_MAP: Record<string, string> = {
  waiting_payment: 'Waiting on Payment',
  on_hold: 'On Hold',
  pending_up: 'Pending Up',
  scheduled_up: 'Scheduled Up',
  assigned_up: 'Assigned Up',
  installed: 'Installed',
  cancelled: 'Cancelled',
  canceled: 'Canceled',
  pending_down: 'Pending Down',
  scheduled_down: 'Scheduled Down',
  assigned_down: 'Assigned Down',
  removed: 'Removed',
  in_production: 'In Production',
  added_inventory: 'Added to Inventory',
  out_for_delivery: 'Out for Delivery',
  pending: 'Pending',
  scheduled: 'Scheduled',
  assigned: 'Assigned',
  completed: 'Completed',
  processing: 'Processing',
  ready: 'Ready',
  delivered: 'Delivered',
};

const TYPE_ALIASES: Record<string, string> = {
  Change: 'Sign Change',
  change: 'Sign Change',
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatCurrencyPrice = (rawPrice: any, totalAmount?: any): string => {
  const numericFromPrice = Number(String(rawPrice ?? '').replace(/[^0-9.-]/g, ''));
  if (typeof rawPrice === 'string' && rawPrice.trim().startsWith('$') && Number.isFinite(numericFromPrice)) {
    return `$${numericFromPrice.toFixed(2)}`;
  }
  if (Number.isFinite(numericFromPrice) && String(rawPrice ?? '').trim() !== '') {
    return `$${numericFromPrice.toFixed(2)}`;
  }
  const n = Number(totalAmount);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
};

const parseFlexibleDate = (raw?: string, fallback?: Date): Date | null => {
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (raw && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [a, b, y] = raw.split('/').map(Number);
    // Prefer DD/MM/YYYY when first part > 12, else MM/DD/YYYY (with UTC safe fallback)
    const month = a > 12 ? b - 1 : a - 1;
    const day = a > 12 ? a : b;
    const d = new Date(Date.UTC(y, month, day));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback && !Number.isNaN(fallback.getTime()) ? fallback : null;
};

const computeDaysInField = (o: any): number => {
  if (typeof o.daysInField === 'number' && Number.isFinite(o.daysInField)) return o.daysInField;
  const st = String(o.status || '').toLowerCase();
  if (['waiting on payment', 'on hold', 'cancelled', 'canceled'].includes(st)) return 0;
  const start = o.createdAt ? new Date(o.createdAt) : parseFlexibleDate(o.orderDate);
  if (!start || Number.isNaN(start.getTime())) return 0;
  const diff = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

const formatOrder = (o: any) => ({
  id: o.orderNumber || o._id.toString(),
  _id: o._id.toString(),
  type: o.type || 'Installation',
  address: o.address || '',
  agent: o.agent || '',
  agentId: o.agentId || '',
  orderDate: o.orderDate || '',
  dueDate: o.dueDate || 'Standard',
  daysInField: computeDaysInField(o),
  price: formatCurrencyPrice(o.price, o.totalAmount),
  subtotal: Number(o.subtotal) || 0,
  discountAmount: Number(o.discountAmount) || 0,
  rushFee: Number(o.rushFee) || 0,
  taxAmount: Number(o.taxAmount) || 0,
  totalAmount: Number(o.totalAmount) || Number(String(o.price || '').replace(/[^0-9.-]/g, '')) || 0,
  paymentMethod: o.paymentMethod || 'credit_card',
  paymentStatus: o.paymentStatus || 'Paid',
  poNumber: o.poNumber || '',
  appointmentTime: o.appointmentTime || '',
  onsiteDuration: o.onsiteDuration || 60,
  notes: o.notes || '',
  status: o.status || 'Pending Up',
  installerName: o.installerName || '',
  installerEmail: o.installerEmail || '',
  installerId: o.installerId || '',
  photos: normalizePhotos(o.photos),
  pullList: Array.isArray(o.pullList) ? o.pullList : [],
  missingItems: Array.isArray(o.missingItems) ? o.missingItems : [],
  dueDateRequest: o.dueDateRequest || { status: 'none' },
  specifications: o.specifications || {},
  refunds: Array.isArray(o.refunds) ? o.refunds : [],
  createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : undefined,
});

const resolveParentAgentName = async (parentAgentId?: string): Promise<string> => {
  if (!parentAgentId || !/^[0-9a-fA-F]{24}$/.test(parentAgentId)) return '';
  const parent = await User.findById(parentAgentId).select('name').lean();
  return parent?.name || '';
};

const buildScopeClause = async (currentUser?: any) => {
  if (!currentUser?.role) return null;
  if (['Installer', 'Photographer'].includes(currentUser.role)) {
    return {
      $or: [
        { installerEmail: currentUser.email?.toLowerCase() },
        { installerId: currentUser._id?.toString() },
      ],
    };
  }
  if (currentUser.role === 'Agent' || currentUser.role === 'Team Lead') {
    return { $or: [{ agentId: currentUser._id?.toString() }, { agent: currentUser.name }] };
  }
  if (currentUser.role === 'Assistant') {
    const targetAgent = currentUser.parentAgentId || currentUser._id?.toString();
    const parentName = await resolveParentAgentName(currentUser.parentAgentId);
    return {
      $or: [
        { agentId: targetAgent },
        { parentAgentId: targetAgent },
        ...(parentName ? [{ agent: parentName }] : []),
      ],
    };
  }
  return null;
};

const isOrderVisibleToUser = async (order: any, currentUser?: any): Promise<boolean> => {
  if (!currentUser?.role) return true;
  if (['Admin', 'Sign company', 'Warehouse manager', 'Office Manager'].includes(currentUser.role)) {
    return true;
  }
  if (['Installer', 'Photographer'].includes(currentUser.role)) {
    return (
      order.installerEmail?.toLowerCase() === currentUser.email?.toLowerCase() ||
      (order.installerId && order.installerId === currentUser._id?.toString())
    );
  }
  if (currentUser.role === 'Agent' || currentUser.role === 'Team Lead') {
    return (
      order.agentId === currentUser._id?.toString() ||
      order.agent?.toLowerCase() === currentUser.name?.toLowerCase()
    );
  }
  if (currentUser.role === 'Assistant') {
    const targetAgent = currentUser.parentAgentId || currentUser._id?.toString();
    const parentName = await resolveParentAgentName(currentUser.parentAgentId);
    return (
      order.agentId === targetAgent ||
      order.parentAgentId === targetAgent ||
      Boolean(parentName && order.agent?.toLowerCase() === parentName.toLowerCase())
    );
  }
  return false;
};

export class OrderService {
  static async getOrders(query: IGetOrdersQuery, currentUser?: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: any = {};
    const andClauses: any[] = [];

    if (query.type && query.type !== 'all' && query.type !== 'All') {
      const canonicalType = TYPE_ALIASES[query.type] || query.type;
      filter.type = { $regex: `^${escapeRegex(canonicalType)}$`, $options: 'i' };
    }

    if (query.status && query.status !== 'all') {
      const key = String(query.status).trim().toLowerCase();
      const canonical = STATUS_FILTER_MAP[key] || String(query.status).replace(/_/g, ' ').trim();
      filter.status = { $regex: `^${escapeRegex(canonical)}$`, $options: 'i' };
    }

    if (query.installerEmail) {
      filter.installerEmail = query.installerEmail.toLowerCase();
    }

    if (query.installerName && query.installerName !== 'all') {
      filter.installerName = { $regex: escapeRegex(query.installerName.trim()), $options: 'i' };
    }

    if (query.agent) {
      filter.agent = { $regex: escapeRegex(query.agent.trim()), $options: 'i' };
    }

    const scopeClause = await buildScopeClause(currentUser);
    if (scopeClause) andClauses.push(scopeClause);

    if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date.trim())) {
      const [y, m, d] = query.date.trim().split('-');
      const dmy = `${d}/${m}/${y}`;
      const mdy = `${m}/${d}/${y}`;
      const dayStart = new Date(`${query.date.trim()}T00:00:00.000Z`);
      const dayEnd = new Date(`${query.date.trim()}T23:59:59.999Z`);
      andClauses.push({
        $or: [
          { orderDate: { $in: [dmy, mdy, query.date.trim()] } },
          { dueDate: { $in: [dmy, mdy, query.date.trim()] } },
          { createdAt: { $gte: dayStart, $lte: dayEnd } },
        ],
      });
    } else if (query.startDate || query.endDate) {
      const createdAtRange: any = {};
      if (query.startDate) createdAtRange.$gte = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) createdAtRange.$lte = new Date(`${query.endDate}T23:59:59.999Z`);
      andClauses.push({ createdAt: createdAtRange });
    }

    if (query.searchQuery && query.searchQuery.trim() !== '') {
      const term = escapeRegex(query.searchQuery.trim());
      andClauses.push({
        $or: [
          { orderNumber: { $regex: term, $options: 'i' } },
          { address: { $regex: term, $options: 'i' } },
          { agent: { $regex: term, $options: 'i' } },
          { installerName: { $regex: term, $options: 'i' } },
        ],
      });
    }

    if (andClauses.length > 0) {
      filter.$and = andClauses;
    }

    const [total, orders] = await Promise.all([
      Order.countDocuments(filter),
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return {
      orders: orders.map(formatOrder),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  static async getOrderById(id: string, currentUser?: any) {
    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }],
    }).lean();

    if (!order) throw new AppError('Order not found.', 404);
    if (!(await isOrderVisibleToUser(order, currentUser))) {
      throw new AppError('Access forbidden for this order.', 403);
    }
    return formatOrder(order);
  }

  static async createOrder(payload: any, currentUser?: any) {
    let orderNumber = payload.orderNumber || payload.id;
    if (!orderNumber || !orderNumber.startsWith('#')) {
      const count = await Order.countDocuments();
      orderNumber = `#${8000 + count + 1 + Math.floor(Math.random() * 10)}`;
    }

    const pullList = Array.isArray(payload.pullList)
      ? payload.pullList.map((item: any) => {
          assertNoBase64(item?.imageUrl || item?.image, 'pullList.imageUrl');
          return item;
        })
      : [];

    const hasExplicitTotal =
      payload.totalAmount !== undefined && payload.totalAmount !== '' && Number.isFinite(Number(payload.totalAmount));
    const parsedFromPrice = Number(String(payload.price || '').replace(/[^0-9.-]/g, ''));
    const numericTotal = hasExplicitTotal
      ? Number(payload.totalAmount)
      : Number.isFinite(parsedFromPrice) && String(payload.price || '').trim() !== ''
      ? parsedFromPrice
      : 150;
    const paymentMethod = payload.paymentMethod || 'credit_card';

    const order = await Order.create({
      orderNumber,
      type: TYPE_ALIASES[payload.type] || payload.type || 'Installation',
      address: payload.address || 'Dallas, TX',
      agent: payload.agent || currentUser?.name || 'Agent',
      agentId: payload.agentId || currentUser?._id?.toString(),
      parentAgentId: payload.parentAgentId || currentUser?.parentAgentId || '',
      orderDate: payload.orderDate || new Date().toLocaleDateString('en-GB'),
      dueDate: payload.dueDate || 'Standard',
      price: formatCurrencyPrice(payload.price, numericTotal),
      totalAmount: numericTotal,
      subtotal: payload.subtotal !== undefined ? Number(payload.subtotal) : numericTotal,
      discountAmount: Number(payload.discountAmount) || 0,
      rushFee: Number(payload.rushFee) || 0,
      taxAmount: Number(payload.taxAmount) || 0,
      paymentMethod,
      paymentStatus: payload.paymentStatus || (paymentMethod === 'invoice' ? 'Unpaid' : 'Paid'),
      poNumber: payload.poNumber || '',
      appointmentTime: payload.appointmentTime || '',
      onsiteDuration: Number(payload.onsiteDuration) || 60,
      notes: String(payload.notes || '').trim(),
      status: payload.status || (payload.type === 'Media Services' ? 'Pending' : 'Pending Up'),
      installerName: payload.installerName || '',
      installerEmail: payload.installerEmail || '',
      installerId: payload.installerId || '',
      pullList,
      specifications: payload.specifications || {},
    });

    if (order.type === 'Media Services' || payload.qcTasks?.length) {
      const { OpsService } = await import('../ops/ops.service');
      await OpsService.spawnTasksForMediaOrder(order, payload.qcTasks);
    }

    const { ClientInvoiceService } = await import('../invoice/clientInvoice.service');
    await ClientInvoiceService.syncFromOrder(order);

    const { NotificationService } = await import('../notification/notification.service');
    await NotificationService.safeNotify({
      recipientRole: 'Sign company',
      title: `New Order Placed (${order.orderNumber})`,
      message: `${order.type} at ${order.address} for ${order.agent} (${order.price}).`,
      type: 'order',
      referenceId: order.orderNumber,
      createdBy: order.agent || 'Agent',
    });

    return { id: order.orderNumber, _id: order._id.toString(), status: order.status };
  }

  static async updateOrder(id: string, payload: any, currentUser?: any) {
    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }],
    });
    if (!order) throw new AppError('Order not found.', 404);
    if (!(await isOrderVisibleToUser(order, currentUser))) {
      throw new AppError('Access forbidden for updating this order.', 403);
    }

    const prevStatus = order.status;
    if (payload.status) order.status = payload.status;
    if (payload.installerName !== undefined) order.installerName = payload.installerName;
    if (payload.installerEmail !== undefined) order.installerEmail = payload.installerEmail;
    if (payload.installerId !== undefined) order.installerId = payload.installerId;
    if (payload.dueDate) order.dueDate = payload.dueDate;
    if (payload.totalAmount !== undefined && Number.isFinite(Number(payload.totalAmount))) {
      order.totalAmount = Number(payload.totalAmount);
      if (!payload.price) order.price = formatCurrencyPrice(undefined, order.totalAmount);
    }
    if (payload.price) order.price = formatCurrencyPrice(payload.price, order.totalAmount);
    if (payload.address) order.address = payload.address;
    if (payload.agent) order.agent = payload.agent;
    if (payload.paymentStatus) order.paymentStatus = payload.paymentStatus;
    if (payload.paymentMethod) order.paymentMethod = payload.paymentMethod;
    if (payload.appointmentTime !== undefined) order.appointmentTime = payload.appointmentTime;
    if (payload.onsiteDuration !== undefined && Number.isFinite(Number(payload.onsiteDuration))) {
      order.onsiteDuration = Number(payload.onsiteDuration);
    }
    if (payload.notes !== undefined) order.notes = String(payload.notes || '').trim();
    if (Array.isArray(payload.pullList)) order.pullList = payload.pullList;
    if (Array.isArray(payload.missingItems)) order.missingItems = payload.missingItems;
    if (payload.specifications && typeof payload.specifications === 'object') {
      order.specifications = { ...(order.specifications || {}), ...payload.specifications };
    }

    await order.save();
    if (payload.status && payload.status !== prevStatus) {
      const { NotificationService } = await import('../notification/notification.service');
      await NotificationService.safeNotify({
        recipientRole: 'Sign company',
        title: `Order Status Updated (${order.orderNumber})`,
        message: `${order.type} at ${order.address} changed from ${prevStatus} to ${order.status}.`,
        type: 'order',
        referenceId: order.orderNumber,
      });
    }
    return formatOrder(order.toObject());
  }

  static async assignInstaller(id: string, installer: { name: string; email: string; id?: string }) {
    const order = await Order.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }],
    });
    if (!order) throw new AppError('Order not found.', 404);

    order.installerName = installer.name;
    order.installerEmail = installer.email.toLowerCase();
    order.installerId = installer.id || '';

    if (order.status.includes('Up')) {
      order.status = 'Assigned Up';
    } else if (order.status.includes('Down')) {
      order.status = 'Assigned Down';
    } else {
      order.status = 'Assigned';
    }

    await order.save();
    const { NotificationService } = await import('../notification/notification.service');
    await NotificationService.safeNotify({
      recipientUserId: installer.id || '',
      recipientEmail: installer.email,
      recipientRole: 'Installer',
      title: `Job Assigned (${order.orderNumber})`,
      message: `${order.type} at ${order.address} (Due: ${order.dueDate || 'Standard'}).`,
      type: 'order',
      referenceId: order.orderNumber,
    });
    return { id: order.orderNumber, status: order.status, installerName: order.installerName };
  }

  static addPhoto = (
    id: string,
    input: { fileBuffer?: Buffer; imageUrl?: string; photoUrl?: string; publicId?: string }
  ) => OrderMediaService.addPhoto(id, input);

  static removePhoto = (id: string, target: { publicId?: string; imageUrl?: string }) =>
    OrderMediaService.removePhoto(id, target);

  static getRoutePlan = (query: { installer?: string; mode?: string; warehouseId?: string }, currentUser?: any) =>
    OrderMediaService.getRoutePlan(query, currentUser);
}

