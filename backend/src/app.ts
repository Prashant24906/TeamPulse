import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { sql } from './config/database';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
import authRouter    from './routes/auth.routes';
import teamRouter    from './routes/team.routes';
import projectRouter from './routes/project.routes';
import taskRouter    from './routes/task.routes';
import { apiRateLimit } from './middleware/rateLimit.middleware';

const app = express();

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
app.use(helmet());

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify the DB is reachable on every health call
    await sql`SELECT 1`;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      database: 'connected',
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// API routes — global rate limit applied here
// ---------------------------------------------------------------------------
app.use('/api', apiRateLimit);
app.use('/api/auth',     authRouter);
app.use('/api/teams',    teamRouter);
app.use('/api/projects', projectRouter);
app.use('/api/tasks',    taskRouter);

// ---------------------------------------------------------------------------
// 404 + error handlers — must be last
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
