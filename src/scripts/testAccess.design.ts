// Custom design approval checks for testAccess.ts (wired in through testAccess.extra.ts).
// The order is created directly (named GUARDTEST-…, pushed onto orderIds so testAccess removes it with its
// invoices and notifications); the inventory it creates is named "guardtest …" and removed by cleanupDesign().
import { Order } from '../modules/order/order.model';
import { Inventory } from '../modules/inventory/inventory.model';
import { User } from '../modules/auth/user.model';
import { newDesignApproval } from '../modules/order/order.designApproval';

type Call = (c: { who: string; method: string; path: string; body?: any; expect: number | number[]; note?: string }) => Promise<Response | undefined>;
type Check = (ok: boolean, text: string) => void;
const NOBODY = '000000000000000000000000';
const PIECE = 'guardtest custom panel';

export const designCases = () => [
  { who: 'nobody', method: 'POST', path: `/orders/${NOBODY}/design-approval`, body: { action: 'approve' }, expect: 401 },
  { who: 'Admin', method: 'POST', path: `/orders/${NOBODY}/design-approval`, body: { action: 'approve' }, expect: 403, note: 'only the customer side approves' },
  { who: 'Installer', method: 'POST', path: `/orders/${NOBODY}/design-approval`, body: { action: 'approve' }, expect: 403 },
  { who: 'Agent', method: 'PATCH', path: `/orders/${NOBODY}/production-complete`, expect: 403, note: 'staff only' },
  { who: 'Agent', method: 'POST', path: `/orders/${NOBODY}/design-proof`, body: { imageUrl: 'https://res.cloudinary.com/x/y.png' }, expect: 403 },
  { who: 'Admin', method: 'PATCH', path: `/orders/${NOBODY}/production-complete`, expect: 404 },
];

export async function runDesignChecks(call: Call, check: Check, who: Record<string, { id: string } | null>, orderIds: string[]) {
  const agent: any = who['Agent'] ? await User.findById(who['Agent'].id).lean() : null;
  const installer: any = who['Installer'] ? await User.findById(who['Installer'].id).lean() : null;
  if (!agent) return check(true, 'SKIP design approval (no Agent user)');
  const order: any = await Order.create({
    orderNumber: `GUARDTEST-${Date.now()}`,
    type: 'Installation',
    address: '1 Guard Test Rd, Dallas, TX',
    agent: agent.name,
    agentId: String(agent._id),
    status: 'Pending Up',
    specifications: {
      postSetups: [{ postName: 'guardtest post' }],
      customItems: [{ post: 1, slot: 'main', slotName: 'Main Panel', name: PIECE, size: '18x24', source: 'custom', imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' }],
    },
    designApproval: newDesignApproval({ name: 'guardtest' }),
  });
  const id = String(order._id);
  orderIds.push(id);
  const path = `/orders/${id}`;
  const assign = { installerName: installer?.name || 'guardtest', installerEmail: installer?.email || '', installerId: installer ? String(installer._id) : '' };

  if (who['Team Lead'] && who['Team Lead'].id !== String(agent._id)) {
    await call({ who: 'Team Lead', method: 'POST', path: `${path}/design-approval`, body: { action: 'approve' }, expect: 403, note: "not this order's customer" });
  }
  await call({ who: 'Admin', method: 'PATCH', path: `${path}/assign`, body: assign, expect: 409, note: 'installer while design approval is pending' });
  await call({ who: 'Admin', method: 'PATCH', path, body: { installerName: assign.installerName }, expect: 409, note: 'installer via order edit while pending' });
  await call({ who: 'Admin', method: 'PATCH', path: `${path}/production-complete`, expect: 409, note: 'not approved yet' });
  await call({ who: 'Agent', method: 'POST', path: `${path}/design-approval`, body: { action: 'request_changes', note: '' }, expect: 400, note: 'changes need a note' });
  await call({ who: 'Agent', method: 'POST', path: `${path}/design-approval`, body: { action: 'approve' }, expect: 200 });
  let saved: any = await Order.findById(id).lean();
  check(saved?.status === 'In Production' && saved?.designApproval?.status === 'approved', `approving the design moves the order to In Production (got ${saved?.status})`);
  await call({ who: 'Agent', method: 'POST', path: `${path}/design-approval`, body: { action: 'approve' }, expect: 409, note: 'already approved' });
  await call({ who: 'Admin', method: 'PATCH', path: `${path}/assign`, body: assign, expect: 409, note: 'installer while In Production' });

  await call({ who: 'Admin', method: 'PATCH', path: `${path}/production-complete`, expect: 200 });
  await call({ who: 'Admin', method: 'PATCH', path: `${path}/production-complete`, expect: 200, note: 'second call creates nothing' });
  const count = await Inventory.countDocuments({ product: PIECE, ownerId: String(agent._id) });
  saved = await Order.findById(id).lean();
  check(count === 1 && saved?.status === 'Ready to Install' && !!saved?.specifications?.customItems?.[0]?.inventoryId,
    `Ready to Install creates the agent's inventory item exactly once (${count} item(s), status ${saved?.status})`);
  const res = await call({ who: 'Agent', method: 'GET', path: '/inventory?ownedOnly=true', expect: 200 });
  const rows: any[] = res ? ((await res.json()) as any).data || [] : [];
  check(rows.some((r) => r.product === PIECE), "the custom piece shows in the agent's own inventory");
  if (installer) {
    await call({ who: 'Admin', method: 'PATCH', path: `${path}/assign`, body: assign, expect: 200, note: 'installer once Ready to Install' });
    saved = await Order.findById(id).lean();
    check(saved?.status === 'Assigned Up', `assigning after Ready to Install moves the order to Assigned Up (got ${saved?.status})`);
  }
}

export async function cleanupDesign() {
  await Inventory.deleteMany({ product: /^guardtest/ });
}
