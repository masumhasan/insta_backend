import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/apiResponse';
import { ClientInvoiceService } from './clientInvoice.service';
import { TechnicianInvoiceService } from './technicianInvoice.service';

export const getClientInvoices = asyncHandler(async (req: Request, res: Response) => {
  const result = await ClientInvoiceService.getInvoices(req.query as any, (req as any).user);
  ApiResponse.success(res, 200, 'Client invoices retrieved successfully', result.invoices, result.meta);
});

export const getClientInvoiceById = asyncHandler(async (req: Request, res: Response) => {
  const data = await ClientInvoiceService.getInvoiceById(String(req.params.id));
  ApiResponse.success(res, 200, 'Client invoice retrieved successfully', data);
});

export const createClientInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = await ClientInvoiceService.createInvoice(req.body);
  ApiResponse.success(res, 201, 'Client invoice created successfully', data);
});

export const recordClientPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = await ClientInvoiceService.recordPayment(String(req.params.id), req.body);
  ApiResponse.success(res, 200, 'Payment recorded successfully', data);
});

export const refundClientInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = await ClientInvoiceService.refundInvoice(String(req.params.id), req.body);
  ApiResponse.success(res, 200, 'Refund processed successfully', data);
});

export const downloadClientInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
  const { filename, buffer } = await ClientInvoiceService.generatePdf(String(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export const getTechnicianInvoices = asyncHandler(async (req: Request, res: Response) => {
  const result = await TechnicianInvoiceService.getInvoices(req.query as any);
  ApiResponse.success(res, 200, 'Technician invoices retrieved successfully', result);
});

export const getTechnicianInvoiceById = asyncHandler(async (req: Request, res: Response) => {
  const data = await TechnicianInvoiceService.getInvoiceById(String(req.params.id));
  ApiResponse.success(res, 200, 'Technician invoice retrieved successfully', data);
});

export const payTechnicianInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = await TechnicianInvoiceService.payInvoice(String(req.params.id), req.body);
  ApiResponse.success(res, 200, 'Technician invoice marked as paid', data);
});

export const updateTechnicianAppointment = asyncHandler(async (req: Request, res: Response) => {
  const data = await TechnicianInvoiceService.updateAppointment(
    String(req.params.id),
    String(req.params.appointmentId),
    req.body
  );
  ApiResponse.success(res, 200, 'Appointment charges updated successfully', data);
});

export const updateTechnicianMileage = asyncHandler(async (req: Request, res: Response) => {
  const data = await TechnicianInvoiceService.updateMileage(String(req.params.id), req.body);
  ApiResponse.success(res, 200, 'Mileage override updated successfully', data);
});

export const downloadTechnicianInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
  const { filename, buffer } = await TechnicianInvoiceService.generatePdf(String(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});
