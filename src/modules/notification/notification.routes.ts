import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from './notification.controller';

const router = Router();

// The public contact form posts here without signing in, so it is rate limited per IP.
router.post('/', rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false }), createNotification);

router.use(authenticate);
router.get('/', getNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);
router.delete('/:id', deleteNotification);

export const notificationRoutes = router;

