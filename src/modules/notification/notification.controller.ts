import { Request, Response } from 'express';
import { NotificationService } from './notification.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const data = await NotificationService.getNotifications({
    userId: (req.query.userId as string) || user?._id?.toString(),
    email: (req.query.email as string) || user?.email,
    role: (req.query.role as string) || user?.role,
    limit: req.query.limit,
  });
  return ApiResponse.success(res, 200, 'Notifications retrieved successfully', data);
});

export const createNotification = asyncHandler(async (req: Request, res: Response) => {
  const data = await NotificationService.createNotification(req.body);
  return ApiResponse.success(res, 201, 'Notification created successfully', data);
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const data = await NotificationService.markRead(req.params.id as string);
  return ApiResponse.success(res, 200, 'Notification marked as read', data);
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  await NotificationService.markAllRead({
    userId: req.body?.userId || user?._id?.toString(),
    email: req.body?.email || user?.email,
    role: req.body?.role || user?.role,
  });
  return ApiResponse.success(res, 200, 'All notifications marked as read');
});

export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  await NotificationService.deleteNotification(req.params.id as string);
  return ApiResponse.success(res, 200, 'Notification deleted');
});

