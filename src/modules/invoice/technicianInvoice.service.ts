import { TechnicianInvoice, ITechAppointment } from './invoice.model';
import { NotificationService } from '../notification/notification.service';
import { AppError } from '../../utils/apiError';
import { buildInvoicePdfBuffer, type IPdfLine } from './invoice.pdf';

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const findTechInvoiceOrThrow = async (id: string) => {
  const clean = decodeURIComponent(String(id || '').trim());
  const clauses: any[] = [{ invoiceNumber: clean }];
  if (OBJECT_ID_RE.test(clean)) clauses.unshift({ _id: clean });
  const doc = await TechnicianInvoice.findOne({ $or: clauses });
  if (!doc) throw new AppError('Technician invoice not found.', 404);
  return doc;
};

export function recalculateTechTotals(doc: any) {
  let servicesTotal = 0;
  let baseMileageSum = 0;
  for (const appt of doc.appointmentList || []) {
    for (const svc of appt.services || []) {
      if (!svc.enabled) continue;
      const eff = svc.overrideAmount !== null && svc.overrideAmount !== undefined ? Number(svc.overrideAmount) : Number(svc.payout);
      servicesTotal += Number.isFinite(eff) ? eff : 0;
    }
    for (const cf of appt.customFees || []) {
      servicesTotal += Number(cf.amount) || 0;
    }
    baseMileageSum += Number(appt.mileageFee) || 0;
  }

  const calculatedMileage = Number(doc.mileageCost) > 0 ? Number(doc.mileageCost) : baseMileageSum;
  const mileageTotalFee = doc.mileageOverride?.isOverridden && doc.mileageOverride.amount !== null && doc.mileageOverride.amount !== undefined
    ? Number(doc.mileageOverride.amount)
    : calculatedMileage;

  doc.servicesTotal = Number(servicesTotal.toFixed(2));
  doc.mileageTotalFee = Number(mileageTotalFee.toFixed(2));
  doc.charge = Number((doc.servicesTotal + doc.mileageTotalFee).toFixed(2));
}

const formatSummaryRow = (doc: any) => ({
  id: doc._id.toString(),
  _id: doc._id.toString(),
  invoiceNumber: doc.invoiceNumber,
  technicianName: doc.technicianName,
  technicianEmail: doc.technicianEmail || '',
  technicianAvatar: doc.technicianAvatar || '',
  role: doc.role,
  dateRange: doc.dateRange,
  periodStart: doc.periodStart || '',
  periodEnd: doc.periodEnd || '',
  appointments: Array.isArray(doc.appointmentList) ? doc.appointmentList.length : 0,
  edited: doc.edited || 'No',
  servicesTotal: Number(doc.servicesTotal) || 0,
  mileageTotalFee: Number(doc.mileageTotalFee) || 0,
  charge: Number(doc.charge) || 0,
  status: doc.status || 'pending',
  paidAt: doc.paidAt || '',
  paymentMethod: doc.paymentMethod || '',
});

const formatFullTechInvoice = (doc: any) => ({
  ...formatSummaryRow(doc),
  mileageTotal: Number(doc.mileageTotal) || 0,
  billableMileage: Number(doc.billableMileage) || 0,
  mileageCost: Number(doc.mileageCost) || 0,
  mileageOverride: doc.mileageOverride || { amount: null, note: '', isOverridden: false },
  appointmentList: Array.isArray(doc.appointmentList) ? doc.appointmentList : [],
  paymentReference: doc.paymentReference || '',
});

export class TechnicianInvoiceService {
  static async getInvoices(query: { status?: string; technician?: string; days?: any; searchQuery?: string }) {
    const docs = await TechnicianInvoice.find({}).sort({ periodEnd: -1, createdAt: -1 }).lean();

    const daysNum = Number(query.days);
    const cutoffMs = Number.isFinite(daysNum) && daysNum > 0 ? Date.now() - daysNum * 86400000 : 0;
    const search = String(query.searchQuery || '').trim().toLowerCase();

    const filtered = docs.filter((d: any) => {
      if (query.technician && query.technician !== 'all' && d.technicianName !== query.technician) return false;
      if (cutoffMs > 0) {
        const refDate = d.periodEnd ? new Date(d.periodEnd).getTime() : new Date(d.createdAt).getTime();
        if (Number.isFinite(refDate) && refDate < cutoffMs) return false;
      }
      if (search) {
        const hay = `${d.technicianName} ${d.invoiceNumber} ${d.role}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const summary = {
      pendingCount: filtered.filter((d: any) => d.status === 'pending').length,
      paidCount: filtered.filter((d: any) => d.status === 'paid').length,
      pendingAmount: filtered.filter((d: any) => d.status === 'pending').reduce((s, d: any) => s + (Number(d.charge) || 0), 0),
      paidAmount: filtered.filter((d: any) => d.status === 'paid').reduce((s, d: any) => s + (Number(d.charge) || 0), 0),
    };

    const rows = query.status && query.status !== 'all'
      ? filtered.filter((d: any) => d.status === query.status)
      : filtered;

    const technicians = Array.from(new Set(docs.map((d: any) => String(d.technicianName))));

    return {
      invoices: rows.map(formatSummaryRow),
      summary,
      technicians,
    };
  }

  static async getInvoiceById(id: string) {
    const doc = await findTechInvoiceOrThrow(id);
    return formatFullTechInvoice(doc.toObject());
  }

  static async payInvoice(id: string, payload: { paymentMethod?: string; reference?: string }) {
    const doc = await findTechInvoiceOrThrow(id);
    doc.status = 'paid';
    doc.paidAt = new Date().toISOString().split('T')[0];
    doc.paymentMethod = payload.paymentMethod || 'ACH / Direct Deposit';
    doc.paymentReference = payload.reference || `PAY-${Date.now().toString().slice(-6)}`;
    await doc.save();

    await NotificationService.safeNotify({
      recipientEmail: doc.technicianEmail || undefined,
      recipientRole: doc.role,
      title: `Technician Payout Paid (${doc.invoiceNumber})`,
      message: `$${Number(doc.charge).toFixed(2)} payout marked as paid for ${doc.dateRange}.`,
      type: 'system',
      referenceId: doc.invoiceNumber,
    });

    return formatFullTechInvoice(doc.toObject());
  }

  static async updateAppointment(
    invoiceId: string,
    appointmentId: string,
    payload: { services?: any[]; customFees?: any[] }
  ) {
    const doc = await findTechInvoiceOrThrow(invoiceId);
    const appt = doc.appointmentList.find((a: ITechAppointment) => a.id === appointmentId);
    if (!appt) throw new AppError('Appointment not found on this invoice.', 404);

    if (Array.isArray(payload.services)) {
      appt.services = payload.services.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        category: s.category === 'addon' ? 'addon' : 'base',
        icon: s.icon || 'wrench',
        subtitle: s.subtitle || '',
        payout: Number(s.payout) || 0,
        overrideAmount: s.overrideAmount !== '' && s.overrideAmount !== null && s.overrideAmount !== undefined
          ? Number(s.overrideAmount)
          : null,
        overrideReason: String(s.overrideReason || '').trim(),
        enabled: s.enabled !== false,
      }));
    }

    if (Array.isArray(payload.customFees)) {
      appt.customFees = payload.customFees
        .filter((f) => Number(f.amount) > 0)
        .map((f, idx) => ({
          id: String(f.id || `cf-${Date.now()}-${idx}`),
          amount: Number(f.amount) || 0,
          reason: String(f.reason || 'Custom adjustment').trim(),
        }));
    }

    doc.edited = 'Yes';
    recalculateTechTotals(doc);
    await doc.save();

    return formatFullTechInvoice(doc.toObject());
  }

  static async updateMileage(
    invoiceId: string,
    payload: { amount?: number | string; note?: string; removeOverride?: boolean }
  ) {
    const doc = await findTechInvoiceOrThrow(invoiceId);

    if (payload.removeOverride) {
      doc.mileageOverride = { amount: null, note: '', isOverridden: false };
    } else {
      const amt = Number(String(payload.amount ?? '').replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(amt) || amt < 0) throw new AppError('Valid mileage amount is required.', 400);
      doc.mileageOverride = {
        amount: Number(amt.toFixed(2)),
        note: String(payload.note || '').trim(),
        isOverridden: true,
      };
      doc.edited = 'Yes';
    }

    recalculateTechTotals(doc);
    await doc.save();

    return formatFullTechInvoice(doc.toObject());
  }

  static async generatePdf(id: string): Promise<{ filename: string; buffer: Buffer }> {
    const doc = await findTechInvoiceOrThrow(id);
    const lines: IPdfLine[] = [
      { text: `Invoice Number: ${doc.invoiceNumber}`, bold: true, size: 11 },
      { text: `Technician: ${doc.technicianName} (${doc.role})` },
      { text: `Date Range: ${doc.dateRange}` },
      { text: `Status: ${doc.status.toUpperCase()}${doc.paidAt ? ` (Paid ${doc.paidAt})` : ''}`, bold: true },
      { text: '' },
      { text: `APPOINTMENTS (${doc.appointmentList.length})`, bold: true, size: 11 },
      ...doc.appointmentList.flatMap((a) => {
        const svcTotal = a.services
          .filter((s) => s.enabled)
          .reduce((sum, s) => sum + (s.overrideAmount ?? s.payout), 0);
        const cfTotal = a.customFees.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
        return [
          { text: `  * [${a.date}] ${a.address}`, bold: true },
          { text: `    Services: $${svcTotal.toFixed(2)} | Custom Fees: $${cfTotal.toFixed(2)}` },
        ];
      }),
      { text: '' },
      { text: `Services Total: $${Number(doc.servicesTotal).toFixed(2)}` },
      { text: `Mileage Total: $${Number(doc.mileageTotalFee).toFixed(2)}` },
      { text: `TOTAL PAYOUT: $${Number(doc.charge).toFixed(2)}`, bold: true, size: 12 },
    ];

    return {
      filename: `${doc.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`,
      buffer: buildInvoicePdfBuffer(`Technician Payout ${doc.invoiceNumber}`, lines),
    };
  }
}

