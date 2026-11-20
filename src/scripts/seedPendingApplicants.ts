import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../modules/auth/user.model';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '';
if (!DEMO_PASSWORD) throw new Error('Set SEED_DEMO_PASSWORD in backend/.env before running the seeds.');

async function seedPendingApplicants() {
  await connectDatabase();

  const applicants = [
    {
      name: 'John Carter',
      email: 'john.carter@realty.com',
      password: DEMO_PASSWORD,
      role: 'Agent' as const,
      phone: '+1 (214) 555-0181',
      company: 'Omega Realty Group',
      office: 'Omega Dallas Office',
      brokerage: 'Omega Realty Group',
      status: 'pending_approval' as const,
      joinDate: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    },
    {
      name: 'Sarah Ahmed',
      email: 'sarah.ahmed@primeestate.com',
      password: DEMO_PASSWORD,
      role: 'Agent' as const,
      phone: '+1 (214) 555-0182',
      company: 'Prime Estate Signs',
      office: 'Prime Estate HQ',
      brokerage: 'Prime Real Estate Group',
      status: 'pending_approval' as const,
      joinDate: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    },
    {
      name: 'Michael Brown',
      email: 'michael.brown@urbansigns.com',
      password: DEMO_PASSWORD,
      role: 'Agent' as const,
      phone: '+1 (214) 555-0183',
      company: 'Urban Sign Masters',
      office: 'Urban Sign Studio',
      brokerage: 'Urban Property Associates',
      status: 'pending_approval' as const,
      joinDate: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    },
  ];

  for (const applicant of applicants) {
    const existing = await User.findOne({ email: applicant.email.toLowerCase() });
    if (existing) {
      existing.name = applicant.name;
      existing.role = applicant.role;
      existing.phone = applicant.phone;
      existing.company = applicant.company;
      existing.office = applicant.office;
      existing.brokerage = applicant.brokerage;
      existing.status = 'pending_approval';
      await existing.save();
      console.log(`[Seed] Updated pending applicant: ${applicant.name} (${applicant.email})`);
    } else {
      await User.create(applicant);
      console.log(`[Seed] Created pending applicant: ${applicant.name} (${applicant.email})`);
    }
  }

  // Also ensure any old 'pending' user is standardized to 'pending_approval'
  await User.updateMany({ status: 'pending' }, { $set: { status: 'pending_approval' } });

  console.log('[Seed] 3 sample pending applicants successfully seeded!');
  await disconnectDatabase();
  process.exit(0);
}

seedPendingApplicants().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});

