import { Request, Response } from 'express';
import { CatalogService } from './catalog.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { listAddOns, listPrintOptions } from './catalog.addons';
import { listActiveAnnouncements } from './catalog.announcements';
import { AppError } from '../../utils/apiError';
import { isStaff } from '../../middlewares/roleGuard.middleware';

// Warehouses
export const getWarehouses = asyncHandler(async (req: Request, res: Response) => {
  const result = await CatalogService.getWarehouses(req.query);
  return ApiResponse.success(res, 200, 'Warehouses retrieved successfully', result.warehouses, result.meta);
});

export const createWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.createWarehouse(req.body);
  return ApiResponse.success(res, 201, 'Warehouse created successfully', data);
});

export const updateWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.updateWarehouse(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Warehouse updated successfully', data);
});

export const deleteWarehouse = asyncHandler(async (req: Request, res: Response) => {
  await CatalogService.deleteWarehouse(req.params.id as string);
  return ApiResponse.success(res, 200, 'Warehouse deleted successfully');
});

// Materials
export const getMaterials = asyncHandler(async (req: Request, res: Response) => {
  const result = await CatalogService.getMaterials(req.query);
  return ApiResponse.success(res, 200, 'Materials retrieved successfully', result.materials, result.meta);
});

export const createMaterial = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.createMaterial(req.body);
  return ApiResponse.success(res, 201, 'Material created successfully', data);
});

export const updateMaterial = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.updateMaterial(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Material updated successfully', data);
});

export const deleteMaterial = asyncHandler(async (req: Request, res: Response) => {
  await CatalogService.deleteMaterial(req.params.id as string);
  return ApiResponse.success(res, 200, 'Material deleted successfully');
});

// Packages
export const getPackages = asyncHandler(async (_req: Request, res: Response) => {
  const data = await CatalogService.getPackages();
  return ApiResponse.success(res, 200, 'Packages retrieved successfully', data);
});

export const createPackage = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.createPackage(req.body);
  return ApiResponse.success(res, 201, 'Package created successfully', data);
});

export const updatePackage = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.updatePackage(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Package updated successfully', data);
});

export const deletePackage = asyncHandler(async (req: Request, res: Response) => {
  await CatalogService.deletePackage(req.params.id as string);
  return ApiResponse.success(res, 200, 'Package deleted successfully');
});

// Coupons
export const getCoupons = asyncHandler(async (_req: Request, res: Response) => {
  const data = await CatalogService.getCoupons();
  return ApiResponse.success(res, 200, 'Coupons retrieved successfully', data);
});

export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.createCoupon(req.body);
  return ApiResponse.success(res, 201, 'Coupon created successfully', data);
});

export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.updateCoupon(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Coupon updated successfully', data);
});

export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  await CatalogService.deleteCoupon(req.params.id as string);
  return ApiResponse.success(res, 200, 'Coupon deleted successfully');
});

// Service Items
export const getServiceItems = asyncHandler(async (req: Request, res: Response) => {
  const type = (req.query.type as string) || (req.params.type as string) || 'service';
  // The full announcement list (every audience and date window) is for staff; others read /announcements/active.
  if (type === 'announcement' && !isStaff((req as any).user)) throw new AppError('Access forbidden.', 403);
  const data = await CatalogService.getServiceItems(type);
  return ApiResponse.success(res, 200, `${type} items retrieved successfully`, data);
});

export const createServiceItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.createServiceItem(req.body);
  return ApiResponse.success(res, 201, 'Service item created successfully', data);
});

export const updateServiceItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await CatalogService.updateServiceItem(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Service item updated successfully', data);
});

export const deleteServiceItem = asyncHandler(async (req: Request, res: Response) => {
  await CatalogService.deleteServiceItem(req.params.id as string);
  return ApiResponse.success(res, 200, 'Service item deleted successfully');
});

// Active add-ons of one order form (?orderType=sign_installations|for_sale|open_house|media_service|other_services)
export const getAddOns = asyncHandler(async (req: Request, res: Response) => {
  const data = await listAddOns(req.query.orderType ?? req.query.type, (req as any).user);
  return ApiResponse.success(res, 200, 'Add-ons retrieved successfully', data);
});

// Active print options (?appliesTo=sign|rider)
export const getPrintOptions = asyncHandler(async (req: Request, res: Response) => {
  const data = await listPrintOptions(req.query.appliesTo);
  return ApiResponse.success(res, 200, 'Print options retrieved successfully', data);
});

// Filtered by the caller's role and the date window on the server; a ?portal= hint is ignored.
export const getActiveAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const data = await listActiveAnnouncements(String((req as any).user?.role || ''));
  return ApiResponse.success(res, 200, "Active announcements retrieved", data);
});
