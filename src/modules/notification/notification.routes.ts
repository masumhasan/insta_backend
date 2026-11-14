import { Router } from 'express';
import {
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from './notification.controller';

const router = Router();

router.get('/', getNotifications);
router.post('/', createNotification);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);
router.delete('/:id', deleteNotification);

export const notificationRoutes = router;

