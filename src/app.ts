import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { notFoundHandler } from './middlewares/notFoundHandler';
import { errorHandler } from './middlewares/errorHandler';
import { optionalAuthenticate } from './middlewares/auth.middleware';
import { connectDatabase } from './config/database';
import mongoose from 'mongoose';
import { authRoutes } from './modules/auth/auth.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { userRoutes } from './modules/user/user.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { orderRoutes } from './modules/order/order.routes';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { uploadRoutes } from './modules/upload/upload.routes';
import { notificationRoutes } from './modules/notification/notification.routes';
import { opsRoutes } from './modules/ops/ops.routes';
import { invoiceRoutes } from './modules/invoice/invoice.routes';

const app: Application = express();

// Security and utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin or localhost / 127.0.0.1 on any port
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev/staging to avoid blocking frontend portals
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-reset-token'],
  })
);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(optionalAuthenticate);

// Health check endpoints
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'connecting/disconnected',
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'connecting/disconnected',
  });
});

// Serverless / Lambda database connection middleware
// Ensures MongoDB connection is established and reused for all incoming API routes
app.use(async (_req: Request, _res: Response, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

// Auth Routes (mounted on both /auth and /api/v1/auth for portal compatibility)
app.use('/auth', authRoutes);
app.use('/api/v1/auth', authRoutes);

// Admin Routes (mounted on both /admin and /api/v1/admin for portal compatibility)
app.use('/admin', adminRoutes);
app.use('/api/v1/admin', adminRoutes);

// Users Management Routes
app.use('/admin/users', userRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/users', userRoutes);

// Catalog Routes
app.use('/catalog', catalogRoutes);
app.use('/api/v1/catalog', catalogRoutes);

// Orders Routes (used by Admin, Sign Company, Installer)
app.use('/orders', orderRoutes);
app.use('/api/v1/orders', orderRoutes);

// Inventory Routes (used by Warehouse, Sign Company)
app.use('/inventory', inventoryRoutes);
app.use('/api/v1/inventory', inventoryRoutes);

// Centralized Cloudinary Upload Routes
app.use('/upload', uploadRoutes);
app.use('/api/v1/upload', uploadRoutes);

// Notifications & Operations (Media Tasks, Calendars, Settings, Deliveries)
app.use('/notifications', notificationRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/ops', opsRoutes);
app.use('/api/v1/ops', opsRoutes);

// Invoices Routes (Client & Technician Invoices)
app.use('/invoices', invoiceRoutes);
app.use('/api/v1/invoices', invoiceRoutes);

// Centralized error and 404 handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
