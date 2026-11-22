import { Request, Response } from 'express';
import { Order } from './order.model';
import { AppError } from '../../utils/apiError';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractMentions, notifyMentions } from '../notification/mentions';

/** Internal order notes (staff only): free notes and the note given with a status change, with @mentions. */

const findOrder = async (id: string) => {
  const order = await Order.findOne({ $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(id) ? id : null }, { orderNumber: id }] });
  if (!order) throw new AppError('Order not found.', 404);
  return order;
};

const formatNote = (n: any) => ({
  id: String(n.id || ''),
  text: String(n.text || ''),
  status: n.status || '',
  mentions: Array.isArray(n.mentions) ? n.mentions : [],
  author: n.author || 'Staff',
  createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : '',
});

export const getOrderNotes = asyncHandler(async (req: Request, res: Response) => {
  const order: any = await findOrder(String(req.params.id));
  const notes = [...(order.noteLog || [])].reverse().map(formatNote);
  return ApiResponse.success(res, 200, 'Order notes retrieved', notes);
});

export const addOrderNote = asyncHandler(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw new AppError('Note text is required.', 400);
  if (text.length > 2000) throw new AppError('Notes are limited to 2000 characters.', 400);
  const status = String(req.body?.status ?? '').trim().slice(0, 60);
  const order: any = await findOrder(String(req.params.id));

  const mentioned = await extractMentions(text, req.body?.mentions);
  const entry = {
    id: `note-${Date.now()}`,
    text,
    status,
    mentions: mentioned.map((m) => m.id),
    author: actor?.name || 'Staff',
    authorId: String(actor?._id || ''),
    createdAt: new Date(),
  };
  order.noteLog = [...(order.noteLog || []), entry];
  await order.save();

  await notifyMentions({
    text,
    resolved: mentioned,
    author: { id: entry.authorId, name: entry.author },
    context: `order ${order.orderNumber}${status ? ` (${status})` : ''}`,
    link: `/orders?search=${encodeURIComponent(order.orderNumber)}`,
    referenceId: order.orderNumber,
  });
  return ApiResponse.success(res, 201, 'Note added', formatNote(entry));
});
