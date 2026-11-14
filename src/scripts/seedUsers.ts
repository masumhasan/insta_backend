import { connectDatabase, disconnectDatabase } from '../config/database';
import { User, UserRole } from '../modules/auth/user.model';

export const DEMO_PASSWORD = 'User@123456';

interface DemoAccountSeed {
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  company: string;
  parentAgentEmail?: string;
}

const DEMO_ROLE_ACCOUNTS: DemoAccountSeed[] = [
  {
    name: 'Platform Admin',
    email: 'admin@instapost.com',
    role: 'Admin',
    phone: '+1 (214) 555-0100',
    company: 'Instapost HQ',
  },
  {
    name: 'Apex Sign Company',
    email: 'signcompany@instapost.com',
    role: 'Sign company',
    phone: '+1 (214) 555-0101',
    company: 'Apex Sign Company',
  },
  {
    name: 'Sarah Agent',
    email: 'agent@instapost.com',
    role: 'Agent',
    phone: '+1 (214) 555-0102',
    company: 'Premier Realty Group',
  },
  {
    name: 'Robert Lead',
    email: 'teamlead@instapost.com',
    role: 'Team Lead',
    phone: '+1 (214) 555-0103',
    company: 'Premier Realty Group',
  },
  {
    name: 'Jessica Assistant',
    email: 'assistant@instapost.com',
    role: 'Assistant',
    phone: '+1 (214) 555-0104',
    company: 'Premier Realty Group',
    parentAgentEmail: 'agent@instapost.com',
  },
  {
    name: 'Efaz Installer',
    email: 'installer@instapost.com',
    role: 'Installer',
    phone: '+1 (214) 555-0105',
    company: 'Instapost Field Ops',
  },
  {
    name: 'Bella Photographer',
    email: 'photographer@instapost.com',
    role: 'Photographer',
    phone: '+1 (214) 555-0106',
    company: 'Instapost Media Team',
  },
  {
    name: 'Osman Warehouse',
    email: 'warehouse@instapost.com',
    role: 'Warehouse manager',
    phone: '+1 (214) 555-0107',
    company: 'Instapost Logistics',
  },
  {
    name: 'Olivia OfficeManager',
    email: 'officemanager@instapost.com',
    role: 'Office Manager',
    phone: '+1 (214) 555-0108',
    company: 'Premier Realty Group',
  },
];

async function upsertUserWithPassword(account: DemoAccountSeed, parentAgentId = '') {
  const email = account.email.toLowerCase();
  let user = await User.findOne({ email }).select('+password');
  if (!user) {
    user = await User.create({
      name: account.name,
      email,
      password: DEMO_PASSWORD,
      role: account.role,
      phone: account.phone,
      company: account.company,
      parentAgentId,
      status: 'active',
    });
    console.log(`[Seed] Created ${account.role}: ${email}`);
  } else {
    user.name = account.name;
    user.role = account.role;
    user.phone = account.phone;
    user.company = account.company;
    if (parentAgentId) user.parentAgentId = parentAgentId;
    user.password = DEMO_PASSWORD;
    user.status = 'active';
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    console.log(`[Seed] Upserted ${account.role}: ${email}`);
  }
  return user;
}

async function seedUsers() {
  await connectDatabase();

  // First ensure non-canonical role typo from older seed is normalized
  await User.updateMany({ role: 'Warehouse Manager' }, { $set: { role: 'Warehouse manager' } });

  const byEmail = new Map<string, any>();
  for (const account of DEMO_ROLE_ACCOUNTS.filter((a) => !a.parentAgentEmail)) {
    const u = await upsertUserWithPassword(account);
    byEmail.set(account.email, u);
  }
  for (const account of DEMO_ROLE_ACCOUNTS.filter((a) => a.parentAgentEmail)) {
    const parent = account.parentAgentEmail ? byEmail.get(account.parentAgentEmail) : null;
    await upsertUserWithPassword(account, parent?._id?.toString() || '');
  }

  console.log('[Seed] All 9 role mock accounts seeded and verified!');
  await disconnectDatabase();
  process.exit(0);
}

seedUsers().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});

