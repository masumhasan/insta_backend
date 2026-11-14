import { Notification } from './notification.model';
import { User } from '../auth/user.model';

function buildRecipientFilter(query: { userId?: string; email?: string; role?: string }) {
  const orClauses: any[] = [];
  if (query.userId) orClauses.push({ recipientUserId: query.userId });
  if (query.email) orClauses.push({ recipientEmail: query.email.toLowerCase() });
  if (query.role) {
    const roleLower = query.role.toLowerCase();
    orClauses.push({ recipientRole: { $regex: `^${query.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (roleLower === 'admin' || roleLower === 'super admin') {
      orClauses.push({ recipientRole: 'Sign company' });
    }
  }
  return orClauses.length > 0 ? { $or: [...orClauses, { recipientRole: 'all' }] } : {};
}

export class NotificationService {
  static async getNotifications(query: { userId?: string; email?: string; role?: string; limit?: any }) {
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const filter = buildRecipientFilter(query);
    const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

    return items.map((n: any) => ({
      id: n._id.toString(),
      _id: n._id.toString(),
      title: n.title,
      message: n.message,
      type: n.type,
      referenceId: n.referenceId || '',
      read: Boolean(n.read),
      createdBy: n.createdBy || 'System',
      createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  static async createNotification(payload: {
    recipientUserId?: string;
    recipientEmail?: string;
    recipientRole?: string;
    title: string;
    message: string;
    type?: 'mention' | 'order' | 'approval' | 'team_lead' | 'due_date' | 'system';
    referenceId?: string;
    createdBy?: string;
  }) {
    const doc = await Notification.create({
      recipientUserId: payload.recipientUserId || '',
      recipientEmail: (payload.recipientEmail || '').toLowerCase(),
      recipientRole: payload.recipientRole || 'all',
      title: payload.title,
      message: payload.message,
      type: payload.type || 'system',
      referenceId: payload.referenceId || '',
      createdBy: payload.createdBy || 'System',
    });
    return {
      id: doc._id.toString(),
      title: doc.title,
      message: doc.message,
      type: doc.type,
      referenceId: doc.referenceId || '',
      read: doc.read,
      createdBy: doc.createdBy || 'System',
      createdAt: doc.createdAt.toISOString(),
    };
  }

  static async safeNotify(payload: Parameters<typeof NotificationService.createNotification>[0]) {
    try {
      await this.createNotification(payload);
    } catch {
      /* do not interrupt core workflow if notification persistence fails */
    }
  }

  static async notifyMentions(text: string, authorName: string, referenceId: string = '') {
    const matches = Array.from(new Set((text.match(/@([A-Za-z0-9_.-]+)/g) || []).map((m) => m.slice(1))));
    if (matches.length === 0) return [];

    const users = await User.find({ status: { $ne: 'blocked' } }).select('name email role').lean();
    const created: any[] = [];

    for (const handle of matches) {
      const lower = handle.toLowerCase();
      const target = users.find(
        (u: any) =>
          u.name?.toLowerCase().replace(/\s+/g, '') === lower ||
          u.name?.toLowerCase().split(/\s+/)[0] === lower ||
          u.email?.toLowerCase().split('@')[0] === lower
      );
      if (target) {
        created.push(
          await this.createNotification({
            recipientUserId: target._id.toString(),
            recipientEmail: target.email,
            recipientRole: target.role,
            title: `Mentioned by ${authorName}`,
            message: text,
            type: 'mention',
            referenceId,
            createdBy: authorName,
          })
        );
      }
    }
    return created;
  }

  static async markRead(id: string) {
    const doc = await Notification.findByIdAndUpdate(id, { $set: { read: true } }, { new: true });
    return { id, read: Boolean(doc?.read ?? true) };
  }

  static async markAllRead(filterQuery: { userId?: string; email?: string; role?: string }) {
    const filter = buildRecipientFilter(filterQuery);
    await Notification.updateMany(filter, { $set: { read: true } });
    return true;
  }

  static async deleteNotification(id: string) {
    await Notification.findByIdAndDelete(id);
    return true;
  }
}
