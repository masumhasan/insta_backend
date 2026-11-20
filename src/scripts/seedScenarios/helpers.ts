import { User } from '../../modules/auth/user.model';
import { Inventory } from '../../modules/inventory/inventory.model';
import { Order } from '../../modules/order/order.model';

/** Everything this seed writes carries this tag so `--remove` can take it out again. */
export const TAG = 'scenarios';

/** Cloudinary assets already used by the platform (generic sign-install photos). */
export const SAMPLE_PHOTOS = [
  'https://res.cloudinary.com/c1u8capm/image/upload/v1794320045/instapost/assets/mig_3f6fab270a3ef1.jpg',
  'https://res.cloudinary.com/c1u8capm/image/upload/v1794320046/instapost/assets/mig_4397f53ce14168.jpg',
  'https://res.cloudinary.com/c1u8capm/image/upload/v1794320047/instapost/assets/mig_6d75076520fed7.jpg',
];

let BASE = 9001;
/**
 * Seeded orders are numbered one above the highest existing order number (and keep that range on re-runs),
 * so they never collide with real orders. on(k) is the k-th seeded order number, "#N".
 */
export async function initOrderBase() {
  const nums = (await Order.find({ orderNumber: /^#\d+$/ }).select('orderNumber specifications.seed').lean()).map((o: any) => ({ n: parseInt(o.orderNumber.slice(1), 10), seeded: o.specifications?.seed === TAG }));
  const seeded = nums.filter((x) => x.seeded).map((x) => x.n);
  BASE = seeded.length ? Math.min(...seeded) : Math.max(9000, ...nums.map((x) => x.n)) + 1;
  return BASE;
}
export const on = (k: number) => `#${BASE + k - 1}`;

export const money = (n: number) => Number(n.toFixed(2));
export const dmy = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-GB');
export const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().split('T')[0];

export type Person = { id: string; name: string; email: string; parentAgentId?: string };
const toPerson = (u: any): Person => ({ id: String(u._id), name: u.name, email: u.email, parentAgentId: u.parentAgentId || '' });

/** Existing accounts are reused; the seed never creates users or passwords. */
export async function loadPeople() {
  const find = async (role: string, limit: number) =>
    (await User.find({ role, status: { $nin: ['blocked', 'rejected', 'pending', 'pending_approval'] } }).sort({ createdAt: 1 }).limit(limit).lean()).map(toPerson);
  const agents = await find('Agent', 6);
  const people = {
    agents,
    assistants: await find('Assistant', 3),
    teamLeads: await find('Team Lead', 2),
    installers: await find('Installer', 3),
    photographers: await find('Photographer', 1),
    warehouse: await find('Warehouse manager', 1),
  };
  if (agents.length === 0) throw new Error('No active Agent accounts found. Create users first (seedUsers).');
  if (people.installers.length === 0) throw new Error('No active Installer accounts found.');
  return people;
}
export type People = Awaited<ReturnType<typeof loadPeople>>;

/** Real product names from inventory, so pull lists match what the warehouse actually stocks. */
export async function loadProductNames() {
  const first = async (itemType: RegExp, fallback: string) => (await Inventory.findOne({ itemType }).lean())?.product || fallback;
  return {
    post: await first(/sign post/i, 'Sign post'),
    rider: await first(/^rider$/i, 'Rider'),
    panel: await first(/main panel/i, 'Main Panel'),
    lockbox: await first(/lockbox/i, 'Lockbox'),
    directional: await first(/directional/i, 'Directional'),
  };
}

export const ADDRESSES = [
  '2410 Maple Grove Ln, Plano, TX 75074',
  '815 Oak Ridge Dr, Frisco, TX 75034',
  '1307 Cedar Hollow Ct, McKinney, TX 75070',
  '4521 Lakeview Blvd, Dallas, TX 75205',
  '3320 Willow Bend Rd, Dallas, TX 75219',
  '906 Prairie Wind Way, Allen, TX 75013',
  '1750 Stonebridge Pkwy, Fort Worth, TX 76107',
  '622 Heritage Oaks Ln, Richardson, TX 75080',
  '5108 Sunset Terrace, Irving, TX 75038',
  '2214 Magnolia Springs Dr, Garland, TX 75044',
  '738 Bluebonnet Trail, Southlake, TX 76092',
  '1493 Pecan Orchard Rd, Lewisville, TX 75067',
  '3901 Riverbend Ct, Arlington, TX 76011',
  '267 Founders Row, Addison, TX 75001',
  '1180 Live Oak Cir, Carrollton, TX 75006',
  '842 Windmill Ridge, Mesquite, TX 75150',
];
