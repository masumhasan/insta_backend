import { AppSetting, MediaTask, CalendarEvent, MediaDelivery } from './ops.model';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/apiError';

const formatTimeMinutes = (label: string): number => {
  const m = label.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (!m) return 9 * 60;
  let hr = Number(m[1]);
  const min = Number(m[2] || 0);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && hr < 12) hr += 12;
  if (ampm === 'AM' && hr === 12) hr = 0;
  return hr * 60 + min;
};

/**
 * Operations service handling settings, working hours, photographer calendars, media tasks, and delivery galleries.
 */
export class OpsService {
  static async getSetting(key: string) {
    const doc = await AppSetting.findOne({ key }).lean();
    return { key, value: doc?.value || null };
  }

  static async upsertSetting(key: string, value: any, updatedBy = 'Admin') {
    const doc = await AppSetting.findOneAndUpdate(
      { key },
      { $set: { key, value, updatedBy } },
      { upsert: true, new: true }
    );
    return { key: doc.key, value: doc.value };
  }

  static async getMediaTasks(query: { search?: string; status?: string; category?: string } = {}) {
    const filter: any = {};
    if (query.status && query.status !== 'all') filter.status = query.status;
    if (query.category && query.category !== 'all') filter.category = query.category;
    if (query.search?.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { address: { $regex: term, $options: 'i' } },
        { client: { $regex: term, $options: 'i' } },
        { taskName: { $regex: term, $options: 'i' } },
      ];
    }
    const items = await MediaTask.find(filter).sort({ createdAt: -1 }).lean();
    return items.map((t: any) => ({ ...t, id: t._id.toString() }));
  }

  static async createMediaTask(payload: any) {
    const doc = await MediaTask.create(payload);
    return { ...doc.toObject(), id: doc._id.toString() };
  }

  static async updateMediaTask(id: string, payload: any) {
    const doc = await MediaTask.findByIdAndUpdate(id, { $set: payload }, { new: true });
    if (!doc) throw new AppError('Media task not found.', 404);
    return { ...doc.toObject(), id: doc._id.toString() };
  }

  static async addTaskNote(id: string, payload: { text: string; author?: string }) {
    const task = await MediaTask.findById(id);
    if (!task) throw new AppError('Media task not found.', 404);
    const text = String(payload.text || '').trim();
    if (!text) throw new AppError('Note text is required.', 400);

    const entry = {
      id: `note-${Date.now()}`,
      author: payload.author || 'Sign Company',
      createdAt: new Date().toLocaleString(),
      text,
    };
    task.notes.unshift(entry as any);
    await task.save();

    await NotificationService.notifyMentions(text, entry.author, task.orderNumber || id);
    return entry;
  }

  static async spawnTasksForMediaOrder(order: any, qcTasks?: string[]) {
    const names = Array.isArray(qcTasks) && qcTasks.length > 0 ? qcTasks : ['Edit HDR Photos', 'Quality Control Review'];
    for (const taskName of names) {
      await MediaTask.create({
        orderNumber: order.orderNumber,
        address: order.address,
        client: order.agent,
        taskName,
        tags: ['Media QC'],
        dueDate: order.dueDate || 'Standard',
        shotBy: order.installerName || '',
        listingPrice: order.price || '$0.00',
        status: 'user',
        category: 'photography',
      });
    }
  }

  static async getCalendarEvents(query: { date?: string; photographer?: string } = {}) {
    const filter: any = {};
    if (query.date) filter.date = query.date;
    if (query.photographer && query.photographer !== 'all') {
      filter.photographer = { $regex: query.photographer, $options: 'i' };
    }
    const items = await CalendarEvent.find(filter).sort({ createdAt: 1 }).lean();
    return items.map((e: any) => ({ ...e, id: e._id.toString() }));
  }

  static async createCalendarEvent(payload: any) {
    const doc = await CalendarEvent.create(payload);
    return { ...doc.toObject(), id: doc._id.toString() };
  }

  static async deleteCalendarEvent(id: string) {
    await CalendarEvent.findByIdAndDelete(id);
    return true;
  }

  /**
   * Computes valid media start slots enforcing that onsiteDuration finishes before business closing time.
   */
  static async getAvailableSlots(query: { date?: string; durationMinutes?: any }) {
    const duration = Math.max(15, Number(query.durationMinutes) || 60);
    const hoursSetting = await AppSetting.findOne({ key: 'working_hours' }).lean();
    const endHour = hoursSetting?.value?.endTime || '6:00 PM';
    const closeMin = formatTimeMinutes(endHour);
    const candidates = ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];

    const existing = query.date ? await CalendarEvent.find({ date: query.date }).lean() : [];
    const booked = new Set(existing.map((e: any) => e.time.toLowerCase()));

    return candidates.filter((slot) => {
      const startMin = formatTimeMinutes(slot);
      return startMin + duration <= closeMin && !booked.has(slot.toLowerCase());
    });
  }

  static async getMediaDeliveries(query: { search?: string } = {}) {
    const filter: any = {};
    if (query.search?.trim()) {
      const term = query.search.trim();
      filter.$or = [{ address: { $regex: term, $options: 'i' } }, { clientName: { $regex: term, $options: 'i' } }];
    }
    const items = await MediaDelivery.find(filter).sort({ createdAt: -1 }).lean();
    return items.map((m: any) => ({ ...m, id: m._id.toString() }));
  }

  static async createMediaDelivery(payload: any) {
    const doc = await MediaDelivery.create(payload);
    return { ...doc.toObject(), id: doc._id.toString() };
  }
}

