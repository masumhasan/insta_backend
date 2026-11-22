import { Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/apiError';
import { isOrderVisibleToUser } from './order.service';
import { addDesignProof, completeProduction, findDesignOrder, formatDesignApproval, respondToDesign } from './order.designApproval';

const summary = (order: any) => ({
  id: order.orderNumber,
  _id: String(order._id),
  status: order.status,
  designApproval: formatDesignApproval(order.designApproval),
  customItems: Array.isArray(order.specifications?.customItems) ? order.specifications.customItems : [],
});

/** POST /orders/:id/design-approval { action: 'approve' | 'request_changes', note } — the order's customer side only. */
export const respondDesignApproval = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const action = String(req.body?.action || '');
  if (action !== 'approve' && action !== 'request_changes') throw new AppError("action must be 'approve' or 'request_changes'.", 400);
  const order: any = await findDesignOrder(String(req.params.id));
  // Same visibility as GET /orders/:id, plus the customer who placed and pays for it (a Team Lead ordering for an agent).
  const placedIt = !!order.payment?.payerId && String(order.payment.payerId) === String(user?._id);
  if (!placedIt && !(await isOrderVisibleToUser(order, user))) throw new AppError('Access forbidden for this order.', 403);
  const saved = await respondToDesign(order, action, req.body?.note, user);
  return ApiResponse.success(res, 200, action === 'approve' ? 'Design approved' : 'Changes requested', summary(saved));
});

/** POST /orders/:id/design-proof { imageUrl, publicId, note } — staff send a new proof to the customer. */
export const uploadDesignProof = asyncHandler(async (req: Request, res: Response) => {
  const saved = await addDesignProof(String(req.params.id), req.body, (req as any).user);
  return ApiResponse.success(res, 201, 'Proof sent to the customer for approval', summary(saved));
});

/** PATCH /orders/:id/production-complete — staff mark the order Ready to Install (creates the inventory items once). */
export const markProductionComplete = asyncHandler(async (req: Request, res: Response) => {
  const saved = await completeProduction(String(req.params.id), (req as any).user);
  return ApiResponse.success(res, 200, 'Order is Ready to Install', summary(saved));
});
