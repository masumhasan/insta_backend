import { Request, Response } from 'express';
import { InventoryService } from './inventory.service';
import { InventoryReturnService } from './return.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const getInventory = asyncHandler(async (req: Request, res: Response) => {
  const data = await InventoryService.getInventory(req.query);
  return ApiResponse.success(res, 200, 'Inventory items retrieved successfully', data);
});

export const createInventoryItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await InventoryService.createInventoryItem(req.body);
  return ApiResponse.success(res, 201, 'Inventory item created successfully', data);
});

export const updateInventoryItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await InventoryService.updateInventoryItem(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Inventory item updated successfully', data);
});

export const deleteInventoryItem = asyncHandler(async (req: Request, res: Response) => {
  await InventoryService.deleteInventoryItem(req.params.id as string);
  return ApiResponse.success(res, 200, 'Inventory item deleted successfully');
});

export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { deltaAvailable, deltaInstalled } = req.body;
  const data = await InventoryService.adjustStock(id, Number(deltaAvailable) || 0, Number(deltaInstalled) || 0);
  return ApiResponse.success(res, 200, 'Stock adjusted successfully', data);
});

export const importInventoryCsv = asyncHandler(async (req: Request, res: Response) => {
  const data = await InventoryService.importCsv(req.body?.rows || req.body);
  return ApiResponse.success(res, 201, `Imported ${data.importedCount} inventory items`, data);
});

export const getReturns = asyncHandler(async (req: Request, res: Response) => {
  const data = await InventoryReturnService.getReturns(req.query as any);
  return ApiResponse.success(res, 200, 'Return records retrieved successfully', data);
});

export const createReturn = asyncHandler(async (req: Request, res: Response) => {
  const data = await InventoryReturnService.createReturn(req.body);
  return ApiResponse.success(res, 201, 'Return processed successfully', data);
});

export const processQueueItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await InventoryReturnService.processQueueItem(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Queue item processed successfully', data);
});

export const getInventoryQr = asyncHandler(async (req: Request, res: Response) => {
  const { filename, buffer } = await InventoryService.getQrPng(String(req.params.id), req.query.code as string);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

export const getInventoryQrSvg = asyncHandler(async (req: Request, res: Response) => {
  const { filename, svg } = await InventoryService.getQrSvg(String(req.params.id), req.query.code as string);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(svg);
});

export const getInventoryLabelPdf = asyncHandler(async (req: Request, res: Response) => {
  const { filename, buffer } = await InventoryService.getLabelPdf(String(req.params.id), req.query.code as string);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});
