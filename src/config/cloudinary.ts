import { v2 as cloudinary } from 'cloudinary';
import { config } from './env';

let isConfigured = false;

export function configureCloudinary() {
  if (isConfigured) return cloudinary;

  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary credentials missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend .env.'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  isConfigured = true;
  return cloudinary;
}

export { cloudinary };

