import { Router } from 'express';
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

const router = Router();

router.get('/settings/:key', getSetting);
router.put('/settings/:key', upsertSetting);

router.get('/media-tasks', getMediaTasks);
router.post('/media-tasks', createMediaTask);
router.patch('/media-tasks/:id', updateMediaTask);
router.post('/media-tasks/:id/notes', addTaskNote);

router.get('/calendars', getCalendarEvents);
router.post('/calendars', createCalendarEvent);
router.delete('/calendars/:id', deleteCalendarEvent);

router.get('/available-slots', getAvailableSlots);

router.get('/media-delivery', getMediaDeliveries);
router.post('/media-delivery', createMediaDelivery);

export const opsRoutes = router;

