import { ServiceItem } from './service.model';
import { AppError } from '../../utils/apiError';

/**
 * Announcements (ServiceItem type "announcement"). options: { audience, active, startsAt, endsAt, noEndDate }.
 * Audience groups: "everyone", "customers" (Agent, Assistant, Team Lead / office) and "personnel" (Sign company,
 * Office Manager, Admin, Installer / Photographer, Warehouse manager). Older rows may hold portal keys instead.
 */
export const ANNOUNCEMENT_AUDIENCES = ['everyone', 'customers', 'personnel'] as const;
const LEGACY_KEYS = ['all', 'agent', 'assistant', 'team_lead', 'sign_company', 'warehouse', 'installer'];

const CUSTOMER_ROLES = ['Agent', 'Assistant', 'Team Lead'];
const PORTAL_KEY: Record<string, string> = {
  Agent: 'agent',
  Assistant: 'assistant',
  'Team Lead': 'team_lead',
  Admin: 'sign_company',
  'Sign company': 'sign_company',
  'Office Manager': 'sign_company',
  'Warehouse manager': 'warehouse',
  Installer: 'installer',
  Photographer: 'installer',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 3600 * 1000;

const audienceList = (o: any): string[] => (Array.isArray(o?.audience) && o.audience.length ? o.audience.map(String) : ['everyone']);

/** Whether a signed-in user with `role` is in the announcement's audience. */
export function isForRole(options: any, role: string): boolean {
  const audience = audienceList(options);
  if (audience.includes('everyone') || audience.includes('all')) return true;
  const group = CUSTOMER_ROLES.includes(role) ? 'customers' : PORTAL_KEY[role] ? 'personnel' : '';
  return (!!group && audience.includes(group)) || (!!PORTAL_KEY[role] && audience.includes(PORTAL_KEY[role]));
}

/** Live on `now`: published, started, and not past its end date (the end date is inclusive). */
export function isLive(options: any, now = new Date()): boolean {
  const o = options || {};
  if (o.active === false) return false;
  if (o.startsAt && new Date(o.startsAt) > now) return false;
  if (!o.noEndDate && o.endsAt && new Date(new Date(o.endsAt).getTime() + DAY_MS) <= now) return false;
  return true;
}

/** Checks and tidies announcement options on create/update (400 on a bad audience or date range). */
export function normaliseAnnouncementOptions(o: any) {
  const out = { ...o };
  if (out.audience !== undefined) {
    const list = (Array.isArray(out.audience) ? out.audience : [out.audience]).map((a: unknown) => String(a).trim()).filter(Boolean);
    const allowed: string[] = [...ANNOUNCEMENT_AUDIENCES, ...LEGACY_KEYS];
    const bad = list.find((a: string) => !allowed.includes(a));
    if (bad) throw new AppError(`Audience must be one of: ${ANNOUNCEMENT_AUDIENCES.join(', ')}.`, 400);
    out.audience = list.length ? list : ['everyone'];
  }
  for (const k of ['startsAt', 'endsAt']) {
    if (out[k] === undefined || out[k] === null) continue;
    out[k] = String(out[k]).trim();
    if (out[k] && !DATE_RE.test(out[k])) throw new AppError(`${k} must be a date (YYYY-MM-DD).`, 400);
  }
  if (out.noEndDate !== undefined) out.noEndDate = out.noEndDate === true || out.noEndDate === 'true';
  if (out.noEndDate) out.endsAt = '';
  if (out.startsAt && out.endsAt && out.endsAt < out.startsAt) throw new AppError('The end date cannot be before the start date.', 400);
  return out;
}

/** Every announcement that is live now and meant for this user's role, newest first. */
export async function listActiveAnnouncements(role: string) {
  const now = new Date();
  const items = await ServiceItem.find({ type: 'announcement' }).sort({ createdAt: -1 }).lean();
  return items
    .filter((i: any) => isLive(i.options, now) && isForRole(i.options, role))
    .map((i: any) => ({
      id: i._id.toString(),
      title: i.name,
      message: i.description || '',
      imageUrl: i.imageUrl || i.options?.imageUrl || '',
      startsAt: i.options?.startsAt || '',
      endsAt: i.options?.noEndDate ? '' : i.options?.endsAt || '',
      createdAt: i.createdAt,
    }));
}
