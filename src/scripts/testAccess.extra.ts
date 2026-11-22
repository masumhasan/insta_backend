// Extra checks for testAccess.ts: dashboard trend granularity, announcements (audience + date window),
// agent brokerage link and @mentions in notes. Everything created is named "guardtest" and removed by cleanupExtra().
import { User } from '../modules/auth/user.model';
import { ServiceItem } from '../modules/catalog/service.model';
import { Notification } from '../modules/notification/notification.model';
import { designCases, runDesignChecks, cleanupDesign } from './testAccess.design';

type Call = (c: { who: string; method: string; path: string; body?: any; expect: number | number[]; note?: string }) => Promise<Response | undefined>;
type Check = (ok: boolean, text: string) => void;
const NOBODY = '000000000000000000000000';
const json = async (res?: Response): Promise<any> => (res ? res.json().catch(() => ({})) : {});

export const extraCases = (adminId: string) => [
  { who: 'nobody', method: 'GET', path: '/admin/dashboard-stats', expect: 401 },
  { who: 'Agent', method: 'GET', path: '/admin/dashboard-stats', expect: 403, note: 'business revenue is staff-only' },
  { who: 'Installer', method: 'GET', path: '/admin/dashboard-stats?granularity=daily', expect: 403 },
  { who: 'Admin', method: 'GET', path: '/admin/dashboard-stats?granularity=hourly', expect: 400 },
  { who: 'nobody', method: 'GET', path: '/catalog/announcements/active', expect: 401 },
  { who: 'Agent', method: 'GET', path: '/catalog/announcements/active', expect: 200 },
  { who: 'Warehouse manager', method: 'GET', path: '/catalog/announcements/active', expect: 200 },
  { who: 'Agent', method: 'GET', path: '/catalog/items/announcement', expect: 403, note: 'full list (all audiences) is staff-only' },
  { who: 'Installer', method: 'GET', path: '/catalog/items?type=announcement', expect: 403 },
  { who: 'Admin', method: 'GET', path: '/catalog/items/announcement', expect: 200 },
  { who: 'Agent', method: 'GET', path: '/catalog/items/brokerage', expect: 200 },
  { who: 'Agent', method: 'POST', path: '/catalog/items', body: { type: 'announcement', name: 'guardtest', price: 0, options: { audience: ['everyone'] } }, expect: 403 },
  { who: 'Admin', method: 'POST', path: '/catalog/items', body: { type: 'announcement', name: 'guardtest', price: 0, options: { audience: ['guardtest'] } }, expect: 400, note: 'unknown audience' },
  { who: 'Admin', method: 'POST', path: '/catalog/items', body: { type: 'announcement', name: 'guardtest', price: 0, options: { startsAt: '2099-02-01', endsAt: '2099-01-01' } }, expect: 400, note: 'end before start' },
  { who: 'nobody', method: 'GET', path: `/orders/${NOBODY}/notes`, expect: 401 },
  { who: 'Agent', method: 'GET', path: `/orders/${NOBODY}/notes`, expect: 403, note: 'internal notes are staff-only' },
  { who: 'Installer', method: 'POST', path: `/orders/${NOBODY}/notes`, body: { text: 'guardtest' }, expect: 403 },
  { who: 'Admin', method: 'GET', path: `/orders/${NOBODY}/notes`, expect: 404 },
  { who: 'Admin', method: 'POST', path: `/orders/${NOBODY}/notes`, body: { text: '  ' }, expect: 400 },
  { who: 'Agent', method: 'PATCH', path: `/users/${adminId}`, body: { brokerageId: NOBODY }, expect: 403 },
  { who: 'Agent', method: 'POST', path: `/users/${adminId}/crm-notes`, body: { text: 'guardtest' }, expect: 403 },
  // Custom design approval (testAccess.design.ts).
  ...designCases(),
];

export async function runExtraChecks(call: Call, check: Check, who: Record<string, { id: string } | null>, orderIds: string[]) {
  // Trend buckets per granularity.
  for (const [g, n] of [['daily', 30], ['monthly', 12], ['yearly', 5]] as const) {
    const body = await json(await call({ who: 'Admin', method: 'GET', path: `/admin/dashboard-stats?granularity=${g}`, expect: 200 }));
    const t = body?.data?.metrics?.trends;
    check(t?.granularity === g && t?.points?.length === n, `dashboard trends ${g} has ${n} buckets (got ${t?.points?.length})`);
  }

  // Announcements: audience groups and date window are enforced on the server.
  const add = async (options: any) =>
    (await json(await call({ who: 'Admin', method: 'POST', path: '/catalog/items', body: { type: 'announcement', name: 'guardtest', description: 'guardtest', price: 0, options }, expect: 201 })))?.data?.id;
  const ids = {
    personnel: await add({ audience: ['personnel'], startsAt: '2020-01-01', noEndDate: true, endsAt: '2020-01-02' }),
    customers: await add({ audience: ['customers'], startsAt: '2020-01-01', endsAt: '2099-01-01' }),
    ended: await add({ audience: ['everyone'], startsAt: '2020-01-01', endsAt: '2020-02-01' }),
    future: await add({ audience: ['everyone'], startsAt: '2099-01-01', noEndDate: true }),
  };
  const live = async (role: string) =>
    ((await json(await call({ who: role, method: 'GET', path: '/catalog/announcements/active', expect: 200 })))?.data || []).map((a: any) => a.id);
  if (who['Agent'] && who['Installer']) {
    const agentSees = await live('Agent');
    const installerSees = await live('Installer');
    check(agentSees.includes(ids.customers) && !agentSees.includes(ids.personnel), 'customers see customer announcements, not personnel ones');
    check(installerSees.includes(ids.personnel) && !installerSees.includes(ids.customers), 'installers see personnel announcements (no end date), not customer ones');
    check(![...agentSees, ...installerSees].some((id: string) => id === ids.ended || id === ids.future), 'ended and future announcements are hidden');
  }

  // Brokerage link: staff only, must be a brokerage catalog item.
  const guardEmail = `guardtest+e${Date.now()}@example.com`;
  const brokerage = (await json(await call({ who: 'Admin', method: 'POST', path: '/catalog/items', body: { type: 'brokerage', name: 'guardtest', price: 0 }, expect: 201 })))?.data?.id;
  const created = await json(await call({ who: 'Admin', method: 'POST', path: '/users', body: { name: 'guardtest agent', email: guardEmail, role: 'Agent', password: 'GuardTest#1234' }, expect: 201 }));
  const agentId = created?.data?.id;
  if (agentId && brokerage) {
    await call({ who: 'Admin', method: 'PATCH', path: `/users/${agentId}`, body: { brokerageId: NOBODY }, expect: 400, note: 'unknown brokerage' });
    await call({ who: 'Admin', method: 'PATCH', path: `/users/${agentId}`, body: { brokerageId: brokerage, phone: '555-0100' }, expect: 200 });
    let doc: any = await User.findById(agentId).lean();
    check(doc?.brokerageId === brokerage && doc?.brokerage === 'guardtest', 'staff can link an agent to a brokerage');
    if (who['Team Lead']) {
      await call({ who: 'Team Lead', method: 'PATCH', path: `/users/${agentId}`, body: { brokerageId: '', email: 'guardtest+f@example.com' }, expect: 200 });
      doc = await User.findById(agentId).lean();
      check(doc?.brokerageId === brokerage && doc?.email === guardEmail, 'Team Lead cannot change the brokerage link or email');
    }
  }

  // @mentions: only personnel are notified, only the mentioned person sees it, with a link to the record.
  const installer: any = who['Installer'] ? await User.findById(who['Installer'].id).lean() : null;
  const agentUser: any = who['Agent'] ? await User.findById(who['Agent'].id).lean() : null;
  if (agentId && installer && agentUser) {
    const text = `guardtest ping @${installer.name} and @${agentUser.name}`;
    await call({ who: 'Admin', method: 'POST', path: `/users/${agentId}/crm-notes`, body: { text, mentions: [String(installer._id), String(agentUser._id)] }, expect: 201 });
    const sent: any[] = await Notification.find({ type: 'mention', referenceId: String(agentId) }).lean();
    check(sent.length === 1 && sent[0].recipientUserId === String(installer._id) && sent[0].recipientRole === '' && sent[0].link === `/users/agents/${agentId}`,
      `CRM note mention notifies only the mentioned installer (${sent.length} sent)`);
    const doc: any = await User.findById(agentId).lean();
    check(JSON.stringify(doc?.activityNotes?.[0]?.mentions) === JSON.stringify([String(installer._id)]), 'CRM note stores the mentioned user ids');
  }
  if (installer && orderIds[0]) {
    const text = `guardtest status note for @${installer.name}`;
    await call({ who: 'Admin', method: 'POST', path: `/orders/${orderIds[0]}/notes`, body: { text, status: 'On Hold', mentions: [String(installer._id)] }, expect: 201 });
    const notes = await json(await call({ who: 'Admin', method: 'GET', path: `/orders/${orderIds[0]}/notes`, expect: 200 }));
    const n = notes?.data?.[0];
    check(n?.status === 'On Hold' && n?.mentions?.[0] === String(installer._id), 'order note stores status and mentions');
    const sent = await Notification.countDocuments({ type: 'mention', recipientUserId: String(installer._id), message: text });
    check(sent === 1, `order note mention creates one notification (${sent})`);
    const order = await json(await call({ who: 'Admin', method: 'GET', path: `/orders/${orderIds[0]}`, expect: 200 }));
    check(order?.data && order.data.noteLog === undefined, 'internal notes are not part of the order payload');
  }
  if (installer) {
    const inv = await json(await call({ who: 'Admin', method: 'POST', path: '/inventory', body: { product: 'guardtest', itemType: 'Sign Panel', available: 1 }, expect: [200, 201] }));
    const invId = inv?.data?._id;
    if (invId) {
      const notes = `guardtest restock for @${installer.name}`;
      for (let i = 0; i < 2; i++) {
        await call({ who: 'Admin', method: 'PATCH', path: `/inventory/${invId}`, body: { notes, notesMentions: [String(installer._id)] }, expect: 200 });
      }
      const sent = await Notification.countDocuments({ type: 'mention', recipientUserId: String(installer._id), message: notes });
      check(sent === 1, `inventory note mention notifies once, not on every save (${sent})`);
    }
  }

  // Custom design approval: owner-only answer, dispatch blocked until Ready to Install, inventory created once.
  await runDesignChecks(call, check, who, orderIds);
}

export async function cleanupExtra() {
  await cleanupDesign();
  await Notification.deleteMany({ type: 'mention', message: /guardtest/ });
  await ServiceItem.deleteMany({ name: 'guardtest' });
}
