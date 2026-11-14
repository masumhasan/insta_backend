import { connectDatabase, disconnectDatabase } from '../config/database';
import { ClientInvoice, TechnicianInvoice } from '../modules/invoice/invoice.model';
import { recalculateTechTotals } from '../modules/invoice/technicianInvoice.service';
import { DEMO_CLIENT_INVOICES } from './seedInvoices.client.data';
import { DEMO_TECH_INVOICES } from './seedInvoices.tech.data';

async function seedInvoices() {
  await connectDatabase();

  for (const inv of DEMO_CLIENT_INVOICES) {
    await ClientInvoice.updateOne({ invoiceNo: inv.invoiceNo }, { $set: inv }, { upsert: true });
  }

  for (const tinv of DEMO_TECH_INVOICES) {
    const computed = { ...tinv, servicesTotal: 0, mileageTotalFee: 0, charge: 0 };
    recalculateTechTotals(computed);
    await TechnicianInvoice.updateOne(
      { invoiceNumber: computed.invoiceNumber },
      { $set: computed },
      { upsert: true }
    );
  }

  const [clientCount, techCount] = await Promise.all([
    ClientInvoice.countDocuments(),
    TechnicianInvoice.countDocuments(),
  ]);
  console.log(`[Seed] Invoices pushed cleanly — ClientInvoices: ${clientCount}, TechnicianInvoices: ${techCount}`);
  await disconnectDatabase();
}

seedInvoices().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
