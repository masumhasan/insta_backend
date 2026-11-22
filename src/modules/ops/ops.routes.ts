import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import {
  getSetting,
  upsertSetting,
  getMediaTasks,
  createMediaTask,
  updateMediaTask,
  addTaskNote,
  getCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  getAvailableSlots,
  getMediaDeliveries,
  createMediaDelivery,
} from './ops.controller';
import { getPublishedReviews, getReviews, createReview, updateReview, deleteReview } from './review.controller';

const router = Router();

const staffOnly = authorizeRoles(...STAFF_ROLES);
const mediaTeam = authorizeRoles(...STAFF_ROLES, 'Photographer');

// The marketing site reads these pages without signing in.
const PUBLIC_SETTING_KEYS = ['contact_us', 'privacy_policy', 'terms_condition'];
const publicSettingsOnly = (req: Request, res: Response, next: NextFunction) =>
  PUBLIC_SETTING_KEYS.includes(String(req.params.key)) ? next() : authenticate(req, res, next);
router.get('/settings/:key', publicSettingsOnly, getSetting);
// Landing page reviews strip: published reviews only.
router.get('/reviews/public', getPublishedReviews);

router.use(authenticate);
router.put('/settings/:key', staffOnly, upsertSetting);

// Reviews management (unpublished drafts included) is staff-only; Admins also need the settings.reviews permission.
const reviewManagers = [staffOnly, requirePermission('settings.reviews')];
router.get('/reviews', reviewManagers, getReviews);
router.post('/reviews', reviewManagers, createReview);
router.patch('/reviews/:id', reviewManagers, updateReview);
router.delete('/reviews/:id', reviewManagers, deleteReview);

router.get('/media-tasks', getMediaTasks);
router.post('/media-tasks', mediaTeam, createMediaTask);
router.patch('/media-tasks/:id', mediaTeam, updateMediaTask);
router.post('/media-tasks/:id/notes', mediaTeam, addTaskNote);

router.get('/calendars', getCalendarEvents);
router.post('/calendars', mediaTeam, createCalendarEvent);
router.delete('/calendars/:id', mediaTeam, deleteCalendarEvent);

router.get('/available-slots', getAvailableSlots);

router.get('/media-delivery', getMediaDeliveries);
router.post('/media-delivery', mediaTeam, createMediaDelivery);

export const opsRoutes = router;

