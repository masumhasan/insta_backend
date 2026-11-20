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

type Case = { who: string; method: string; path: string; body?: any; expect: number | number[]; note?: string };
const NOBODY = '000000000000000000000000';
const results: { ok: boolean; line: string }[] = [];

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
      ['GET', '/ops/settings/pricing'], ['GET', '/ops/media-tasks'], ['GET', '/orders'], ['GET', '/orders/pricing'], ['GET', '/geo/autocomplete?q=dallas'],
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
    // ---- public routes stay public (landing site)
    { who: 'nobody', method: 'GET', path: '/catalog/items/faq', expect: 200 },
    { who: 'nobody', method: 'GET', path: '/ops/settings/contact_us', expect: 200 },
    { who: 'nobody', method: 'GET', path: '/ops/settings/privacy_policy', expect: 200 },
    { who: 'nobody', method: 'POST', path: '/notifications', body: { title: '', message: '' }, expect: 400, note: 'public contact form, empty body rejected' },
    // ---- agent: own data only, cannot escalate or touch business data
    { who: 'Agent', method: 'GET', path: '/orders/pricing', expect: 200 },
    { who: 'Agent', method: 'GET', path: '/catalog/items/service', expect: 200 },
    { who: 'Agent', method: 'POST', path: '/users', body: { name: 'guardtest', email: 'guardtest+b@example.com', role: 'Admin', password: 'GuardTest#1234' }, expect: 403 },
    { who: 'Agent', method: 'PATCH', path: `/users/${admin?.id || NOBODY}`, body: { role: 'Admin', status: 'blocked' }, expect: 403 },
    { who: 'Agent', method: 'POST', path: '/catalog/items', body: { type: 'faq', name: 'guardtest', price: 0 }, expect: 403 },
    { who: 'Agent', method: 'DELETE', path: `/catalog/packages/${NOBODY}`, expect: 403 },
    { who: 'Agent', method: 'PUT', path: '/ops/settings/guardtest', body: { value: 1 }, expect: 403 },
    { who: 'Agent', method: 'POST', path: `/invoices/client/${NOBODY}/refund`, body: { type: 'full', amount: 1 }, expect: 403 },
    { who: 'Agent', method: 'GET', path: '/invoices/technicians', expect: 403 },
    { who: 'Agent', method: 'PATCH', path: `/inventory/${NOBODY}`, body: {}, expect: 403 },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Installation', address: '1 Main St, Dallas, TX' }, expect: 400, note: 'no subtotal' },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Installation', subtotal: 100 }, expect: 400, note: 'no address' },
    { who: 'Agent', method: 'POST', path: '/orders', body: { type: 'Installation', address: '1 Main St, Dallas, TX', subtotal: 100, couponCode: 'NOT-A-REAL-CODE' }, expect: 400, note: 'fake coupon rejected' },
    // ---- other non-staff roles
    { who: 'Assistant', method: 'GET', path: '/users', expect: 403 },
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
  } finally {
    await User.deleteMany({ email: /^guardtest\+/ });
    await ServiceItem.deleteMany({ name: 'guardtest' });
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
