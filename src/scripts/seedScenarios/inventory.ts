import { Inventory } from '../../modules/inventory/inventory.model';
import { SAMPLE_PHOTOS, TAG, dmy, type People } from './helpers';

type Item = {
  id: string; product: string; itemType: string; size: string; available: number; installed: number;
  owner?: 'sign' | 'agent' | 'office'; ownerIdx?: number; price?: string; rental?: string; install?: string; removal?: string;
  units?: string[]; location?: string; extra?: Record<string, any>;
  /** Post types (Sign post product names) a panel / rider fits, and rider ply. */
  fits?: string[]; ply?: string; sn?: string;
};

const BLACK_POST = 'Premium Black Sign Post (6 ft)';
const STEEL_POST = 'Steel Frame Sign Post (3 ft)';
const WHITE_POST = 'White Textured Sign Post (7 ft)';

// Stock in every state: healthy, low, out of stock; units that are missing, damaged or need repair.
const ITEMS: Item[] = [
  { id: 'SC-0001', product: 'Premium Black Sign Post (6 ft)', itemType: 'Sign post', size: '6 ft', available: 24, installed: 11, price: '$42.00', install: '$45.00', removal: '$25.00', units: ['Available', 'Available', 'Installed', 'Installed'], location: 'Warehouse-1 (Aisle 1)', extra: { color: 'Black', material: 'PVC', postHeight: '6 ft' } },
  { id: 'SC-0002', product: 'Steel Frame Sign Post (3 ft)', itemType: 'Sign post', size: '3 ft', available: 2, installed: 14, price: '$38.00', install: '$40.00', removal: '$25.00', units: ['Available', 'Missing', 'Installed'], location: 'Warehouse-1 (Aisle 1)', extra: { material: 'Steel' } },
  { id: 'SC-0003', product: 'White Textured Sign Post (7 ft)', itemType: 'Sign post', size: '7 ft', available: 0, installed: 9, price: '$46.00', install: '$50.00', removal: '$25.00', units: ['Installed', 'Installed', 'Damaged'], location: 'Warehouse-1 (Aisle 2)' },
  { id: 'SC-0004', product: 'SOLD Rider 24x6', itemType: 'Rider', size: '24" x 6"', available: 30, installed: 12, price: '$12.00', rental: '$5.00', units: ['Available', 'Installed', 'Needs Repair'], location: 'Warehouse-1 (Bin R1)', extra: { riderHeading: 'SOLD', material: 'PVC', mountType: 'Hanging (hooks)' }, fits: [BLACK_POST, WHITE_POST], ply: 'Double Ply' },
  { id: 'SC-0005', product: 'OPEN HOUSE Rider 24x6', itemType: 'Rider', size: '24" x 6"', available: 3, installed: 6, price: '$12.00', rental: '$5.00', location: 'Warehouse-1 (Bin R2)', extra: { riderHeading: 'OPEN HOUSE', mountType: 'Slider / frame' }, fits: [STEEL_POST], ply: 'Single Ply' },
  { id: 'SC-0006', product: 'PENDING Rider 24x6', itemType: 'Rider', size: '24" x 6"', available: 0, installed: 4, price: '$12.00', rental: '$5.00', location: 'Warehouse-1 (Bin R3)', extra: { riderHeading: 'PENDING', mountType: 'Hanging or frame' }, fits: [BLACK_POST, STEEL_POST, WHITE_POST], ply: 'Double Ply' },
  { id: 'SC-0007', product: 'Standard Agent Panel 24x30', itemType: 'Main Panel', size: '24" x 30"', available: 18, installed: 7, price: '$55.00', rental: '$10.00', units: ['Available', 'Installed'], location: 'Warehouse-1 (Rack P1)', extra: { material: 'ABS', mountType: 'Top Mount' }, fits: [BLACK_POST, WHITE_POST] },
  { id: 'SC-0008', product: 'Combination Lockbox', itemType: 'Lockbox', size: 'Standard', available: 12, installed: 5, price: '$30.00', rental: '$6.00', units: ['Available', 'Installed'], location: 'Warehouse-1 (Cabinet L)', extra: { lockboxType: 'Combination' }, sn: 'LB-SN-40118' },
  { id: 'SC-0009', product: 'Directional Arrow 18x24', itemType: 'Directional', size: '18" x 24"', available: 40, installed: 10, price: '$9.00', rental: '$4.00', location: 'Warehouse-1 (Bin D1)', extra: { mountType: 'Wire Stake' } },
  { id: 'SC-0010', product: 'Wire Stakes (bundle of 10)', itemType: 'Hardware / Stakes', size: 'Bundle', available: 60, installed: 0, price: '$8.00', location: 'Warehouse-1 (Bin H1)' },
  // Owned by agents and offices (visible only to their owner)
  { id: 'SC-0011', product: 'Agent-owned Branded Panel 24x30', itemType: 'Main Panel', size: '24" x 30"', available: 4, installed: 2, owner: 'agent', ownerIdx: 0, price: '$60.00', units: ['Available', 'Installed'], location: 'Warehouse-1 (Customer shelf)', fits: [BLACK_POST] },
  { id: 'SC-0012', product: 'Agent-owned Branded Rider', itemType: 'Rider', size: '24" x 6"', available: 6, installed: 1, owner: 'agent', ownerIdx: 1, price: '$14.00', location: 'Warehouse-1 (Customer shelf)' },
  { id: 'SC-0013', product: 'Office Branded Panel 24x36', itemType: 'Main Panel', size: '24" x 36"', available: 10, installed: 5, owner: 'office', ownerIdx: 0, price: '$64.00', location: 'Warehouse-1 (Customer shelf)', fits: [STEEL_POST, 'Office Branded Sign Post'] },
  { id: 'SC-0014', product: 'Office Branded Sign Post', itemType: 'Sign post', size: '6 ft', available: 8, installed: 3, owner: 'office', ownerIdx: 0, price: '$44.00', install: '$45.00', location: 'Warehouse-1 (Customer shelf)' },
];

type PullRef = { itemId: string; product: string; barcode: string; location: string };
const ref = (id: string, unit = '001'): PullRef => {
  const it = ITEMS.find((x) => x.id === id)!;
  return { itemId: id, product: it.product, barcode: it.units?.length ? `${id}-${unit}` : `${id}-MAIN`, location: it.location || 'Warehouse-1' };
};
/** What the warehouse pulls for each kind of job. Barcodes are real unit barcodes from the seeded inventory. */
export const PULL_SETS: Record<string, PullRef[]> = {
  Installation: [ref('SC-0001'), ref('SC-0007'), ref('SC-0004'), ref('SC-0008')],
  Removal: [ref('SC-0010')],
  'Sign Change': [ref('SC-0007'), ref('SC-0004')],
  default: [ref('SC-0009')],
};

const STATUS_OF = (available: number) => (available === 0 ? 'Out of Stock' : available <= 3 ? 'Low Stock' : 'In Stock');

export async function seedInventory(people: People) {
  const installer = people.installers[0]?.name || '';
  for (const [i, it] of ITEMS.entries()) {
    const agentOwner = it.owner === 'agent' ? people.agents[it.ownerIdx ?? 0] || people.agents[0] : undefined;
    const officeOwner = it.owner === 'office' ? people.teamLeads[it.ownerIdx ?? 0] || people.teamLeads[0] : undefined;
    const owner = agentOwner || officeOwner;
    const units = (it.units || []).map((status, u) => ({
      unitId: `${it.id}-U${u + 1}`, barcode: `${it.id}-${String(u + 1).padStart(3, '0')}`, status, notes: status === 'Available' || status === 'Installed' ? '' : `Marked ${status.toLowerCase()} during the last inspection.`, updatedAt: dmy(-u),
    }));
    await Inventory.updateOne(
      { itemId: it.id },
      {
        $setOnInsert: {
          itemId: it.id,
          product: it.product,
          itemType: it.itemType,
          size: it.size,
          owner: owner ? owner.name : 'Instapost LLC',
          ownerType: agentOwner ? 'Agent' : officeOwner ? 'Office' : 'Sign company',
          ownerId: owner ? owner.id : '',
          assignedAgent: agentOwner?.name || '',
          assignedAgentId: agentOwner ? agentOwner.id : null,
          office: officeOwner ? `${officeOwner.name}'s Office` : '',
          ownerLinkChecked: true,
          available: it.available,
          installed: it.installed,
          total: it.available + it.installed,
          status: STATUS_OF(it.available),
          location: it.location || 'Warehouse-1',
          unitPrice: it.price || '',
          rentalPrice: it.rental || '',
          installPrice: it.install || '',
          removalPrice: it.removal || '',
          imageUrl: SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length],
          barcode: `${it.id}-MAIN`,
          units,
          history: [
            { id: `${it.id}-h1`, date: dmy(-14), status: 'Received', address: 'Warehouse-1', installer: '', agent: '', notes: 'Received into stock.' },
            ...(it.installed > 0 ? [{ id: `${it.id}-h2`, date: dmy(-6), status: 'Installed', address: '2410 Maple Grove Ln, Plano, TX 75074', installer, agent: people.agents[0].name, notes: '' }] : []),
          ],
          lastUpdated: dmy(-1),
          additionalSpecs: `seed:${TAG}`,
          ...(it.extra || {}),
        },
        // New fields are also set on items seeded before they existed.
        $set: { compatiblePostTypes: it.fits || [], postType: it.fits?.[0] || '', ply: it.ply || '', ...(it.sn ? { serialNo: it.sn } : {}) },
      },
      { upsert: true }
    );
  }
}
