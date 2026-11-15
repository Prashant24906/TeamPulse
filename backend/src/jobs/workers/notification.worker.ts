import { Worker, Job } from 'bullmq';
import { connectDB } from '../../config/database';
import { getBullMQConnection, createPubSubConnection } from '../../config/redis';
import type { TaskDeadlineJobData } from '../jobs/taskDeadline.job';
import { NOTIFICATION_QUEUE_NAME } from '../jobs/taskDeadline.job';
import {
  persistNotification,
  getRecipients,
  buildMessage,
  isTaskStillOpen,
} from '../../services/notification.service';
import type Redis from 'ioredis';

// ---------------------------------------------------------------------------
// notification.worker.ts — Separate worker process
//
// Run independently from the HTTP server:
//   npx tsx src/jobs/workers/notification.worker.ts
//
// Responsibilities:
//   - Connect to DB (needs it to persist notifications)
//   - Process task-deadline jobs from the BullMQ queue
//   - Guard TASK_OVERDUE: skip if the task is already completed/closed
//   - Persist notifications idempotently (ON CONFLICT DO NOTHING)
//   - Publish to Redis 'notifications:push' channel after each persist
//     so the HTTP server can deliver real-time WS events to the user
//   - Retry up to 3 times (configured on the Queue)
//   - Graceful shutdown on SIGTERM/SIGINT
// ---------------------------------------------------------------------------

const CHANNEL = 'notifications:push';

let publisher: Redis | null = null;

async function processJob(job: Job<TaskDeadlineJobData>): Promise<void> {
  console.log(`[worker] Processing job ${job.id} type=${job.data.type} taskId=${job.data.taskId}`);

  // For TASK_OVERDUE, verify the task is still open.
  // The task could have been completed or closed between scheduling and firing.
  if (job.data.type === 'TASK_OVERDUE') {
    const stillOpen = await isTaskStillOpen(job.data.taskId);
    if (!stillOpen) {
      console.log(
        `[worker] Skipping TASK_OVERDUE for task ${job.data.taskId} — task is completed/closed`
      );
      return;
    }
  }

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

      // Publish to the HTTP server's Redis subscriber for real-time delivery
      if (publisher) {
        try {
          await publisher.publish(CHANNEL, JSON.stringify({ userId, notification: result }));
          console.log(`[worker] Published to ${CHANNEL} for userId=${userId}`);
        } catch (err) {
          // Non-fatal — notification is already persisted in DB
          console.error('[worker] Redis publish failed (non-fatal):', (err as Error).message);
        }
      }
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

  // Create a dedicated Redis publisher connection for Pub/Sub
  try {
    publisher = createPubSubConnection();
    publisher.on('error', (err) => {
      console.error('[worker] Redis publisher error (non-fatal):', err.message);
    });
    console.log('[worker] Redis publisher connected');
  } catch (err) {
    console.warn('[worker] Redis publisher failed to connect (non-fatal):', (err as Error).message);
    publisher = null;
  }

  const worker = new Worker<TaskDeadlineJobData>(
    NOTIFICATION_QUEUE_NAME,
    processJob,
    {
      connection: getBullMQConnection(),
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
  //   3. Close Redis connections
  // ---------------------------------------------------------------------------

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] Received ${signal}. Shutting down gracefully...`);
    await worker.close();
    if (publisher) {
      await publisher.quit();
      publisher = null;
    }
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
