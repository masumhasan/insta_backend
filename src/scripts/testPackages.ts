// Run: npx ts-node src/scripts/testPackages.ts
// Creates one throwaway package per tab (media / open_house / for_sale) as an Admin through the real app,
// checks they come back in the right category with their linked services, then deletes them.
import assert from 'node:assert/strict';
import http from 'http';
import mongoose from 'mongoose';
import app from '../app';
import { connectDatabase } from '../config/database';
import { User } from '../modules/auth/user.model';
import { Package } from '../modules/catalog/package.model';

const TITLE = 'guardtest package';

(async () => {
  await connectDatabase();
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const admin: any = await User.findOne({ role: 'Admin', status: { $nin: ['blocked', 'pending_approval', 'rejected'] } });
  assert.ok(admin, 'needs an Admin user in the database');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.generateAccessToken()}` };
  const call = async (method: string, path: string, body?: any) => {
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
  };

  try {
    const made: Record<string, string> = {};
    for (const category of ['media', 'open_house', 'for_sale']) {
      const r = await call('POST', '/catalog/packages', {
        title: `${TITLE} ${category}`,
        price: 12.5,
        category,
        visibility: 'everyone', // older portal builds send this; it must be stored as "all"
        linkedServices: [{ id: 'svc-1', name: 'Shoe Covers', price: 5, active: true }],
        features: [{ name: 'Feature A' }],
      });
      assert.equal(r.status, 201, `create ${category}: ${JSON.stringify(r.json)}`);
      made[category] = r.json.data.id;
    }

    const list = await call('GET', '/catalog/packages');
    for (const [category, id] of Object.entries(made)) {
      const p = list.json.data.find((x: any) => x.id === id);
      assert.ok(p, `${category} package is listed`);
      assert.equal(p.category, category, `${category} keeps its category`);
      assert.equal(p.visibility, 'all', 'visibility "everyone" is stored as "all"');
      assert.equal(p.linkedServices.length, 1, 'linked services are saved');
      assert.equal(p.linkedServices[0].name, 'Shoe Covers');
    }

    // Editing keeps the category and can change the linked services.
    const edit = await call('PATCH', `/catalog/packages/${made.open_house}`, { price: 20, linkedServices: [] });
    assert.equal(edit.status, 200);
    const after = (await call('GET', '/catalog/packages')).json.data.find((x: any) => x.id === made.open_house);
    assert.equal(after.category, 'open_house');
    assert.equal(after.price, 20);
    assert.equal(after.linkedServices.length, 0);

    // A package saved before categories existed is filed by its title.
    const legacy = await Package.create({ title: `${TITLE} Open House legacy`, price: 1 });
    await Package.updateOne({ _id: legacy._id }, { $unset: { category: '' } });
    const l = (await call('GET', '/catalog/packages')).json.data.find((x: any) => x.id === String(legacy._id));
    assert.equal(l.category, 'open_house', 'legacy package falls back to its title');

    console.log('package tests passed');
  } finally {
    await Package.deleteMany({ title: new RegExp(`^${TITLE}`) });
    server.close();
    await mongoose.disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
