import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri:
    process.env.MONGODB_URI ||
    'mongodb+srv://tssstagpt_db_user:cuXpzBVmGoZYaAz1@instapost.crx2kfi.mongodb.net/instapost?retryWrites=true&w=majority',
  jwt: {
    secret: process.env.JWT_TOKEN || 'instapost_jwt_secret_dev_key_2026_super_secure_token',
    expiresIn: process.env.JWT_TOKEN_EXPIRY || '7d',
    refreshSecret:
      process.env.JWT_REFRESH_TOKEN || 'instapost_jwt_refresh_secret_key_2026_super_secure',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '30d',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  smtp: {
    email: process.env.OTP_EMAIL || 'mail.sparktechai@gmail.com',
    password: process.env.OTP_APP_PASSWORD || 'xqpf hjfp kvdl mmrp',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'mail.sparktechai@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'Test@123',
  },
};

