import { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { configureCloudinary } from '../config/cloudinary';
import { config } from '../config/env';
import { AppError } from './apiError';

export interface CloudinaryUploadResult {
  imageUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

const VALID_FOLDERS = new Set([
  'orders',
  'users',
  'packages',
  'services',
  'inventory',
  'announcements',
  'company',
  'designs',
  'assets',
  'general',
]);

export function sanitizeFolder(folder?: string): string {
  const clean = (folder || 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const sub = VALID_FOLDERS.has(clean) ? clean : 'general';
  return `instapost/${sub}`;
}

export function isBase64DataUri(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return /^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(value.trim());
}

export function isOurCloudinaryUrl(value?: string | null): boolean {
  if (!value || typeof value !== 'string' || !config.cloudinary.cloudName) return false;
  return value.startsWith(`https://res.cloudinary.com/${config.cloudinary.cloudName}/`);
}

function mapResult(result: UploadApiResponse): CloudinaryUploadResult {
  return {
    imageUrl: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
}

export class CloudinaryService {
  static async uploadBuffer(
    buffer: Buffer,
    folder: string = 'general',
    options: Partial<UploadApiOptions> = {}
  ): Promise<CloudinaryUploadResult> {
    if (!buffer || buffer.length === 0) {
      throw new AppError('Empty file buffer cannot be uploaded.', 400);
    }

    const cloudinary = configureCloudinary();
    const targetFolder = sanitizeFolder(folder);

    return new Promise((resolve, reject) => {
      const uploadOptions: UploadApiOptions = {
        folder: targetFolder,
        resource_type: 'auto',
        ...options,
      };

      const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
        if (err || !result) {
          return reject(
            new AppError(err?.message || 'Cloudinary upload failed.', (err as any)?.http_code || 502)
          );
        }
        resolve(mapResult(result));
      });

      stream.end(buffer);
    });
  }

  static async uploadFromSource(
    source: string,
    folder: string = 'general',
    options: Partial<UploadApiOptions> = {}
  ): Promise<CloudinaryUploadResult> {
    if (!source || typeof source !== 'string') {
      throw new AppError('Invalid image source for Cloudinary upload.', 400);
    }

    const cloudinary = configureCloudinary();
    const targetFolder = sanitizeFolder(folder);

    try {
      const result = await cloudinary.uploader.upload(source, {
        folder: targetFolder,
        resource_type: 'auto',
        ...options,
      });
      return mapResult(result);
    } catch (err: any) {
      throw new AppError(err?.message || 'Cloudinary upload from source failed.', err?.http_code || 502);
    }
  }

  static async deleteAsset(publicId?: string | null): Promise<boolean> {
    if (!publicId || typeof publicId !== 'string' || !publicId.trim()) {
      return false;
    }

    try {
      const cloudinary = configureCloudinary();
      const res = await cloudinary.uploader.destroy(publicId.trim(), { invalidate: true });
      return res?.result === 'ok' || res?.result === 'not found';
    } catch (err: any) {
      console.error(`[Cloudinary] Failed to delete asset ${publicId}:`, err?.message || err);
      return false;
    }
  }

  static async replaceAsset(
    buffer: Buffer,
    oldPublicId?: string | null,
    folder: string = 'general'
  ): Promise<CloudinaryUploadResult> {
    const uploaded = await this.uploadBuffer(buffer, folder);
    if (oldPublicId && oldPublicId !== uploaded.publicId) {
      await this.deleteAsset(oldPublicId);
    }
    return uploaded;
  }
}

