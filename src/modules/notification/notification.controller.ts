import { Request, Response } from 'express';
import { NotificationService } from './notification.service';
import { ApiResponse } from '../../utils/apiResponse';
import { AppError } from '../../utils/apiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { isStaff } from '../../middlewares/roleGuard.middleware';

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const staff = isStaff(user); // only staff may read another user's / role's notifications
  const data = await NotificationService.getNotifications({
    userId: (staff && (req.query.userId as string)) || user?._id?.toString(),
    email: (staff && (req.query.email as string)) || user?.email,
    role: (staff && (req.query.role as string)) || user?.role,
    limit: req.query.limit,
  });
  return ApiResponse.success(res, 200, 'Notifications retrieved successfully', data);
});

export const createNotification = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const b = req.body || {};
  const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  if (!clip(b.title, 200) || !clip(b.message, 2000)) throw new AppError('Title and message are required.', 400);
  // Signed-out visitors (the public contact form) can only message the admins; they cannot target a user or pick a type.
  const data = await NotificationService.createNotification(
    user
      ? { ...b, title: clip(b.title, 200), message: clip(b.message, 2000), createdBy: user.name }
      : { recipientRole: 'Admin', type: 'system', title: clip(b.title, 200), message: clip(b.message, 2000), createdBy: clip(b.createdBy, 80) || 'Website visitor' }
  );
  return ApiResponse.success(res, 201, 'Notification created successfully', data);
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const data = await NotificationService.markRead(req.params.id as string, (req as any).user);
  return ApiResponse.success(res, 200, 'Notification marked as read', data);
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await NotificationService.markAllRead({
    userId: user?._id?.toString(),
    email: user?.email,
    role: user?.role,
  });
  return ApiResponse.success(res, 200, 'All notifications marked as read');
});

export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  await NotificationService.deleteNotification(req.params.id as string, (req as any).user);
  return ApiResponse.success(res, 200, 'Notification deleted');
});

