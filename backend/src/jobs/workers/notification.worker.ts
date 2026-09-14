import { Worker, Job } from 'bullmq';
import { env } from '../../config/env';
import { connectDB } from '../../config/database';
import type { TaskDeadlineJobData } from '../jobs/taskDeadline.job';
import { NOTIFICATION_QUEUE_NAME } from '../jobs/taskDeadline.job';
import {
  persistNotification,
  getRecipients,
  buildMessage,
} from '../../services/notification.service';

// ---------------------------------------------------------------------------
// notification.worker.ts — Separate worker process
//
// Run independently from the HTTP server:
//   npx tsx src/jobs/workers/notification.worker.ts
//
// Responsibilities:
//   - Connect to DB (needs it to persist notifications)
//   - Process task-deadline jobs from the BullMQ queue
//   - Retry up to 3 times (configured on the Queue)
//   - Persist notifications idempotently (ON CONFLICT DO NOTHING)
//   - Graceful shutdown on SIGTERM/SIGINT
// ---------------------------------------------------------------------------

async function processJob(job: Job<TaskDeadlineJobData>): Promise<void> {
  console.log(`[worker] Processing job ${job.id} type=${job.data.type} taskId=${job.data.taskId}`);

  const recipients = getRecipients(job.data);
  const message    = buildMessage(job.data);

  let persisted = 0;
  let skipped   = 0;

  for (const userId of recipients) {
    const result = await persistNotification(
      job.id!,
      userId,
      job.data.taskId,
      job.data.type,
      message
    );

    if (result) {
      persisted++;
      console.log(
        `[worker] Notification persisted — jobId=${job.id} userId=${userId} type=${job.data.type}`
      );
    } else {
      skipped++;
      console.log(
        `[worker] Duplicate skipped (idempotent) — jobId=${job.id} userId=${userId}`
      );
    }
  }

  console.log(
    `[worker] Job ${job.id} complete — persisted=${persisted} skipped=${skipped}`
  );
}

async function start(): Promise<void> {
  // Worker needs its own DB connection (separate process from HTTP server)
  await connectDB();
  console.log('[worker] DB connected');

  const worker = new Worker<TaskDeadlineJobData>(
    NOTIFICATION_QUEUE_NAME,
    processJob,
    {
      connection: {
        host: new URL(env.REDIS_URL).hostname,
        port: parseInt(new URL(env.REDIS_URL).port || '6379', 10),
      },
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] ✓ Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[worker] ✗ Job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
      err.message
    );
  });

  worker.on('error', (err) => {
    console.error('[worker] Worker error:', err.message);
  });

  console.log(`[worker] Listening on queue: ${NOTIFICATION_QUEUE_NAME}`);

  // ---------------------------------------------------------------------------
  // Graceful shutdown
  // SIGTERM/SIGINT:
  //   1. Stop accepting new jobs
  //   2. Wait for in-progress jobs to complete (or timeout)
  //   3. Close Redis connection
  // ---------------------------------------------------------------------------

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] Received ${signal}. Shutting down gracefully...`);
    await worker.close();
    console.log('[worker] Worker closed. Exiting.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[worker] Failed to start:', err);
  process.exit(1);
});
