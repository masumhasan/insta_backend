import { Request, Response } from 'express';
import { OpsService } from './ops.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const getSetting = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.getSetting(req.params.key as string);
  return ApiResponse.success(res, 200, 'Setting retrieved', data);
});

export const upsertSetting = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.upsertSetting(req.params.key as string, req.body?.value ?? req.body, (req as any).user?.name);
  return ApiResponse.success(res, 200, 'Setting saved', data);
});

export const getMediaTasks = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.getMediaTasks(req.query as any);
  return ApiResponse.success(res, 200, 'Media tasks retrieved', data);
});

export const createMediaTask = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.createMediaTask(req.body);
  return ApiResponse.success(res, 201, 'Media task created', data);
});

export const updateMediaTask = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.updateMediaTask(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Media task updated', data);
});

export const addTaskNote = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.addTaskNote(req.params.id as string, {
    ...req.body,
    author: req.body?.author || (req as any).user?.name,
  });
  return ApiResponse.success(res, 201, 'Note added', data);
});

export const getCalendarEvents = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.getCalendarEvents(req.query as any);
  return ApiResponse.success(res, 200, 'Calendar events retrieved', data);
});

export const createCalendarEvent = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.createCalendarEvent(req.body);
  return ApiResponse.success(res, 201, 'Calendar event created', data);
});

export const deleteCalendarEvent = asyncHandler(async (req: Request, res: Response) => {
  await OpsService.deleteCalendarEvent(req.params.id as string);
  return ApiResponse.success(res, 200, 'Calendar event removed');
});

export const getAvailableSlots = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.getAvailableSlots(req.query as any);
  return ApiResponse.success(res, 200, 'Available slots computed', data);
});

export const getMediaDeliveries = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.getMediaDeliveries(req.query as any);
  return ApiResponse.success(res, 200, 'Media deliveries retrieved', data);
});

export const createMediaDelivery = asyncHandler(async (req: Request, res: Response) => {
  const data = await OpsService.createMediaDelivery(req.body);
  return ApiResponse.success(res, 201, 'Media delivery created', data);
});

