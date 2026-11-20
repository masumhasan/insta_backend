// Run: npx ts-node src/scripts/testFieldFlow.ts
// Walks the installer workflow through the real app: allowed status steps, pull-list scanning, Ready for Install,
// and returns (scoping, review, stock). Uses throwaway records named "guardtest" and removes them at the end.
import assert from 'node:assert/strict';
import http from 'http';
import mongoose from 'mongoose';
import app from '../app';
import { connectDatabase } from '../config/database';
import { User } from '../modules/auth/user.model';
import { Order } from '../modules/order/order.model';
import { Inventory } from '../modules/inventory/inventory.model';
import { ReturnRecord } from '../modules/inventory/return.model';
import { Notification } from '../modules/notification/notification.model';

(async () => {
  await connectDatabase();
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const installers: any[] = await User.find({ role: 'Installer', status: 'active' }).limit(2);
  assert.ok(installers.length >= 2, 'needs two active installers');
  const [inst1, inst2] = installers;
  const warehouse: any = await User.findOne({ role: 'Warehouse manager', status: 'active' });
  const agent: any = await User.findOne({ role: 'Agent', status: 'active' });
  const as = (u: any) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${u.generateAccessToken()}` });
  const call = async (u: any, method: string, path: string, body?: any) => {
    const res = await fetch(base + path, { method, headers: as(u), body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  };

  const sc1: any = await Inventory.findOne({ itemId: 'SC-0001' }).lean();
  const sc7: any = await Inventory.findOne({ itemId: 'SC-0007' }).lean();
  assert.ok(sc1 && sc7, 'run the scenario seed first (seedScenarios) so SC-0001 / SC-0007 exist');

  const order: any = await Order.create({
    orderNumber: '#GT-1', type: 'Installation', address: '1 Guard Test Rd, Dallas, TX', agent: agent.name, agentId: String(agent._id),
    status: 'Assigned Up', installerName: inst1.name, installerEmail: inst1.email, installerId: String(inst1._id),
    pullList: [
      { id: 'gt-1', product: sc1.product, itemId: 'SC-0001', quantity: 1, checked: false },
      { id: 'gt-2', product: sc7.product, itemId: 'SC-0007', quantity: 1, checked: false },
    ],
  });
  const gtInv: any = await Inventory.create({ product: 'guardtest stock item', itemId: 'GT-0001', size: 'Standard', available: 5, installed: 0, total: 5, owner: 'Instapost LLC' });
  const ok: string[] = [];
  const step = (name: string) => ok.push(name);

  try {
    // ---- status workflow
    const list = await call(inst1, 'GET', '/orders?limit=200');
    const mine = list.body.data.find((o: any) => o.id === '#GT-1');
    assert.deepEqual(mine.nextStatuses, ['Installed', 'On Hold', 'Delayed by Weather']); step('installer sees only the valid next steps');
    assert.equal((await call(inst1, 'PATCH', `/orders/${order._id}`, { status: 'Cancelled' })).status, 403); step('installer cannot cancel');
    const noPhoto = await call(inst1, 'PATCH', `/orders/${order._id}`, { status: 'Installed' });
    assert.equal(noPhoto.status, 400); assert.match(noPhoto.body.message, /photo/i); step('Installed needs a proof photo');
    assert.equal((await call(inst1, 'PATCH', `/orders/${order._id}`, { status: 'On Hold' })).status, 400); step('On Hold needs a reason');
    const hold = await call(inst1, 'PATCH', `/orders/${order._id}`, { status: 'On Hold', statusNote: 'Gate is locked, waiting for the code' });
    assert.equal(hold.status, 200); assert.match(hold.body.data.notes, /Gate is locked/); step('On Hold with a reason is saved to the notes');
    assert.equal((await call(inst1, 'PATCH', `/orders/${order._id}`, { status: 'Assigned Up' })).status, 200); step('can resume from On Hold');
    assert.equal((await call(inst2, 'PATCH', `/orders/${order._id}`, { status: 'On Hold', statusNote: 'not mine' })).status, 403); step("another installer cannot touch the order");
    assert.equal((await call(inst1, 'PATCH', `/orders/${order._id}`, { dueDate: '01/01/2030', address: 'elsewhere' })).status, 403); step('installer cannot edit other fields');

    // ---- pull list scanning and Ready for Install
    const scan = (code: string) => call(inst1, 'POST', `/orders/${order._id}/pull-list/scan`, { code });
    const s1 = await scan('SC-0001-001');
    assert.equal(s1.status, 200); assert.equal(s1.body.data.remaining, 1); step('scanning a unit barcode verifies its pull item');
    assert.equal((await scan('SC-0001-001')).status, 409); step('scanning the same item again is refused');
    assert.equal((await scan('NOT-A-CODE')).status, 404); step('unknown barcode is refused');
    assert.equal((await scan('SC-0009-MAIN')).status, 404); step('an item that is not on the pull list is refused');
    const early = await call(inst1, 'PATCH', `/orders/${order._id}/pull-list`, { readyForInstall: true });
    assert.equal(early.status, 400); assert.match(early.body.message, /1 still to verify/); step('Ready for Install is blocked until everything is verified');
    assert.equal((await scan('SC-0007-001')).body.data.remaining, 0);
    const ready = await call(inst1, 'PATCH', `/orders/${order._id}/pull-list`, { readyForInstall: true });
    assert.equal(ready.status, 200); assert.equal(ready.body.data.readyForInstall, true); assert.equal(ready.body.data.status, 'Assigned Up'); step('Ready for Install is saved as a flag and leaves the status alone');
    const reread = (await call(inst1, 'GET', `/orders/${order._id}`)).body.data;
    assert.equal(reread.readyForInstall, true); assert.equal(reread.readyForInstallBy, inst1.name); step('readiness survives a reload');
    const undone = await call(inst1, 'PATCH', `/orders/${order._id}/pull-list`, { pullList: reread.pullList.map((i: any, n: number) => ({ ...i, checked: n === 0 ? false : i.checked })) });
    assert.equal(undone.body.data.readyForInstall, false); step('un-verifying an item clears readiness');
    assert.equal((await call(inst2, 'POST', `/orders/${order._id}/pull-list/scan`, { code: 'SC-0001-001' })).status, 403); step("another installer cannot scan someone else's order");

    // ---- finishing the job
    await Order.updateOne({ _id: order._id }, { $set: { photos: [{ imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', publicId: '' }] } });
    const blockedByPull = await call(inst1, 'PATCH', `/orders/${order._id}`, { status: 'Installed' });
    assert.equal(blockedByPull.status, 400); assert.match(blockedByPull.body.message, /pull list/i); step('Installed needs the pull list verified');
    await scan('SC-0001-001').catch(() => null);
    await call(inst1, 'PATCH', `/orders/${order._id}/pull-list`, { pullList: (await call(inst1, 'GET', `/orders/${order._id}`)).body.data.pullList.map((i: any) => ({ ...i, checked: true })) });
    const done = await call(inst1, 'PATCH', `/orders/${order._id}`, { status: 'Installed' });
    assert.equal(done.status, 200, JSON.stringify(done.body)); assert.equal(done.body.data.status, 'Installed'); assert.deepEqual(done.body.data.nextStatuses, []); step('Installed works once photo and pull list are in place');

    // ---- returns
    const created = await call(inst1, 'POST', '/inventory/returns', { itemName: gtInv.product, inventoryId: String(gtInv._id), quantity: 2, condition: 'reusable', notes: 'guardtest return', orderId: '#GT-1' });
    assert.equal(created.status, 201); assert.equal(created.body.data.status, 'Pending Review'); assert.equal(created.body.data.recoveredBy, inst1.name); step("an installer's return goes to Pending Review under their own name");
    assert.equal((await Inventory.findById(gtInv._id).lean() as any).available, 5); step('stock is unchanged until the warehouse approves');
    const newItem = await call(inst1, 'POST', '/inventory/returns', { itemName: 'guardtest new thing', quantity: 1, condition: 'new', notes: 'guardtest return' });
    assert.equal(newItem.status, 201); assert.equal(newItem.body.data.condition, 'new_item'); step('"new" is accepted as new_item');
    assert.equal((await call(inst1, 'POST', '/inventory/returns', { itemName: 'x', condition: 'bogus' })).status, 400); step('unknown condition is refused');
    assert.equal((await call(inst2, 'POST', '/inventory/returns', { itemName: 'x', condition: 'reusable', orderId: '#GT-1' })).status, 403); step("cannot log a return against another installer's order");
    const mine1 = await call(inst1, 'GET', '/inventory/returns');
    assert.ok(mine1.body.data.records.every((r: any) => r.recoveredBy === inst1.name) && mine1.body.data.records.length >= 2); assert.ok(mine1.body.data.stats.total >= 2); step('an installer lists only their own returns (with stats)');
    assert.ok(!(await call(inst2, 'GET', '/inventory/returns')).body.data.records.some((r: any) => r.id === created.body.data.id)); step("another installer does not see them");
    assert.equal((await call(agent, 'GET', '/inventory/returns')).status, 403); step('agents cannot read returns');
    const approve = await call(warehouse, 'PATCH', `/inventory/returns/${created.body.data.id}`, { status: 'Restored & Added to Inventory' });
    assert.equal(approve.status, 200, JSON.stringify(approve.body)); assert.equal((await Inventory.findById(gtInv._id).lean() as any).available, 7); step('warehouse approval adds the stock');
    await call(warehouse, 'PATCH', `/inventory/returns/${created.body.data.id}`, { status: 'Restored & Added to Inventory' });
    assert.equal((await Inventory.findById(gtInv._id).lean() as any).available, 7); step('approving twice does not add stock twice');
    assert.equal((await call(inst1, 'PATCH', `/inventory/returns/${created.body.data.id}`, { status: 'Processed' })).status, 403); step('installers cannot approve returns');

    ok.forEach((s) => console.log('PASS  ' + s));
    console.log(`\n${ok.length} field-flow checks passed`);
  } finally {
    await Order.deleteMany({ orderNumber: '#GT-1' });
    await Inventory.deleteMany({ itemId: 'GT-0001' });
    await Inventory.deleteMany({ product: 'guardtest new thing' });
    await ReturnRecord.deleteMany({ $or: [{ inspectionNotes: 'guardtest return' }, { itemName: 'guardtest new thing' }, { itemName: 'guardtest stock item' }] });
    await Notification.deleteMany({ referenceId: { $in: ['#GT-1'] } });
    server.close();
    await mongoose.disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
