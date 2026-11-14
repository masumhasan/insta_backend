import { Request, Response } from 'express';
import { OrderService } from './order.service';
import { OrderLifecycleService } from './order.lifecycle.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const result = await OrderService.getOrders(req.query, (req as any).user);
  return ApiResponse.success(res, 200, 'Orders retrieved successfully', result.orders, result.meta);
});

export const getRoutePlan = asyncHandler(async (req: Request, res: Response) => {
  const data = await OrderService.getRoutePlan(req.query as any, (req as any).user);
  return ApiResponse.success(res, 200, 'Route plan generated successfully', data);
});

export const getRevenue = asyncHandler(async (req: Request, res: Response) => {
  const data = await OrderLifecycleService.getRevenueSummary(req.query as any);
  return ApiResponse.success(res, 200, 'Revenue retrieved successfully', data);
});

export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const order = await OrderService.getOrderById(id, (req as any).user);
  return ApiResponse.success(res, 200, 'Order retrieved successfully', order);
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await OrderService.createOrder(req.body, (req as any).user);
  return ApiResponse.success(res, 201, 'Order created successfully', order);
});

export const importCsvOrders = asyncHandler(async (req: Request, res: Response) => {
  const result = await OrderLifecycleService.importCsvRows(req.body?.rows || req.body);
  return ApiResponse.success(res, 201, `Imported ${result.importedCount} orders successfully`, result);
});

export const updateOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const order = await OrderService.updateOrder(id, req.body, (req as any).user);
  return ApiResponse.success(res, 200, 'Order updated successfully', order);
});

export const assignInstaller = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { installerName, installerEmail, installerId } = req.body;
  const result = await OrderService.assignInstaller(id, {
    name: installerName,
    email: installerEmail,
    id: installerId,
  });
  return ApiResponse.success(res, 200, 'Installer assigned successfully', result);
});

export const addPhoto = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const files = req.files as Express.Multer.File[] | undefined;
  const file = req.file || (files && files.length > 0 ? files[0] : undefined);
  const { imageUrl, photoUrl, publicId } = req.body || {};

  const result = await OrderService.addPhoto(id, {
    fileBuffer: file?.buffer,
    imageUrl,
    photoUrl,
    publicId,
  });
  return ApiResponse.success(res, 200, 'Photo added successfully', result);
});

export const removePhoto = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const publicId = (req.body?.publicId as string) || (req.query?.publicId as string);
  const imageUrl = (req.body?.imageUrl as string) || (req.query?.imageUrl as string);
  const result = await OrderService.removePhoto(id, { publicId, imageUrl });
  return ApiResponse.success(res, 200, 'Photo removed successfully', result);
});

export const refundOrder = asyncHandler(async (req: Request, res: Response) => {
  const result = await OrderLifecycleService.addRefund(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Refund processed successfully', result);
});

export const requestDueDateChange = asyncHandler(async (req: Request, res: Response) => {
  const result = await OrderLifecycleService.handleDueDateRequest(
    req.params.id as string,
    {
      ...req.body,
      requestedBy: req.body?.requestedBy || (req as any).user?.name,
    },
    (req as any).user
  );
  return ApiResponse.success(res, 200, 'Due date request updated successfully', result);
});

export const updateOrderPullList = asyncHandler(async (req: Request, res: Response) => {
  const result = await OrderLifecycleService.updatePullList(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Pull list updated successfully', result);
});
