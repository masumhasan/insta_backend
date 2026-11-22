import { User } from '../auth/user.model';
import { Notification } from './notification.model';

/** Internal personnel that can be @mentioned in notes: staff plus the field and warehouse team. */
export const PERSONNEL_ROLES = ['Admin', 'Sign company', 'Office Manager', 'Installer', 'Photographer', 'Warehouse manager'];

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export type MentionedUser = { id: string; name: string; email: string; role: string };

/**
 * Personnel tagged in a note. When the client sends `ids` (MentionTextarea), each one is kept only while its
 * "@Full Name" is still in the text. Without ids, older "@handle" tokens (first name, name without spaces or the
 * email's local part) are matched instead, one person per handle.
 */
export async function extractMentions(text: unknown, ids?: unknown): Promise<MentionedUser[]> {
  const body = String(text ?? '');
  if (!body.includes('@')) return [];
  const wanted = Array.from(new Set((Array.isArray(ids) ? ids : []).map(String).filter((id) => OBJECT_ID.test(id))));
  const people: any[] = await User.find({ role: { $in: PERSONNEL_ROLES }, status: 'active' }).select('name email role').lean();
  const lower = body.toLowerCase();
  const toMention = (u: any): MentionedUser => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

  if (wanted.length) {
    return people
      .filter((u) => wanted.includes(String(u._id)) && lower.includes(`@${String(u.name || '').toLowerCase()}`))
      .map(toMention);
  }

  const handles = Array.from(new Set((body.match(/@([A-Za-z0-9_.-]+)/g) || []).map((m) => m.slice(1).toLowerCase())));
  const found = new Map<string, MentionedUser>();
  for (const h of handles) {
    const u = people.find((p) => {
      const name = String(p.name || '').toLowerCase();
      return name.replace(/\s+/g, '') === h || name.split(/\s+/)[0] === h || String(p.email || '').toLowerCase().split('@')[0] === h;
    });
    if (u) found.set(String(u._id), toMention(u));
  }
  return Array.from(found.values());
}

type NotifyOptions = {
  text: string;
  /** Ids from the client, or already-resolved mentions from extractMentions. */
  mentions?: unknown;
  resolved?: MentionedUser[];
  author: { id?: string; name?: string };
  /** What the note is on, e.g. "order ORD-1024" (used in the title). */
  context?: string;
  /** Path of the record in the staff portals, e.g. /users/agents/<id>. */
  link?: string;
  referenceId?: string;
};

/** One "mention" notification per tagged person (never the author). Only that person sees it. Returns their ids. */
export async function notifyMentions(opts: NotifyOptions): Promise<string[]> {
  const people = opts.resolved ?? (await extractMentions(opts.text, opts.mentions));
  const authorName = opts.author.name || 'A teammate';
  const notified: string[] = [];
  for (const p of people) {
    if (opts.author.id && p.id === String(opts.author.id)) continue;
    try {
      await Notification.create({
        recipientUserId: p.id,
        recipientEmail: String(p.email || '').toLowerCase(),
        recipientRole: '',
        title: `${authorName} mentioned you${opts.context ? ` on ${opts.context}` : ''}`,
        message: opts.text,
        type: 'mention',
        referenceId: opts.referenceId || '',
        link: opts.link || '',
        createdBy: authorName,
      });
      notified.push(p.id);
    } catch {
      /* a failed notification must not undo the note */
    }
  }
  return notified;
}
