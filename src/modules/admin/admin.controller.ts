import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const getAdmins = asyncHandler(async (req: Request, res: Response) => {
  const result = await AdminService.getAdmins(req.query);
  return ApiResponse.success(res, 200, 'Admins retrieved successfully', result.admins, result.meta);
});

export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const result = await AdminService.createAdmin(req.body);
  return ApiResponse.success(res, 201, 'Admin created successfully', result);
});

export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await AdminService.updateAdmin(id, req.body);
  return ApiResponse.success(res, 200, 'Admin updated successfully', result);
});

export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await AdminService.deleteAdmin(id);
  return ApiResponse.success(res, 200, 'Admin deleted successfully');
});

export const getDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const result = await AdminService.getDashboardStats();
  return ApiResponse.success(res, 200, 'Dashboard stats retrieved successfully', result);
});
