import multer from 'multer';
import { AppError } from '../utils/apiError';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

const ALLOWED_DESIGN_MIMES = new Set([
  ...ALLOWED_IMAGE_MIMES,
  'application/pdf',
  'application/postscript',
]);

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per image
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.has(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported image format: ${file.mimetype}. Allowed: JPG, PNG, WEBP, GIF, SVG.`, 400));
    }
  },
});

export const uploadDesignFile = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max for print/design assets
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DESIGN_MIMES.has(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported file format: ${file.mimetype}.`, 400));
    }
  },
});

