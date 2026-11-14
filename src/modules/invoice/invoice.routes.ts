import { Router } from 'express';
import {
  getClientInvoices,
  getClientInvoiceById,
  createClientInvoice,
  recordClientPayment,
  refundClientInvoice,
  downloadClientInvoicePdf,
  getTechnicianInvoices,
  getTechnicianInvoiceById,
  payTechnicianInvoice,
  updateTechnicianAppointment,
  updateTechnicianMileage,
  downloadTechnicianInvoicePdf,
} from './invoice.controller';

const router = Router();

// Client Invoices (Sign Company -> Invoices -> Client & Admin -> Invoice)
router.get('/client', getClientInvoices);
router.post('/client', createClientInvoice);
router.get('/client/:id/pdf', downloadClientInvoicePdf);
router.get('/client/:id', getClientInvoiceById);
router.post('/client/:id/pay', recordClientPayment);
router.post('/client/:id/refund', refundClientInvoice);

// Technician Invoices (Sign Company -> Invoices -> Technician)
router.get('/technicians', getTechnicianInvoices);
router.get('/technicians/:id/pdf', downloadTechnicianInvoicePdf);
router.get('/technicians/:id', getTechnicianInvoiceById);
router.post('/technicians/:id/pay', payTechnicianInvoice);
router.patch('/technicians/:id/appointments/:appointmentId', updateTechnicianAppointment);
router.patch('/technicians/:id/mileage', updateTechnicianMileage);

export const invoiceRoutes = router;

