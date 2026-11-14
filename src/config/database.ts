import mongoose from 'mongoose';
import { config } from './env';

let isConnecting = false;

const isDbConnected = (): boolean => (mongoose.connection.readyState as number) === 1;

export const connectDatabase = async (): Promise<void> => {
  // If already connected, reuse existing connection (crucial for serverless)
  if (isDbConnected()) {
    return;
  }

  // If a connection attempt is already in progress, wait for it to complete
  if (isConnecting || (mongoose.connection.readyState as number) === 2) {
    await new Promise<void>((resolve) => {
      const onDone = () => {
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, 5000);

      const cleanup = () => {
        clearTimeout(timer);
        mongoose.connection.removeListener('connected', onDone);
        mongoose.connection.removeListener('error', onDone);
      };

      mongoose.connection.once('connected', onDone);
      mongoose.connection.once('error', onDone);
    });

    if (isDbConnected()) {
      return;
    }
  }

  try {
    isConnecting = true;
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: config.env !== 'production',
    });
    console.log('[Database] MongoDB Atlas connected successfully');
  } catch (error) {
    console.error('[Database] MongoDB connection failed:', error);
    // In serverless / production environments, avoid killing the process so errors are caught gracefully
    if (config.env !== 'production' && !process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  } finally {
    isConnecting = false;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[Database] Disconnected from MongoDB');
  }
};
