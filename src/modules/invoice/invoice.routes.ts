import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorizeRoles, STAFF_ROLES } from '../../middlewares/roleGuard.middleware';
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
const staffOnly = authorizeRoles(...STAFF_ROLES);
// Client invoices are for the business and for the customers they were issued to. Installers and the warehouse never need them.
const invoiceReaders = authorizeRoles(...STAFF_ROLES, 'Agent', 'Team Lead', 'Assistant');

router.use(authenticate);

// Client Invoices (Sign Company -> Invoices -> Client & Admin -> Invoice)
router.get('/client', invoiceReaders, getClientInvoices);
router.post('/client', staffOnly, createClientInvoice);
router.get('/client/:id/pdf', invoiceReaders, downloadClientInvoicePdf);
router.get('/client/:id', invoiceReaders, getClientInvoiceById);
router.post('/client/:id/pay', staffOnly, recordClientPayment);
router.post('/client/:id/refund', staffOnly, refundClientInvoice);

// Technician Invoices (Sign Company -> Invoices -> Technician)
// Technician invoices hold payroll data: staff only.
router.use('/technicians', staffOnly);
router.get('/technicians', getTechnicianInvoices);
router.get('/technicians/:id/pdf', downloadTechnicianInvoicePdf);
router.get('/technicians/:id', getTechnicianInvoiceById);
router.post('/technicians/:id/pay', payTechnicianInvoice);
router.patch('/technicians/:id/appointments/:appointmentId', updateTechnicianAppointment);
router.patch('/technicians/:id/mileage', updateTechnicianMileage);

export const invoiceRoutes = router;

