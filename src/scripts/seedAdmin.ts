import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../modules/auth/user.model';
import { config } from '../config/env';

async function seedAdmin() {
  await connectDatabase();

  const adminEmail = config.admin.email.toLowerCase();
  const existing = await User.findOne({ email: adminEmail });

  if (existing) {
    console.log(`[Seed] Admin user already exists (${adminEmail}). Updating password & status...`);
    existing.password = config.admin.password;
    existing.role = 'Admin';
    existing.status = 'active';
    existing.failedLoginAttempts = 0;
    existing.lockUntil = undefined;
    await existing.save();
    console.log(`[Seed] Admin user updated successfully!`);
  } else {
    console.log(`[Seed] Creating admin user: ${adminEmail}...`);
    await User.create({
      name: 'Super Admin',
      email: adminEmail,
      password: config.admin.password,
      role: 'Admin',
      phone: '+1 (555) 000-0000',
      company: 'Instapost LLC',
      status: 'active',
    });
    console.log(`[Seed] Admin user created successfully!`);
  }

  await disconnectDatabase();
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});

