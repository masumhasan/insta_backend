import { connectDatabase, disconnectDatabase } from '../config/database';
import { ServiceItem } from '../modules/catalog/service.model';

const INITIAL_LANDING_FAQS = [
  {
    name: 'Is This Built For Real Estate Agents?',
    description:
      'Yes, InstaSignTracker is specifically designed for real estate agents and sign installation companies. It helps track sign orders from installation through service calls to final removal.',
  },
  {
    name: 'Can I Use This For My Own Sign Business Only?',
    description:
      'Absolutely! InstaSignTracker works perfectly for independent sign installation businesses. You can manage your own operations without needing to connect to real estate agencies.',
  },
  {
    name: 'Do Installers Need Paid Accounts?',
    description:
      'No, installer accounts are free. You can add unlimited installers to your account at no extra cost. Only administrators and managers need paid licenses.',
  },
  {
    name: 'Do Installers Need Paid Accounts?',
    description:
      'Installer accounts are completely free. They can use the mobile app to receive job assignments, upload photos, and track their work without any subscription fees.',
  },
  {
    name: 'Do Installers Need Paid Accounts?',
    description:
      "Installers don't need paid accounts. They download the free installer app and can start working immediately once you add them to your team.",
  },
  {
    name: 'Do Installers Need Paid Accounts?',
    description:
      "No paid accounts are required for installers. The installer mobile app is free to download and use with your company's subscription.",
  },
];

async function seedFaqs() {
  await connectDatabase();

  const existingCount = await ServiceItem.countDocuments({ type: 'faq' });
  if (existingCount > 0) {
    console.log(`[Seed] Skipped FAQ migration — ${existingCount} FAQ(s) already in database.`);
    await disconnectDatabase();
    return;
  }

  // CatalogService sorts ServiceItem by createdAt descending, so stagger timestamps so item #0 is newest (Q:01).
  const baseTime = Date.now();
  const docs = INITIAL_LANDING_FAQS.map((faq, idx) => ({
    type: 'faq' as const,
    name: faq.name,
    description: faq.description,
    price: 0,
    createdAt: new Date(baseTime - idx * 1000),
    updatedAt: new Date(baseTime - idx * 1000),
  }));

  await ServiceItem.insertMany(docs);
  console.log(`[Seed] Migrated ${docs.length} landing FAQs into database.`);
  await disconnectDatabase();
}

seedFaqs().catch((err) => {
  console.error('[Seed] FAQ migration failed:', err);
  process.exit(1);
});

