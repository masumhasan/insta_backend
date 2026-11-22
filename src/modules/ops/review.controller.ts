import { Request, Response } from 'express';
import { ReviewService } from './review.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';

export const getPublishedReviews = asyncHandler(async (_req: Request, res: Response) => {
  const data = await ReviewService.listPublished();
  return ApiResponse.success(res, 200, 'Reviews retrieved', data);
});

export const getReviews = asyncHandler(async (req: Request, res: Response) => {
  const data = await ReviewService.listAll(req.query as any);
  return ApiResponse.success(res, 200, 'Reviews retrieved', data);
});

export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const data = await ReviewService.create(req.body, (req as any).user?.name);
  return ApiResponse.success(res, 201, 'Review created', data);
});

export const updateReview = asyncHandler(async (req: Request, res: Response) => {
  const data = await ReviewService.update(req.params.id as string, req.body);
  return ApiResponse.success(res, 200, 'Review updated', data);
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  await ReviewService.remove(req.params.id as string);
  return ApiResponse.success(res, 200, 'Review deleted');
});
