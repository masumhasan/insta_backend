import { Order } from '../order/order.model';
import { ClientInvoice } from '../invoice/invoice.model';
import { Inventory } from '../inventory/inventory.model';
import { LOW_STOCK_AT } from '../inventory/inventory.stock';
import { buildTrends, type TrendGranularity } from './dashboardTrends';

const PRINT_TYPE = /print/i;

const amountOf = (o: any): number =>
  Number(o.totalAmount) || Number(String(o.price || '').replace(/[^0-9.-]/g, '')) || 0;
const refundedOf = (o: any): number =>
  (o.refunds || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);

const dayRange = (offset: number) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const countEvents = (orders: any[], type: string, start: Date, end: Date) =>
  orders.filter((o) => (o.events || []).some((e: any) => e.type === type && e.at >= start && e.at < end)).length;

/** Dashboard metrics shared by the Admin and Sign Company portals (GET /admin/dashboard-stats?granularity=). */
export async function getDashboardMetrics(granularity: TrendGranularity = 'monthly') {
  const today = dayRange(0);
  const tomorrow = dayRange(1);
  const monthStart = new Date(today.start.getFullYear(), today.start.getMonth(), 1);

  const [orders, unpaidInvoices, lowStockInventory] = await Promise.all([
    Order.find({}, 'type status paymentStatus totalAmount price refunds events createdAt dueDate').lean(),
    ClientInvoice.countDocuments({ payment: 'Unpaid' }),
    Inventory.countDocuments({ available: { $lte: LOW_STOCK_AT } }),
  ]);

  const live = orders.filter((o: any) => !/^cancelled$/i.test(o.status));
  const net = (list: any[]) =>
    list
      .filter((o) => o.paymentStatus === 'Paid' || /refunded/i.test(o.paymentStatus || ''))
      .reduce((s, o) => s + amountOf(o) - refundedOf(o), 0);

  const monthlyNetIncome = net(live.filter((o: any) => o.createdAt >= monthStart));
  const todaysDeposit = net(live.filter((o: any) => o.createdAt >= today.start && o.createdAt < today.end));

  const isPrint = (o: any) => PRINT_TYPE.test(o.type || '');
  const toComplete = {
    needsScheduled: live.filter((o: any) => /^pending/i.test(o.status) && !isPrint(o)).length,
    needsCreated: live.filter((o: any) => isPrint(o) && /^in production$/i.test(o.status)).length,
    needsDelivered: live.filter(
      (o: any) => isPrint(o) && /^(ready|added to inventory|out for delivery)$/i.test(o.status)
    ).length,
    needsPaid: live.filter((o: any) => ['Pending', 'Unpaid', 'Failed'].includes(o.paymentStatus)).length,
  };

  const dayMetrics = ({ start, end }: { start: Date; end: Date }) => ({
    jobsConfirmed: countEvents(orders, 'confirmed', start, end),
    jobsScheduled: countEvents(orders, 'scheduled', start, end),
    ordersCancelled: countEvents(orders, 'cancelled', start, end),
    jobsRescheduled: countEvents(orders, 'rescheduled', start, end),
    scheduleCancelled: countEvents(orders, 'schedule_cancelled', start, end),
  });

  return {
    monthlyNetIncome,
    todaysDeposit,
    pendingOrders: live.filter((o: any) => /^(pending|waiting on payment)/i.test(o.status)).length,
    unpaidInvoices,
    lowStockInventory,
    toComplete,
    today: dayMetrics(today),
    tomorrow: dayMetrics(tomorrow),
    trends: buildTrends(orders, granularity, amountOf, refundedOf),
  };
}
