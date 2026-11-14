import { connectDatabase, disconnectDatabase } from '../config/database';
import { OpsService } from '../modules/ops/ops.service';

const INITIAL_CONTACT_US = {
  emails: ['Instasigntracker@gmail.com', 'letstalk@gmail.com'],
  phones: ['#404-694-6924', '(+1) (888) 785-3986'],
  socials: [
    { platform: 'Facebook', url: '', icon: 'facebook' },
    { platform: 'YouTube', url: '', icon: 'youtube' },
    { platform: 'Instagram', url: '', icon: 'instagram' },
  ],
};

async function seedContactUs() {
  await connectDatabase();

  const existing = await OpsService.getSetting('contact_us');
  if (existing?.value) {
    console.log('[Seed] Skipped contact_us migration — setting already exists in database.');
    await disconnectDatabase();
    return;
  }

  await OpsService.upsertSetting('contact_us', INITIAL_CONTACT_US, 'Seed Migration');
  console.log('[Seed] Migrated landing Contact Us settings into database.');
  await disconnectDatabase();
}

seedContactUs().catch((err) => {
  console.error('[Seed] Contact Us migration failed:', err);
  process.exit(1);
});

