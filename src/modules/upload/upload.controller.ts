import { Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse';
import { AppError } from '../../utils/apiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { CloudinaryService, CloudinaryUploadResult } from '../../utils/cloudinary.service';

export const uploadSingleImage = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const file = req.file || (files && files.length > 0 ? files[0] : undefined);

  if (!file) {
    throw new AppError('No image file provided.', 400);
  }

  const folder = typeof req.body?.folder === 'string' ? req.body.folder : 'general';
  const oldPublicId = typeof req.body?.oldPublicId === 'string' ? req.body.oldPublicId : undefined;

  const result = oldPublicId
    ? await CloudinaryService.replaceAsset(file.buffer, oldPublicId, folder)
    : await CloudinaryService.uploadBuffer(file.buffer, folder);

  return ApiResponse.success(res, 200, 'Image uploaded to Cloudinary successfully', result);
});

export const uploadMultipleImages = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    throw new AppError('No image files provided.', 400);
  }

  const folder = typeof req.body?.folder === 'string' ? req.body.folder : 'general';
  const uploaded: CloudinaryUploadResult[] = [];

  try {
    for (const file of files) {
      const resItem = await CloudinaryService.uploadBuffer(file.buffer, folder);
      uploaded.push(resItem);
    }
    return ApiResponse.success(res, 200, 'Images uploaded to Cloudinary successfully', {
      images: uploaded,
    });
  } catch (err) {
    // Cleanup partial batch on failure so no orphaned assets stay in Cloudinary
    await Promise.all(uploaded.map((item) => CloudinaryService.deleteAsset(item.publicId)));
    throw err;
  }
});

export const deleteUploadedImage = asyncHandler(async (req: Request, res: Response) => {
  const publicId =
    (typeof req.body?.publicId === 'string' && req.body.publicId) ||
    (typeof req.query?.publicId === 'string' && req.query.publicId) ||
    '';

  if (!publicId) {
    throw new AppError('publicId is required to delete an image.', 400);
  }

  const deleted = await CloudinaryService.deleteAsset(publicId);
  return ApiResponse.success(res, 200, 'Image deleted from Cloudinary', { deleted, publicId });
});
