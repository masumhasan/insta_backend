import { connectDatabase, disconnectDatabase } from '../config/database';
import { ServiceItem } from '../modules/catalog/service.model';

/**
 * Info popups shown next to order-form fields (the little "i" icons).
 * name = field key used by the forms, category = form name, description = the message (editable in Settings).
 */
const DEFAULT_POPUPS = [
  { name: 'upload-image', category: 'New Sign Install', description: 'Upload a photo of the property' },
  {
    name: 'address-confirmation',
    category: 'New Sign Install',
    description:
      'Confirm the address includes the direction and street type (e.g. North, South, East, West; Street, Court, Avenue, Circle) so the installer goes to the right property.',
  },
  { name: 'post-type', category: 'New Sign Install', description: 'Choose the post type(s) for this install. You can add more than one post type and set a quantity for each.' },
  { name: 'rush-order', category: 'New Sign Install', description: 'Rush orders are installed the same day as the order and include a rush fee.' },
  { name: 'asap-order', category: 'New Sign Install', description: 'ASAP orders use the order date as the due date.' },
  { name: 'gate-code', category: 'New Sign Install', description: 'Enter any gate or access code the installer needs to reach the property.' },
  { name: 'sign-placement', category: 'New Sign Install', description: 'Tell the installer where the sign should be placed on the property.' },
  { name: 'agent-lockbox', category: 'New Sign Install', description: 'Choose one of your lockboxes, or rent one from the sign company. Your own lockbox price is set by the sign company.' },
  { name: 'rider-selection', category: 'New Sign Install', description: 'Riders attach above or below the main panel. Only riders from your inventory and the sign company rentals are shown.' },
  { name: 'main-panel', category: 'New Sign Install', description: 'Main panels shown are the ones that fit the post type you selected.' },
  { name: 'save-favorite', category: 'New Sign Install', description: 'Save this layout as a favorite to reuse it on future orders.' },
  { name: 'site-warnings', category: 'New Sign Install', description: 'Let the installer know about sprinklers, dog fences or restricted access.' },
];

async function seedInfoPopups() {
  await connectDatabase();
  let created = 0;
  for (const p of DEFAULT_POPUPS) {
    const exists = await ServiceItem.exists({ type: 'info_popup', name: p.name });
    if (exists) continue;
    await ServiceItem.create({ type: 'info_popup', name: p.name, category: p.category, description: p.description, price: 0 });
    created += 1;
  }
  console.log(`[Seed] Info popups: ${created} created, ${DEFAULT_POPUPS.length - created} already present.`);
  await disconnectDatabase();
}

seedInfoPopups().catch((err) => {
  console.error('[Seed] Info popup seed failed:', err);
  process.exit(1);
});
