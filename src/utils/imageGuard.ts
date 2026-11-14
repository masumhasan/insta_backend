import { AppError } from './apiError';
import { isBase64DataUri, CloudinaryService } from './cloudinary.service';

export function assertNoBase64(value?: unknown, fieldName = 'image'): void {
  if (typeof value === 'string' && isBase64DataUri(value)) {
    throw new AppError(
      `Base64 data URI in "${fieldName}" is prohibited. Upload the file to /upload/image and submit the returned Cloudinary imageUrl and publicId.`,
      400
    );
  }
}

export function extractImageFields(payload: any): {
  hasImageUpdate: boolean;
  imageUrl: string;
  publicId: string;
} {
  const rawUrl =
    payload?.imageUrl !== undefined
      ? payload.imageUrl
      : payload?.image !== undefined
      ? payload.image
      : payload?.options?.imageUrl !== undefined
      ? payload.options.imageUrl
      : payload?.options?.image;

  assertNoBase64(rawUrl, 'imageUrl');

  if (typeof rawUrl === 'string' && rawUrl.startsWith('blob:')) {
    throw new AppError('Temporary blob URLs cannot be saved. Upload to Cloudinary first.', 400);
  }

  const hasImageUpdate =
    payload?.imageUrl !== undefined ||
    payload?.image !== undefined ||
    payload?.options?.imageUrl !== undefined ||
    payload?.options?.image !== undefined;

  return {
    hasImageUpdate,
    imageUrl: typeof rawUrl === 'string' ? rawUrl.trim() : '',
    publicId: typeof payload?.publicId === 'string' ? payload.publicId.trim() : '',
  };
}

export async function cleanupReplacedAsset(
  previousPublicId?: string | null,
  nextPublicId?: string | null
): Promise<void> {
  if (previousPublicId && previousPublicId !== nextPublicId) {
    await CloudinaryService.deleteAsset(previousPublicId);
  }
}

