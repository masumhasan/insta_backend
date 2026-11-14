import app from './app';
import { config } from './config/env';
import { connectDatabase } from './config/database';

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    const server = app.listen(config.port, () => {
      console.log(`[Server] Instapost API running on http://localhost:${config.port} in ${config.env} mode`);
    });

    const shutdown = async (signal: string) => {
      console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log('[Server] HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[Server] Failed to initialize server:', error);
    process.exit(1);
  }
};

// Only listen locally or in standalone container mode; skip in Vercel serverless environment
if (!process.env.VERCEL) {
  startServer();
}

export default app;
