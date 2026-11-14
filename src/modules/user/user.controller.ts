import { Request, Response } from 'express';
import { UserService } from './user.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const result = await UserService.getUsers(req.query);
  return ApiResponse.success(res, 200, 'Users retrieved successfully', result.users, result.meta);
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await UserService.createUser(req.body);
  return ApiResponse.success(res, 201, 'User created successfully', result);
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await UserService.updateUser(id, req.body);
  return ApiResponse.success(res, 200, 'User updated successfully', result);
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await UserService.deleteUser(id);
  return ApiResponse.success(res, 200, 'User deleted successfully');
});

export const approveUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await UserService.approveUser(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'User approval updated successfully', result);
});

export const requestTeamLead = asyncHandler(async (req: Request, res: Response) => {
  const result = await UserService.requestTeamLead(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Team lead application submitted', result);
});

export const addCrmNote = asyncHandler(async (req: Request, res: Response) => {
  const result = await UserService.addCrmNote(req.params.id as string, req.body);
  return ApiResponse.success(res, 201, 'CRM note added successfully', result);
});

