import { MediaTask, CalendarEvent, MediaDelivery } from '../../modules/ops/ops.model';
import { Notification } from '../../modules/notification/notification.model';
import { TechnicianInvoice } from '../../modules/invoice/invoice.model';
import { ADDRESSES, TAG, dmy, iso, money, on, type People } from './helpers';

const SEED_BY = 'seed-scenarios';

export async function seedMedia(people: People) {
  const photographer = people.photographers[0]?.name || 'Photographer';
  const tasks = [
    { orderNumber: on(27), taskName: 'Edit HDR Photos', status: 'clock', category: 'photography', client: people.agents[1 % people.agents.length].name, address: ADDRESSES[10], media: { gallery: 0, videos: 0, threeD: 0, floorPlan: 0, files: 0 } },
    { orderNumber: on(28), taskName: 'Quality Control Review', status: 'user', category: 'photography', client: people.agents[4 % people.agents.length].name, address: ADDRESSES[11], media: { gallery: 28, videos: 0, threeD: 0, floorPlan: 0, files: 1 } },
    { orderNumber: on(29), taskName: 'Edit HDR Photos', status: 'play', category: 'photography', client: people.agents[0].name, address: ADDRESSES[12], media: { gallery: 35, videos: 0, threeD: 0, floorPlan: 1, files: 2 } },
    { orderNumber: on(29), taskName: 'Cut Walkthrough Video', status: 'play', category: 'video', client: people.agents[0].name, address: ADDRESSES[12], media: { gallery: 0, videos: 1, threeD: 0, floorPlan: 0, files: 1 } },
    { orderNumber: on(28), taskName: 'Floor Plan Creation', status: 'clock', category: 'floorplan', client: people.agents[4 % people.agents.length].name, address: ADDRESSES[11], media: { gallery: 0, videos: 0, threeD: 0, floorPlan: 0, files: 0 } },
  ];
  for (const t of tasks) {
    await MediaTask.updateOne(
      { orderNumber: t.orderNumber, taskName: t.taskName },
      { $setOnInsert: { ...t, tags: ['Media QC', 'seed'], dueDate: dmy(3), shotBy: photographer, editor: 'Editing queue', listingPrice: '$450,000', notes: [], hasActions: true } },
      { upsert: true }
    );
  }

  // Photographer calendar for the coming week.
  const slots = ['9:00 AM', '11:00 AM', '1:30 PM', '3:30 PM'];
  for (let d = 0; d < 6; d++) {
    const date = iso(d);
    await CalendarEvent.updateOne(
      { date, time: slots[d % 4], photographer, title: `Listing shoot — ${ADDRESSES[(d + 3) % ADDRESSES.length].split(',')[0]}` },
      { $setOnInsert: { date, time: slots[d % 4], photographer, title: `Listing shoot — ${ADDRESSES[(d + 3) % ADDRESSES.length].split(',')[0]}`, address: ADDRESSES[(d + 3) % ADDRESSES.length], durationMinutes: 90, type: 'appointment' } },
      { upsert: true }
    );
  }
  await CalendarEvent.updateOne(
    { date: iso(2), time: '12:00 PM', photographer, title: 'Lunch break' },
    { $setOnInsert: { date: iso(2), time: '12:00 PM', photographer, title: 'Lunch break', address: '', durationMinutes: 60, type: 'reserved' } },
    { upsert: true }
  );

  // Delivered media galleries in every state (no gallery link: nothing real to point at).
  const deliveries = [
    { orderNumber: on(29), status: 'Delivered', address: ADDRESSES[12], photoCount: 35, videoCount: 1 },
    { orderNumber: on(28), status: 'In Review', address: ADDRESSES[11], photoCount: 28, videoCount: 0 },
    { orderNumber: on(27), status: 'Draft', address: ADDRESSES[10], photoCount: 0, videoCount: 0 },
    { orderNumber: on(5), status: 'Ready', address: ADDRESSES[4], photoCount: 18, videoCount: 0 },
  ];
  for (const x of deliveries) {
    await MediaDelivery.updateOne({ orderNumber: x.orderNumber }, { $setOnInsert: { ...x, clientName: people.agents[0].name, galleryUrl: '' } }, { upsert: true });
  }
}

export async function seedNotifications(people: People) {
  const rows: { key: string; role?: string; userId?: string; title: string; message: string; type: string; ref?: string; read?: boolean }[] = [
    { key: 'n1', role: 'Sign company', title: `New Order Placed (${on(2)})`, message: 'Installation at 815 Oak Ridge Dr, Frisco, TX 75034 for a new listing.', type: 'order', ref: on(2) },
    { key: 'n2', role: 'Sign company', title: `Due date change requested (${on(9)})`, message: 'The agent asked to move the due date by 6 days.', type: 'due_date', ref: on(9) },
    { key: 'n3', role: 'Admin', title: `Order cancelled (${on(8)})`, message: 'Installation at 1750 Stonebridge Pkwy was cancelled and fully refunded.', type: 'order', ref: on(8), read: true },
    { key: 'n4', role: 'Installer', title: `New job assigned (${on(4)})`, message: 'Installation at 906 Prairie Wind Way, Allen, TX scheduled for tomorrow.', type: 'order', ref: on(4) },
    { key: 'n5', role: 'Warehouse manager', title: 'Low stock: Steel Frame Sign Post (3 ft)', message: 'Only 2 units are left in the warehouse.', type: 'system' },
    { key: 'n6', role: 'Warehouse manager', title: 'Out of stock: White Textured Sign Post (7 ft)', message: 'No units available. Reorder before the next install.', type: 'system' },
    { key: 'n7', role: 'Sign company', title: 'Team Lead application', message: 'An agent applied to become a Team Leader.', type: 'team_lead' },
    { key: 'n8', role: 'Admin', title: 'Registration awaiting approval', message: 'A new applicant is waiting in the Approvals tab.', type: 'approval' },
    ...people.agents.slice(0, 3).map((a, i) => ({ key: `na${i}`, userId: a.id, title: 'Your install is complete', message: `Order ${on(5 + i)} was installed. Photos are attached to the order.`, type: 'order', ref: on(5 + i) })),
    ...people.installers.slice(0, 2).map((x, i) => ({ key: `ni${i}`, userId: x.id, title: 'Pull list updated', message: 'The warehouse updated the pull list for your next job.', type: 'order', ref: on(3), read: i === 1 })),
  ];
  for (const r of rows) {
    const referenceId = r.ref || `seed-${r.key}`;
    await Notification.updateOne(
      { createdBy: SEED_BY, title: r.title, recipientUserId: r.userId || '' },
      { $setOnInsert: { recipientUserId: r.userId || '', recipientRole: r.role || '', title: r.title, message: r.message, type: r.type, referenceId, read: !!r.read, createdBy: SEED_BY } },
      { upsert: true }
    );
  }
}

/** Payroll invoices for installers and the photographer: pending and paid. */
export async function seedTechnicianInvoices(people: People) {
  const mk = (n: number, tech: { name: string; email: string }, role: 'Installer' | 'Photographer', status: 'pending' | 'paid', orders: { id: string; address: string; services: [string, number][] }[], miles: number) => {
    const appointmentList = orders.map((o, i) => {
      const services = o.services.map(([name, payout], s) => ({ id: `svc-${n}-${i}-${s}`, name, category: s === 0 ? 'base' : 'addon', icon: role === 'Photographer' ? 'camera' : 'wrench', subtitle: '', payout, overrideAmount: null, overrideReason: '', enabled: true }));
      return { id: `apt-${n}-${i + 1}`, orderId: o.id, address: o.address, date: iso(-(10 - i * 2)), dateTimeLabel: `${dmy(-(10 - i * 2))} 10:00 AM`, aboveGroundSqFt: 0, belowGroundSqFt: 0, services, customFees: [], mileageFee: money(miles / orders.length * 0.67) };
    });
    const servicesTotal = money(appointmentList.reduce((sum, a) => sum + a.services.reduce((x, s) => x + s.payout, 0), 0));
    const mileageTotalFee = money(appointmentList.reduce((sum, a) => sum + a.mileageFee, 0));
    return {
      invoiceNumber: `TINV-${n}`, technicianName: tech.name, technicianEmail: tech.email, role, status,
      dateRange: `${dmy(-14)} - ${dmy(-1)}`, periodStart: iso(-14), periodEnd: iso(-1), edited: 'No',
      paidAt: status === 'paid' ? iso(-1) : '', paymentMethod: status === 'paid' ? 'ACH / Direct Deposit' : '', paymentReference: status === 'paid' ? `PAY-T${n}` : '',
      mileageTotal: miles, billableMileage: miles, mileageCost: mileageTotalFee,
      mileageOverride: { amount: null, note: '', isOverridden: false }, appointmentList, servicesTotal, mileageTotalFee, charge: money(servicesTotal + mileageTotalFee),
    };
  };
  const [i0, i1] = people.installers;
  const docs = [
    mk(9001, i0, 'Installer', 'pending', [{ id: on(3), address: ADDRESSES[2], services: [['Post installation', 30], ['Rider add', 6]] }, { id: on(5), address: ADDRESSES[4], services: [['Post installation', 30]] }], 42),
    mk(9002, i1 || i0, 'Installer', 'paid', [{ id: on(11), address: ADDRESSES[10], services: [['Post installation', 30], ['Lockbox install', 8]] }, { id: on(15), address: ADDRESSES[14], services: [['Sign removal', 20]] }], 36),
  ];
  const photographer = people.photographers[0];
  if (photographer) docs.push(mk(9003, photographer, 'Photographer', 'pending', [{ id: on(29), address: ADDRESSES[12], services: [['HDR photography', 80], ['Drone video', 60]] }], 18));
  for (const d of docs) await TechnicianInvoice.updateOne({ invoiceNumber: d.invoiceNumber }, { $setOnInsert: d }, { upsert: true });
}

export const SEED_NOTIFICATION_AUTHOR = SEED_BY;
export const SEED_TAG = TAG;
