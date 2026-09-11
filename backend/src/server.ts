import { createServer } from 'http';
import { env } from './config/env';
import { connectDB } from './config/database';
import app from './app';
import { initSocket } from './websocket/socket';

// ---------------------------------------------------------------------------
// server.ts — entry point
//
// Responsibilities:
//   1. Verify the DB connection before accepting traffic
//   2. Attach Socket.IO to the HTTP server
//   3. Start listening
//   4. Handle graceful shutdown on SIGTERM / SIGINT
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  // 1. Verify DB connectivity first — fail fast if Supabase is unreachable
  await connectDB();

  // 2. Create HTTP server and attach Socket.IO to it
  const httpServer = createServer(app);
  initSocket(httpServer);

  // 3. Start listening
  httpServer.listen(env.PORT, () => {
    console.log(
      `[server] Running in ${env.NODE_ENV} mode on http://localhost:${env.PORT}`
    );
    console.log(`[server] Health check → http://localhost:${env.PORT}/health`);
  });

  // 4. Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[server] Received ${signal}. Shutting down gracefully...`);
    httpServer.close(() => {
      console.log('[server] HTTP server closed.');
      process.exit(0);
    });

    // Force exit after 10 seconds if server hasn't closed
    setTimeout(() => {
      console.error('[server] Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch any unhandled promise rejections so the process doesn't exit silently
  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled rejection:', reason);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
