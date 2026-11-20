import { Order } from '../../modules/order/order.model';
import { ClientInvoice } from '../../modules/invoice/invoice.model';
import { ReturnRecord } from '../../modules/inventory/return.model';
import { Inventory } from '../../modules/inventory/inventory.model';
import { computeTotals, DEFAULT_PRICING } from '../../modules/order/order.pricing';
import { ADDRESSES, SAMPLE_PHOTOS, TAG, dmy, iso, money, on, type People, type Person } from './helpers';
import { PULL_SETS } from './inventory';

type Pay = 'Paid' | 'Unpaid' | 'Failed' | 'Refunded' | 'Partially Refunded';
type Scenario = {
  n: number; type: string; status: string; subtotal: number;
  agent?: number; days?: number; rush?: boolean; invoice?: boolean; discount?: number; pay?: Pay;
  installer?: number; scheduled?: number; photos?: boolean; pull?: 'open' | 'partial' | 'verified' | 'ready'; notes?: string;
  dueRequest?: boolean; refund?: 'full' | 'partial'; extra?: Record<string, any>; assistant?: boolean; by?: 'teamlead';
};

// Base prices follow the catalog: install 45, removal 25, directionals 35, rider 15.
export const SCENARIOS: Scenario[] = [
  // Installation, every stage of the pipeline
  { n: 9001, type: 'Installation', status: 'Waiting on Payment', subtotal: 45, invoice: true, pay: 'Unpaid', days: 0 },
  { n: 9002, type: 'Installation', status: 'Pending Up', subtotal: 60, days: 1, notes: 'Install the sign near the front walkway.' },
  { n: 9003, type: 'Installation', status: 'Scheduled Up', subtotal: 65, days: 2, scheduled: 2, rush: true, installer: 0, pull: 'ready' },
  { n: 9004, type: 'Installation', status: 'Assigned Up', subtotal: 60, days: 3, scheduled: 1, installer: 1, pull: 'partial' },
  { n: 9005, type: 'Installation', status: 'Installed', subtotal: 75, days: 9, installer: 0, photos: true, pull: 'ready', discount: 10 },
  { n: 9006, type: 'Installation', status: 'On Hold', subtotal: 45, days: 4, notes: 'Waiting on HOA approval.' },
  { n: 9007, type: 'Installation', status: 'Delayed by Weather', subtotal: 60, days: 5, scheduled: 1, installer: 1, pull: 'verified', notes: 'Delayed by Weather: storm front, rebook for tomorrow.' },
  { n: 9008, type: 'Installation', status: 'Cancelled', subtotal: 45, days: 12, invoice: true, pay: 'Refunded', refund: 'full', notes: 'Listing withdrawn by the seller.' },
  { n: 9009, type: 'Installation', status: 'Pending Up', subtotal: 55, days: 1, invoice: true, pay: 'Unpaid', dueRequest: true },
  { n: 9010, type: 'Installation', status: 'Assigned Up', subtotal: 70, days: 2, scheduled: 3, installer: 2, assistant: true, pull: 'open' },
  { n: 9011, type: 'Installation', status: 'Installed', subtotal: 60, days: 15, installer: 1, photos: true, agent: 2, pull: 'ready' },
  { n: 9012, type: 'Installation', status: 'Pending Up', subtotal: 50, days: 0, agent: 1, by: 'teamlead' },
  // Removal
  { n: 9013, type: 'Removal', status: 'Pending Down', subtotal: 25, days: 1, agent: 1 },
  { n: 9014, type: 'Removal', status: 'Scheduled Down', subtotal: 25, days: 2, scheduled: 2, installer: 0, agent: 0, pull: 'open' },
  { n: 9015, type: 'Removal', status: 'Assigned Down', subtotal: 30, days: 3, scheduled: 1, installer: 1, agent: 2, pull: 'partial' },
  { n: 9016, type: 'Removal', status: 'Removed', subtotal: 25, days: 10, installer: 0, photos: true, agent: 0 },
  // Sign change
  { n: 9017, type: 'Sign Change', status: 'Pending', subtotal: 15, days: 1, agent: 3 },
  { n: 9018, type: 'Sign Change', status: 'Assigned', subtotal: 33, days: 2, installer: 1, agent: 3, scheduled: 1, pull: 'open' },
  { n: 9019, type: 'Sign Change', status: 'Completed', subtotal: 18, days: 8, installer: 2, photos: true, agent: 1 },
  // Printing
  { n: 9020, type: 'Sign Printing', status: 'In Production', subtotal: 120, days: 3, agent: 4 },
  { n: 9021, type: 'Sign Printing', status: 'Ready for Install', subtotal: 95, days: 6, agent: 2 },
  { n: 9022, type: 'Sign Printing', status: 'Completed', subtotal: 150, days: 20, agent: 0, invoice: true, pay: 'Partially Refunded', refund: 'partial' },
  // Directionals and open house
  { n: 9023, type: 'For Sale Directionals', status: 'Pending', subtotal: 35, days: 1, agent: 2 },
  { n: 9024, type: 'For Sale Directionals', status: 'Completed', subtotal: 70, days: 11, installer: 2, photos: true, agent: 4 },
  { n: 9025, type: 'Open House Services', status: 'Scheduled', subtotal: 85, days: 2, scheduled: 4, installer: 0, by: 'teamlead' },
  { n: 9026, type: 'Open House Services', status: 'Completed', subtotal: 110, days: 14, installer: 1, photos: true, agent: 3 },
  // Media and other services
  { n: 9027, type: 'Media Services', status: 'Pending', subtotal: 199, days: 1, agent: 1 },
  { n: 9028, type: 'Media Services', status: 'Scheduled', subtotal: 125, days: 2, scheduled: 3, agent: 4 },
  { n: 9029, type: 'Media Services', status: 'Completed', subtotal: 249, days: 13, agent: 0, rush: true },
  { n: 9030, type: 'Other Services', status: 'Pending', subtotal: 60, days: 1, agent: 5, notes: 'Quoted by the sign company after review.', extra: { quotedPrice: 60 } },
  { n: 9031, type: 'Other Services', status: 'Completed', subtotal: 40, days: 16, installer: 2, agent: 2 },
  { n: 9032, type: 'Installation', status: 'Assigned Up', subtotal: 65, days: 1, scheduled: 1, installer: 0, agent: 4, invoice: true, pay: 'Unpaid', pull: 'open' },
];

const pick = <T,>(list: T[], i: number): T => list[i % list.length];

const installSpecs = (i: number) => ({
  firstName: pick(['Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery'], i),
  lastName: pick(['Bennett', 'Hayes', 'Brooks', 'Sullivan', 'Foster', 'Reed'], i),
  propertyType: pick(['Single Family', 'Townhome', 'Condo', 'Duplex'], i),
  signPlacement: pick(['In front of the house', 'Near the driveway', 'Corner of the lot'], i),
  gateCode: i % 4 === 0 ? String(1000 + i * 7) : '',
  addressConfirmed: true,
  warnings: { sprinkler: i % 3 === 0, restrictedAccess: i % 5 === 0, dogFence: i % 4 === 1 },
  addons: i % 2 === 0 ? [{ title: 'Shoe Covers', price: 5 }] : [],
});

export async function seedOrders(people: People) {
  const cfg = DEFAULT_PRICING;
  for (const [idx, s] of SCENARIOS.entries()) {
    const owner: Person = s.assistant ? people.assistants[0] || people.agents[0] : s.by === 'teamlead' ? pick(people.teamLeads.length ? people.teamLeads : people.agents, 0) : pick(people.agents, s.agent ?? idx);
    const installer = s.installer !== undefined ? pick(people.installers, s.installer) : undefined;
    const method = s.invoice ? 'invoice' : 'credit_card';
    const t = computeTotals({ subtotal: s.subtotal, rush: !!s.rush, creditCard: method === 'credit_card', discountAmount: s.discount || 0 }, cfg);
    const orderNumber = on(s.n - 9000);
    const invoiceNo = `INV-${orderNumber.slice(1)}`;
    const refundAmount = s.refund === 'full' ? t.totalAmount : s.refund === 'partial' ? money(t.totalAmount / 3) : 0;
    const pay: Pay = s.pay || 'Paid';
    const orderPaid = pay === 'Paid' || pay === 'Refunded' || pay === 'Partially Refunded';
    const isInstall = s.type === 'Installation';

    await Order.updateOne(
      { orderNumber },
      {
        $setOnInsert: {
          orderNumber,
          type: s.type,
          address: pick(ADDRESSES, idx),
          agent: owner.name,
          agentId: owner.id,
          parentAgentId: s.assistant ? owner.parentAgentId || people.agents[0].id : '',
          orderDate: dmy(-(s.days ?? 1)),
          dueDate: s.rush ? 'Rush' : 'Standard',
          price: `$${t.totalAmount.toFixed(2)}`,
          status: s.status,
          paymentMethod: method,
          paymentStatus: orderPaid ? 'Paid' : 'Unpaid',
          subtotal: t.subtotal,
          discountAmount: t.discountAmount,
          rushFee: t.rushFee,
          taxAmount: t.taxAmount,
          totalAmount: t.totalAmount,
          appointmentTime: s.scheduled ? `${dmy(s.scheduled)} ${pick(['9:00 AM', '11:30 AM', '2:00 PM', '4:00 PM'], idx)}` : '',
          onsiteDuration: 60,
          notes: s.notes || '',
          installerName: installer?.name || '',
          installerEmail: installer?.email || '',
          installerId: installer?.id || '',
          photos: s.photos ? SAMPLE_PHOTOS.map((imageUrl) => ({ imageUrl, publicId: '' })) : [],
          dueDateRequest: s.dueRequest
            ? { status: 'pending', requestedDate: dmy(6), reason: 'Seller needs two more days to clear the lot.', requestedBy: owner.name }
            : { status: 'none' },
          pullList: s.pull
            ? (PULL_SETS[s.type] || PULL_SETS.default).map((p, i, all) => {
                const checked = s.pull === 'verified' || s.pull === 'ready' || (s.pull === 'partial' && i < Math.ceil(all.length / 2));
                return {
                  id: `pull-${s.n}-${i + 1}`, product: p.product, itemId: p.itemId, barcode: checked ? p.barcode : '', quantity: 1,
                  owner: 'Instapost', location: p.location, instruction: '', checked,
                  checkedAt: checked ? new Date(Date.now() - (s.days ?? 1) * 86400000 + 3600000).toISOString() : '',
                  checkedBy: checked ? installer?.name || people.warehouse[0]?.name || '' : '',
                };
              })
            : [],
          pullReadyAt: s.pull === 'ready' ? new Date(Date.now() - (s.days ?? 1) * 86400000 + 7200000) : undefined,
          pullReadyBy: s.pull === 'ready' ? installer?.name || people.warehouse[0]?.name || '' : '',
          refunds: s.refund
            ? [{ id: `ref-${s.n}`, type: s.refund, amount: refundAmount, reason: s.refund === 'full' ? 'Order cancelled before install.' : 'Partial credit for a printing defect.', createdAt: iso(-(s.days ?? 1) + 1) }]
            : [],
          specifications: { seed: TAG, ...(isInstall ? installSpecs(idx) : {}), ...(s.extra || {}) },
        },
      },
      { upsert: true }
    );

    // The client invoice that checkout would have created.
    await ClientInvoice.updateOne(
      { invoiceNo },
      {
        $setOnInsert: {
          invoiceNo,
          orderId: orderNumber,
          clientName: owner.name,
          clientEmail: owner.email.toLowerCase(),
          address: pick(ADDRESSES, idx),
          type: s.type,
          orderDate: iso(-(s.days ?? 1)),
          dueDate: s.rush ? 'Rush' : 'Standard',
          subtotal: t.subtotal,
          taxAmount: t.taxAmount,
          discountAmount: t.discountAmount,
          price: t.totalAmount,
          payment: pay,
          paymentMethod: orderPaid ? (method === 'invoice' ? 'Check' : 'Credit card') : '',
          paymentDate: orderPaid ? iso(-(s.days ?? 1)) : '',
          paymentReference: orderPaid ? `PAY-${s.n}` : '',
          notes: `seed:${TAG}`,
          lineItems: [{ label: `${s.type} — ${pick(ADDRESSES, idx)}`, quantity: 1, unitPrice: t.subtotal, total: t.subtotal }],
          refunds: s.refund
            ? [{ id: `ref-${s.n}`, type: s.refund, amount: refundAmount, reason: s.refund === 'full' ? 'Order cancelled before install.' : 'Partial credit for a printing defect.', createdAt: iso(-(s.days ?? 1) + 1) }]
            : [],
        },
      },
      { upsert: true }
    );
  }
}

/** Returned equipment: every condition in every review state, logged by different installers. */
export async function seedReturns(people: People) {
  const by = (i: number) => people.installers[i % people.installers.length].name;
  const rows: { k: number | null; item: string; itemId: string; qty: number; condition: string; queueType: string; status: string; notes: string; who: number }[] = [
    { k: 16, item: 'Premium Black Sign Post (6 ft)', itemId: 'SC-0001', qty: 1, condition: 'reusable', queueType: 'reusable', status: 'Pending Review', notes: 'Post removed in good shape.', who: 0 },
    { k: 16, item: 'Standard Agent Panel 24x30', itemId: 'SC-0007', qty: 1, condition: 'repair', queueType: 'repair', status: 'Pending Review', notes: 'Corner of the panel is bent.', who: 0 },
    { k: 16, item: 'Steel Frame Sign Post (3 ft)', itemId: 'SC-0002', qty: 1, condition: 'scrap', queueType: 'damaged', status: 'Permanently Decommissioned', notes: 'Snapped at the base.', who: 0 },
    { k: 15, item: 'SOLD Rider 24x6', itemId: 'SC-0004', qty: 2, condition: 'damaged', queueType: 'damaged', status: 'Processed', notes: 'Cracked in the wind; sent to repair.', who: 1 },
    { k: 15, item: 'OPEN HOUSE Rider 24x6', itemId: 'SC-0005', qty: 1, condition: 'reusable', queueType: 'reusable', status: 'Restored & Added to Inventory', notes: 'Checked and returned to stock.', who: 1 },
    { k: 14, item: 'Combination Lockbox', itemId: 'SC-0008', qty: 1, condition: 'reusable', queueType: 'reusable', status: 'Restored & Added to Inventory', notes: 'Code reset and verified.', who: 0 },
    { k: 13, item: 'Directional Arrow 18x24', itemId: 'SC-0009', qty: 3, condition: 'scrap', queueType: 'damaged', status: 'Permanently Decommissioned', notes: 'Run over by a vehicle.', who: 1 },
    { k: 19, item: 'PENDING Rider 24x6', itemId: 'SC-0006', qty: 1, condition: 'repair', queueType: 'repair', status: 'Processed', notes: 'Re-gromment needed; repair booked.', who: 2 },
    { k: 24, item: 'Wire Stakes (bundle of 10)', itemId: 'SC-0010', qty: 2, condition: 'new_item', queueType: 'new_item', status: 'Pending Review', notes: 'Unused stakes brought back from the job.', who: 2 },
    { k: 24, item: 'Directional Arrow 18x24', itemId: 'SC-0009', qty: 4, condition: 'new_item', queueType: 'new_item', status: 'Processed', notes: 'Unopened arrows returned after the open house.', who: 2 },
    { k: null, item: 'White Textured Sign Post (7 ft)', itemId: 'SC-0003', qty: 1, condition: 'damaged', queueType: 'damaged', status: 'Pending Review', notes: 'Found bent behind a property; no order linked.', who: 0 },
    { k: 26, item: 'Premium Black Sign Post (6 ft)', itemId: 'SC-0001', qty: 1, condition: 'reusable', queueType: 'reusable', status: 'Pending Review', notes: 'Open house post, clean.', who: 1 },
  ];
  for (const r of rows) {
    const inv: any = await Inventory.findOne({ itemId: r.itemId }).select('_id').lean();
    const orderId = r.k ? on(r.k) : '';
    const order: any = orderId ? await Order.findOne({ orderNumber: orderId }).select('address agent').lean() : null;
    await ReturnRecord.updateOne(
      { orderId, itemName: r.item, inspectionNotes: r.notes },
      {
        $setOnInsert: {
          orderId, itemName: r.item, inventoryId: inv ? String(inv._id) : '', quantity: r.qty, condition: r.condition, queueType: r.queueType,
          status: r.status, agent: order?.agent || 'Instapost LLC', office: 'Main Office', recoveredFrom: order?.address || 'Field pickup',
          recoveredBy: by(r.who), inspectionNotes: r.notes,
        },
      },
      { upsert: true }
    );
  }
}
