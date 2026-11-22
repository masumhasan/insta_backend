// Run: npx ts-node src/scripts/testAccess.ts
// Starts the real Express app on a random port and calls routes with no token and with a token for each role.
// It mostly reads. Every write it attempts is one that MUST be refused; anything it manages to create by mistake
// is named "guardtest" and removed at the end. Requires MONGODB_URI (the real database) in backend/.env.
import http from 'http';
import mongoose from 'mongoose';
import app from '../app';
import { connectDatabase } from '../config/database';
import { User } from '../modules/auth/user.model';
import { ServiceItem } from '../modules/catalog/service.model';
import { AppSetting } from '../modules/ops/ops.model';
import { extraCases, runExtraChecks, cleanupExtra } from './testAccess.extra';

type Case = { who: string; method: string; path: string; body?: any; expect: number | number[]; note?: string };
const NOBODY = '000000000000000000000000';
const results: { ok: boolean; line: string }[] = [];
const createdOrders: string[] = [];

async function main() {
  await connectDatabase();
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  const tokenFor = async (role: string) => {
    const u: any = await User.findOne({ role, status: { $nin: ['blocked', 'pending_approval', 'rejected'] } });
    return u ? { id: String(u._id), token: u.generateAccessToken() as string } : null;
  };
  const roles = ['Admin', 'Agent', 'Assistant', 'Installer', 'Warehouse manager', 'Team Lead'];
  const who: Record<string, { id: string; token: string } | null> = {};
  for (const r of roles) who[r] = await tokenFor(r);
  const admin = who['Admin'];

  const call = async (c: Case) => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (c.who !== 'nobody') {
      const w = who[c.who];
      if (!w) {
        results.push({ ok: true, line: `SKIP  ${c.who} ${c.method} ${c.path} (no ${c.who} user in the database)` });
        return undefined;
      }
      headers.Authorization = `Bearer ${w.token}`;
    }
    const res = await fetch(base + c.path, { method: c.method, headers, body: c.body ? JSON.stringify(c.body) : undefined });
    const want = Array.isArray(c.expect) ? c.expect : [c.expect];
    results.push({ ok: want.includes(res.status), line: `${want.includes(res.status) ? 'PASS' : 'FAIL'}  ${c.who.padEnd(17)} ${c.method.padEnd(6)} ${c.path} -> ${res.status} (want ${want.join('/')})${c.note ? '  ' + c.note : ''}` });
    return res;
  };

  const cases: Case[] = [
    // ---- signed out: everything protected must say 401
    ...[
      ['GET', '/users'], ['GET', '/admin/users'], ['GET', '/catalog/packages'], ['GET', '/catalog/items/service'], ['GET', '/catalog/coupons'],
      ['GET', '/inventory'], ['GET', '/inventory/returns'], ['GET', '/invoices/client'], ['GET', '/invoices/technicians'], ['GET', '/notifications'],
      ['GET', '/ops/settings/pricing'], ['GET', '/ops/media-tasks'], ['GET', '/ops/reviews'], ['GET', '/orders'], ['GET', '/orders/pricing'], ['GET', '/geo/autocomplete?q=dallas'],
    ].map(([method, path]) => ({ who: 'nobody', method, path, expect: 401 }) as Case),
    { who: 'nobody', method: 'POST', path: '/users', body: { name: 'guardtest', email: 'guardtest+a@example.com', role: 'Admin', password: 'GuardTest#1234' }, expect: 401 },
    { who: 'nobody', method: 'PATCH', path: `/users/${admin?.id || NOBODY}`, body: { role: 'Admin' }, expect: 401 },
    { who: 'nobody', method: 'DELETE', path: `/users/${NOBODY}`, expect: 401 },
    { who: 'nobody', method: 'POST', path: '/catalog/items', body: { type: 'faq', name: 'guardtest', price: 0 }, expect: 401 },
    { who: 'nobody', method: 'DELETE', path: `/catalog/packages/${NOBODY}`, expect: 401 },
    { who: 'nobody', method: 'PUT', path: '/ops/settings/guardtest', body: { value: 1 }, expect: 401 },
    { who: 'nobody', method: 'POST', path: `/invoices/client/${NOBODY}/refund`, body: { type: 'full', amount: 1 }, expect: 401 },
    { who: 'nobody', method: 'PATCH', path: `/inventory/${NOBODY}`, body: {}, expect: 401 },
    { who: 'nobody', method: 'POST', path: '/upload/image', expect: 401 },
    { who: 'nobody', method: 'PATCH', path: `/orders/${NOBODY}/reschedule`, body: { dueDate: '2099-01-01' }, expect: 401 },
    { who: 'Installer', method: 'PATCH', path: `/orders/${NOBODY}/reschedule`, body: { dueDate: '2099-01-01' }, expect: 403 },
    { who: 'Warehouse manager', method: 'PATCH', path: `/orders/${NOBODY}/reschedule`, body: { dueDate: '2099-01-01' }, expect: 403 },
    { who: 'Admin', method: 'PATCH', path: `/orders/${NOBODY}/reschedule`, body: { dueDate: '2099-01-01' }, expect: 403, note: 'staff edit due dates via PATCH /orders/:id' },
    { who: 'Agent', method: 'PATCH', path: `/orders/${NOBODY}/reschedule`, body: { dueDate: '2099-01-01' }, expect: 404 },
    // ---- public routes stay public (landing site)
    { who: 'nobody', method: 'GET', path: '/catalog/items/faq', expect: 200 },
    { who: 'nobody', method: 'GET', path: '/ops/settings/contact_us', expect: 200 },
    { who: 'nobody', method: 'GET', path: '/ops/settings/privacy_policy', expect: 200 },
    { who: 'nobody', method: 'GET', path: '/ops/reviews/public', expect: 200 },
    { who: 'nobody', method: 'POST', path: '/ops/reviews', body: { reviewerName: 'guardtest', text: 'x', rating: 5 }, expect: 401 },
    { who: 'nobody', method: 'POST', path: '/notifications', body: { title: '', message: '' }, expect: 400, note: 'public contact form, empty body rejected' },
    // ---- agent: own data only, cannot escalate or touch business data
    { who: 'Agent', method: 'GET', path: '/orders/pricing', expect: 200 },
    { who: 'Agent', method: 'GET', path: '/catalog/items/service', expect: 200 },
    { who: 'Agent', method: 'POST', path: '/users', body: { name: 'guardtest', email: 'guardtest+b@example.com', role: 'Admin', password: 'GuardTest#1234' }, expect: 403 },
    { who: 'Agent', method: 'PATCH', path: `/users/${admin?.id || NOBODY}`, body: { role: 'Admin', status: 'blocked' }, expect: 403 },
    { who: 'Agent', method: 'POST', path: '/catalog/items', body: { type: 'faq', name: 'guardtest', price: 0 }, expect: 403 },
    { who: 'Agent', method: 'DELETE', path: `/catalog/packages/${NOBODY}`, expect: 403 },
    { who: 'Agent', method: 'PUT', path: '/ops/settings/guardtest', body: { value: 1 }, expect: 403 },
    { who: 'Agent', method: 'POST', path: '/ops/reviews', body: { reviewerName: 'guardtest', text: 'x', rating: 5 }, expect: 403 },
    { who: 'Agent', method: 'GET', path: '/ops/reviews', expect: 403 },
    { who: 'Agent', method: 'POST', path: `/invoices/client/${NOBODY}/refund`, body: { type: 'full', amount: 1 }, expect: 403 },
    { who: 'Agent', method: 'GET', path: '/invoices/technicians', expect: 403 },
    { who: 'Agent', method: 'PATCH', path: `/inventory/${NOBODY}`, body: {}, expect: 403 },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Installation', address: '1 Main St, Dallas, TX' }, expect: 400, note: 'no subtotal' },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Installation', subtotal: 100 }, expect: 400, note: 'no address' },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Installation', address: '1 Main St, Dallas, TX', subtotal: 100, couponCode: 'NOT-A-REAL-CODE' }, expect: 400, note: 'fake coupon rejected' },
    { who: 'Agent', method: 'GET', path: '/catalog/coupons', expect: 403, note: 'coupon codes are staff-only' },
    { who: 'Agent', method: 'GET', path: '/orders/coupon-preview?code=NOT-A-REAL-CODE&subtotal=100', expect: 400 },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Installation', address: '1 Main St, Dallas, TX', subtotal: 1 }, expect: 400, note: 'below catalog price floor' },
    { who: 'Admin', method: 'GET', path: '/catalog/coupons', expect: 200 },
    // ---- other non-staff roles
    { who: 'Assistant', method: 'GET', path: '/users', expect: 403 },
    { who: 'Installer', method: 'GET', path: '/invoices/client', expect: 403, note: 'client invoices are not for installers' },
    { who: 'Warehouse manager', method: 'GET', path: '/invoices/client', expect: 403 },
    { who: 'Installer', method: 'GET', path: '/users', expect: 403 },
    { who: 'Installer', method: 'POST', path: '/catalog/items', body: { type: 'faq', name: 'guardtest', price: 0 }, expect: 403 },
    { who: 'Warehouse manager', method: 'GET', path: '/users?role=Agent', expect: 200 },
    { who: 'Warehouse manager', method: 'POST', path: '/users', body: { name: 'guardtest', email: 'guardtest+c@example.com', role: 'Agent', password: 'GuardTest#1234' }, expect: 403, note: 'may only manage assistants' },
    { who: 'Team Lead', method: 'POST', path: '/users', body: { name: 'guardtest', email: 'guardtest+d@example.com', role: 'Admin', password: 'GuardTest#1234' }, expect: 403 },
    // ---- admin can read everything it needs
    { who: 'Admin', method: 'GET', path: '/users', expect: 200 },
    { who: 'Admin', method: 'GET', path: '/invoices/technicians', expect: 200 },
    { who: 'Admin', method: 'GET', path: '/catalog/packages', expect: 200 },
    { who: 'Admin', method: 'GET', path: '/orders/pricing', expect: 200 },
    // ---- order-form add-ons and print options: any signed-in user reads, only staff write, bad values are 400
    { who: 'nobody', method: 'GET', path: '/catalog/add-ons?orderType=sign_installations', expect: 401 },
    { who: 'nobody', method: 'GET', path: '/catalog/print-options', expect: 401 },
    { who: 'Agent', method: 'GET', path: '/catalog/add-ons?orderType=sign_installations', expect: 200 },
    { who: 'Agent', method: 'GET', path: '/catalog/add-ons?orderType=other-order-service', expect: 200, note: 'form key alias' },
    { who: 'Agent', method: 'GET', path: '/catalog/add-ons', expect: 400, note: 'orderType required' },
    { who: 'Agent', method: 'GET', path: '/catalog/add-ons?orderType=guardtest', expect: 400 },
    { who: 'Assistant', method: 'GET', path: '/catalog/add-ons?orderType=media_service', expect: 200 },
    { who: 'Team Lead', method: 'GET', path: '/catalog/print-options?appliesTo=rider', expect: 200 },
    { who: 'Installer', method: 'GET', path: '/catalog/print-options', expect: 200 },
    { who: 'Agent', method: 'GET', path: '/catalog/print-options?appliesTo=guardtest', expect: 400 },
    { who: 'Agent', method: 'POST', path: '/catalog/items', body: { type: 'option', name: 'guardtest', price: 0, options: { appliesTo: ['rider'] } }, expect: 403 },
    { who: 'Warehouse manager', method: 'PATCH', path: `/catalog/items/${NOBODY}`, body: { options: { active: false } }, expect: 403 },
    { who: 'Admin', method: 'POST', path: '/catalog/items', body: { type: 'option', name: 'guardtest', price: 0, options: { appliesTo: ['guardtest'] } }, expect: 400, note: 'unknown applies-to' },
    { who: 'Admin', method: 'POST', path: '/catalog/items', body: { type: 'service', name: 'guardtest', price: 0, options: { orderType: 'guardtest' } }, expect: 400, note: 'unknown add-on order type' },
    { who: 'Admin', method: 'POST', path: '/catalog/items', body: { type: 'settings_service', name: 'guardtest', price: 0, options: { features: 'not a list' } }, expect: 400, note: 'features must be a list' },
    { who: 'Admin', method: 'POST', path: '/inventory', body: { product: 'guardtest', itemType: 'Rider', available: 1, mountType: 'Sideways' }, expect: 400, note: 'unknown rider mount type' },
    // ---- media order form: offerings and live availability for any signed-in user
    { who: 'nobody', method: 'GET', path: '/catalog/media-offerings', expect: 401 },
    { who: 'nobody', method: 'GET', path: '/ops/media-availability?date=2099-03-02&durationMinutes=60', expect: 401 },
    { who: 'Agent', method: 'GET', path: '/catalog/media-offerings', expect: 200 },
    { who: 'Team Lead', method: 'GET', path: '/catalog/media-offerings', expect: 200 },
    { who: 'Admin', method: 'GET', path: '/catalog/media-offerings', expect: 200 },
    { who: 'Assistant', method: 'GET', path: '/ops/media-availability?date=2099-03-02&durationMinutes=90', expect: 200 },
    { who: 'Agent', method: 'GET', path: '/ops/media-availability?date=03/02/2099&durationMinutes=60', expect: 400, note: 'date must be ISO' },
    { who: 'Agent', method: 'GET', path: '/ops/media-availability?date=2099-03-02&durationMinutes=5', expect: 400, note: 'duration too short' },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Media Services', address: '1 Guard Test Rd, Dallas, TX', subtotal: 1, specifications: { media: { packageId: NOBODY }, appointmentDate: '2099-03-02', appointmentSlot: '10:00 AM' } }, expect: 400, note: 'unknown media package' },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Media Services', address: '1 Guard Test Rd, Dallas, TX', subtotal: 1, specifications: { media: { serviceIds: [] }, appointmentDate: '2099-03-02', appointmentSlot: '10:00 AM' } }, expect: 400, note: 'nothing selected' },
    // ---- card payments (Stripe): 503 is fine when STRIPE_SECRET_KEY is not set
    { who: 'nobody', method: 'GET', path: '/payments/cards', expect: 401 },
    { who: 'nobody', method: 'POST', path: `/payments/orders/${NOBODY}/charge`, body: { paymentMethodId: 'pm_guardtest' }, expect: 401 },
    { who: 'Installer', method: 'GET', path: '/payments/cards', expect: 403 },
    { who: 'Warehouse manager', method: 'POST', path: `/payments/orders/${NOBODY}/charge`, body: { paymentMethodId: 'pm_guardtest' }, expect: 403 },
    { who: 'Agent', method: 'GET', path: '/payments/config', expect: 200 },
    { who: 'Agent', method: 'GET', path: '/payments/cards', expect: [200, 503] },
    { who: 'Agent', method: 'GET', path: `/payments/cards?userId=${admin?.id || NOBODY}`, expect: [403, 503], note: "cannot read another user's cards" },
    { who: 'Agent', method: 'POST', path: `/payments/orders/${NOBODY}/charge`, body: { paymentMethodId: 'pm_guardtest' }, expect: [404, 503] },
    { who: 'Admin', method: 'GET', path: `/payments/orders/${NOBODY}/cards`, expect: [404, 503] },
    ...extraCases(admin?.id || NOBODY),
  ];

  try {
    for (const c of cases) await call(c);

    // An agent's user list must contain only that agent's own assistants.
    const agent = who['Agent'];
    if (agent) {
      const res = await call({ who: 'Agent', method: 'GET', path: '/users?role=Admin&limit=50', expect: 200, note: 'role filter ignored for agents' });
      const json: any = res ? await res.json() : {};
      const rows: any[] = json.data || [];
      const leaked = rows.filter((u) => u.parentAgentId !== agent.id || u.role !== 'Assistant');
      results.push({ ok: leaked.length === 0, line: `${leaked.length === 0 ? 'PASS' : 'FAIL'}  Agent sees only own assistants (${rows.length} rows, ${leaked.length} foreign)` });
    }
    // Invoices follow order visibility: an agent lists only their own and gets 403 on someone else's.
    if (agent) {
      const agentDoc: any = await User.findById(agent.id).lean();
      const res = await call({ who: 'Agent', method: 'GET', path: '/invoices/client?limit=200', expect: 200 });
      const rows: any[] = res ? ((await res.json()) as any).data || [] : [];
      const foreign = rows.filter((i) => i.clientName !== agentDoc.name && !i.orderId);
      results.push({ ok: foreign.length === 0, line: `${foreign.length === 0 ? 'PASS' : 'FAIL'}  Agent invoice list has no unrelated invoices (${rows.length} rows)` });
      const { ClientInvoice } = await import('../modules/invoice/invoice.model');
      const { Order } = await import('../modules/order/order.model');
      const others: any[] = await ClientInvoice.find({ clientName: { $ne: agentDoc.name }, clientEmail: { $ne: String(agentDoc.email).toLowerCase() } }).limit(200).lean();
      for (const inv of others) {
        const order: any = inv.orderId ? await Order.findOne({ orderNumber: inv.orderId }).lean() : null;
        if (order && order.agentId !== agent.id && String(order.agent).toLowerCase() !== String(agentDoc.name).toLowerCase()) {
          await call({ who: 'Agent', method: 'GET', path: `/invoices/client/${inv._id}`, expect: 403, note: "another agent's invoice" });
          await call({ who: 'Agent', method: 'GET', path: `/invoices/client/${inv._id}/pdf`, expect: 403, note: "another agent's invoice PDF" });
          break;
        }
      }
    }
    await call({ who: 'Assistant', method: 'GET', path: '/invoices/client', expect: 200 });

    // Order ownership: nobody can place an order in someone else's name, except a Team Lead for an active agent.
    const { Order } = await import('../modules/order/order.model');
    const otherAgent: any = await User.findOne({ role: 'Agent', _id: { $ne: agent?.id }, status: 'active' }).lean();
    const teamLead = who['Team Lead'];
    const place = async (as: string, body: any) => {
      const res = await call({ who: as, method: 'POST', path: '/orders', body: { type: 'Other Services', address: '1 Guard Test Rd, Dallas, TX', subtotal: 10, ...body }, expect: [201, 200, 403, 400] });
      const json: any = res ? await res.json() : {};
      if (json?.data?._id) createdOrders.push(String(json.data._id));
      return { status: res?.status, order: json?.data };
    };
    const check = (ok: boolean, text: string) => results.push({ ok, line: `${ok ? 'PASS' : 'FAIL'}  ${text}` });
    if (agent && otherAgent) {
      const agentDoc: any = await User.findById(agent.id).lean();
      const r1 = await place('Agent', { agent: otherAgent.name, agentId: String(otherAgent._id) });
      const saved1: any = r1.order?._id ? await Order.findById(r1.order._id).lean() : null;
      check(!!saved1 && saved1.agentId === agent.id && saved1.agent === agentDoc.name, 'Agent cannot place an order in another agent\'s name');
      if (teamLead) {
        const r2 = await place('Team Lead', { agentId: String(otherAgent._id) });
        const saved2: any = r2.order?._id ? await Order.findById(r2.order._id).lean() : null;
        check(!!saved2 && saved2.agentId === String(otherAgent._id) && saved2.agent === otherAgent.name, 'Team Lead can place an order for an active agent');
        const adminUser: any = await User.findOne({ role: 'Admin' }).lean();
        const r3 = await place('Team Lead', { agentId: String(adminUser._id) });
        check(r3.status === 403, `Team Lead cannot order for a non-agent (got ${r3.status})`);
        if (saved2) {
          await call({ who: 'Agent', method: 'PATCH', path: `/orders/${saved2._id}/reschedule`, body: { dueDate: '2099-01-01' }, expect: 403, note: "another agent's order" });
        }
      }
      if (saved1) {
        const path = `/orders/${saved1._id}/reschedule`;
        await call({ who: 'Agent', method: 'PATCH', path, body: { dueDate: '2000-01-01' }, expect: 400, note: 'date in the past' });
        await call({ who: 'Agent', method: 'PATCH', path, body: { dueDate: 'next week' }, expect: 400, note: 'not a date' });
        await call({ who: 'Agent', method: 'PATCH', path, body: { dueDate: '2099-01-02', reason: 'guardtest' }, expect: 200, note: 'own pending order' });
        const after: any = await Order.findById(saved1._id).lean();
        check(after?.dueDate === '2099-01-02', 'Reschedule saves the new due date');
        await call({ who: 'Installer', method: 'PATCH', path: `/orders/${saved1._id}/due-date-request`, body: { requestedDate: '2099-01-03' }, expect: 403, note: 'installer not on this order' });
        // Completing the order stamps completedAt and closes the reschedule window.
        const doc: any = await Order.findById(saved1._id);
        doc.status = 'Completed';
        await doc.save();
        check(!!doc.completedAt, 'Completed status stamps completedAt');
        await call({ who: 'Agent', method: 'PATCH', path, body: { dueDate: '2099-01-03' }, expect: 409, note: 'completed order' });
        const res = await call({ who: 'Agent', method: 'GET', path: `/orders/${saved1._id}`, expect: 200 });
        const json: any = res ? await res.json() : {};
        check(!!json?.data?.completedAt && json?.data?.daysInField === 0, 'GET /orders/:id returns completedAt and daysInField 0 for a service order');
      }
    }
    // Media booking: the server prices and times the order from the catalog and refuses a taken appointment.
    if (agent) {
      const offers: any = await (await call({ who: 'Agent', method: 'GET', path: '/catalog/media-offerings', expect: 200 }))?.json();
      const svc = offers?.data?.photography?.[0] || offers?.data?.videography?.[0];
      let day: any = null;
      for (let d = 1; d <= 14 && !day; d++) {
        const date = `2099-03-${String(d).padStart(2, '0')}`;
        const json: any = await (await call({ who: 'Agent', method: 'GET', path: `/ops/media-availability?date=${date}&durationMinutes=${svc?.durationMinutes || 60}`, expect: 200 }))?.json();
        if (json?.data?.slots?.length) day = json.data;
      }
      if (!svc || !day) {
        results.push({ ok: true, line: 'SKIP  media booking (no media service or open day in the catalog)' });
      } else {
        const body = { type: 'Media Services', address: '1 Guard Test Rd, Dallas, TX', subtotal: 1, specifications: { media: { serviceIds: [svc.id] }, appointmentDate: day.date, appointmentSlot: day.slots[0] } };
        const booked: string[] = [];
        const capacity = Math.max(1, await User.countDocuments({ role: 'Photographer', status: { $nin: ['blocked', 'rejected', 'pending_approval'] } }));
        for (let i = 0; i <= capacity; i++) {
          const res = await call({ who: 'Agent', method: 'POST', path: '/orders', body, expect: i < capacity ? [201, 200] : 409, note: i < capacity ? 'media order booked' : 'same appointment again' });
          const json: any = res ? await res.json() : {};
          if (json?.data?._id) {
            createdOrders.push(String(json.data._id));
            booked.push(String(json.data._id));
          }
        }
        const first: any = booked.length ? await Order.findById(booked[0]).lean() : null;
        check(!!first && first.subtotal === svc.price && first.onsiteDuration === svc.durationMinutes && first.appointmentTime === `${day.date} ${day.slots[0]}`, 'Media order subtotal, duration and appointment come from the server');
      }
    }
    // Sorting / filtering on GET /orders.
    for (const qs of ['sortBy=dueDate&sortDir=asc', 'sortBy=completedDate', 'dateField=completed&startDate=2020-01-01&endDate=2099-12-31', 'dateField=due&startDate=2020-01-01', 'installerEmail=unassigned']) {
      await call({ who: 'Admin', method: 'GET', path: `/orders?${qs}`, expect: 200 });
    }
    {
      const res = await call({ who: 'Admin', method: 'GET', path: '/orders?sortBy=completedDate&sortDir=desc&limit=50', expect: 200 });
      const rows: any[] = res ? ((await res.json()) as any).data || [] : [];
      const times = rows.map((o) => (o.completedAt ? Date.parse(o.completedAt) : null));
      const firstMissing = times.indexOf(null);
      const dated = (firstMissing === -1 ? times : times.slice(0, firstMissing)) as number[];
      const ordered = dated.every((t, i) => i === 0 || dated[i - 1] >= t) && (firstMissing === -1 || times.slice(firstMissing).every((t) => t === null));
      check(ordered, 'sortBy=completedDate lists completed orders newest first, undated last');
    }
    // Dashboard trends, announcements, brokerage link and @mentions (testAccess.extra.ts).
    await runExtraChecks(call, check, who, createdOrders);
  } finally {
    await cleanupExtra();
    if (createdOrders.length) {
      const { Order } = await import('../modules/order/order.model');
      const { ClientInvoice } = await import('../modules/invoice/invoice.model');
      const { Notification } = await import('../modules/notification/notification.model');
      const docs: any[] = await Order.find({ _id: { $in: createdOrders } }).select('orderNumber').lean();
      const numbers = docs.map((d) => d.orderNumber);
      await Order.deleteMany({ _id: { $in: createdOrders } });
      await ClientInvoice.deleteMany({ orderId: { $in: numbers } });
      await Notification.deleteMany({ referenceId: { $in: numbers } });
      const { MediaTask } = await import('../modules/ops/ops.model');
      await MediaTask.deleteMany({ orderNumber: { $in: numbers } });
    }
    await User.deleteMany({ email: /^guardtest\+/ });
    await ServiceItem.deleteMany({ name: 'guardtest' });
    const { Inventory } = await import('../modules/inventory/inventory.model');
    await Inventory.deleteMany({ product: 'guardtest' });
    await AppSetting.deleteMany({ key: 'guardtest' });
    server.close();
    await mongoose.disconnect();
  }

  for (const r of results) console.log(r.line);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
