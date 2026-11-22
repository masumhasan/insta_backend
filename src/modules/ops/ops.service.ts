import { AppSetting, MediaTask, CalendarEvent, MediaDelivery } from './ops.model';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/apiError';

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
    const editable = ['address', 'client', 'taskName', 'tags', 'dueDate', 'shotBy', 'editor', 'listingPrice', 'status', 'category', 'media', 'hasActions'];
    const update: Record<string, any> = {};
    for (const key of editable) if (payload?.[key] !== undefined) update[key] = payload[key];
    // Note edits/deletes send the full list back; keep only the known note fields and the original authors.
    if (Array.isArray(payload?.notes)) {
      const current = await MediaTask.findById(id).select('notes').lean();
      if (!current) throw new AppError('Media task not found.', 404);
      const byId = new Map((current.notes || []).map((n: any) => [n.id, n]));
      update.notes = payload.notes
        .filter((n: any) => n && byId.has(n.id))
        .map((n: any) => {
          const text = String(n.text ?? '').trim();
          const orig: any = byId.get(n.id);
          return { id: orig.id, author: orig.author, createdAt: orig.createdAt, text: text || orig.text };
        });
    }
    if (Object.keys(update).length === 0) throw new AppError('Nothing to update.', 400);
    const doc = await MediaTask.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
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
    // The Calendar page sends `timeSlot` ("9am"); the stored field is `time`.
    const doc = await CalendarEvent.create({ ...payload, time: payload?.time || payload?.timeSlot });
    return { ...doc.toObject(), id: doc._id.toString() };
  }

  static async deleteCalendarEvent(id: string) {
    await CalendarEvent.findByIdAndDelete(id);
    return true;
  }

  /** Old slot list (start labels only); same rules as GET /ops/media-availability. */
  static async getAvailableSlots(query: { date?: string; durationMinutes?: any }) {
    const { getMediaAvailability } = await import('./ops.availability');
    const date = query.date || new Date().toISOString().slice(0, 10);
    return (await getMediaAvailability({ date, durationMinutes: query.durationMinutes || 60 })).slots;
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

