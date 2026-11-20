import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Secrets must come from the environment (.env locally, Vercel env in production). Never commit fallbacks. */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. Set it in backend/.env or the Vercel project settings.`);
  return value;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: required('MONGODB_URI'),
  jwt: {
    secret: required('JWT_TOKEN'),
    expiresIn: process.env.JWT_TOKEN_EXPIRY || '7d',
    refreshSecret: required('JWT_REFRESH_TOKEN'),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '30d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  smtp: {
    email: process.env.OTP_EMAIL || '',
    password: process.env.OTP_APP_PASSWORD || '',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },
};
