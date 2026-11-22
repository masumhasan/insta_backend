import { Order } from './order.model';
import { AppError } from '../../utils/apiError';
import { NotificationService } from '../notification/notification.service';
import { isOrderVisibleToUser } from './order.service';
import { canRescheduleFor } from './order.dates';

const mdy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
};
const asLabel = (due: string) => (/^\d{4}-\d{2}-\d{2}$/.test(due) ? mdy(due) : due || 'Standard');

/**
 * PATCH /orders/:id/reschedule: an agent, assistant or team lead moves the due date of their own order before any
 * field work has happened. The sign company (and the assigned technician, if any) is notified.
 * Staff keep changing due dates through PATCH /orders/:id.
 */
export async function rescheduleOrder(id: string, body: { dueDate?: string; reason?: string }, user: any) {
  const dueDate = String(body?.dueDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(new Date(`${dueDate}T00:00:00Z`).getTime())) {
    throw new AppError('Choose a valid new due date.', 400);
  }
  const today = new Date().toISOString().slice(0, 10);
  // One day of slack: the agent's "today" can still be yesterday in UTC (US evenings).
  const earliest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (dueDate < earliest) throw new AppError('The new due date cannot be in the past.', 400);
  const reason = String(body?.reason || '').trim().slice(0, 500);

  const order = await Order.findOne({ $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(id) ? id : null }, { orderNumber: id }] });
  if (!order) throw new AppError('Order not found.', 404);
  if (!(await isOrderVisibleToUser(order, user))) throw new AppError('You can only reschedule your own orders.', 403);
  if (/^rush$/i.test(String(order.dueDate || ''))) {
    throw new AppError('Rush orders cannot be rescheduled here. Contact the sign company.', 409);
  }
  if (!canRescheduleFor(order, user)) {
    throw new AppError(`This order is "${order.status}", so it can no longer be rescheduled. Contact the sign company.`, 409);
  }
  if (order.dueDate === dueDate) throw new AppError('That is already the due date.', 400);

  const previous = asLabel(String(order.dueDate || ''));
  order.dueDate = dueDate;
  const stamp = mdy(today);
  const line = `[${stamp}] Due date rescheduled by ${user?.name || 'the agent'} from ${previous} to ${mdy(dueDate)}${reason ? `: ${reason}` : ''}`;
  order.notes = [order.notes, line].filter(Boolean).join('\n');
  await order.save();

  const message = `${user?.name || 'The agent'} moved the due date of ${order.type} at ${order.address} from ${previous} to ${mdy(dueDate)}.${reason ? ` Reason: ${reason}` : ''}`;
  await NotificationService.safeNotify({
    recipientRole: 'Sign company',
    title: `Order Rescheduled (${order.orderNumber})`,
    message,
    type: 'due_date',
    referenceId: order.orderNumber,
    createdBy: user?.name || 'Agent',
  });
  if (order.installerId || order.installerEmail) {
    await NotificationService.safeNotify({
      recipientUserId: order.installerId || '',
      recipientEmail: order.installerEmail || '',
      recipientRole: 'Installer',
      title: `Job Rescheduled (${order.orderNumber})`,
      message,
      type: 'due_date',
      referenceId: order.orderNumber,
    });
  }

  return { id: order.orderNumber, _id: order._id.toString(), dueDate: order.dueDate, status: order.status };
}
