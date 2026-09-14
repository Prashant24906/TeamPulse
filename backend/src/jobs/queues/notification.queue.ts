import { Queue } from 'bullmq';
import { env } from '../../config/env';
import type { TaskDeadlineJobData } from '../jobs/taskDeadline.job';
import { NOTIFICATION_QUEUE_NAME } from '../jobs/taskDeadline.job';

// ---------------------------------------------------------------------------
// notification.queue.ts — BullMQ Queue instance
//
// Responsible only for:
//   - Creating the Queue connected to Redis
//   - Exporting helpers to add jobs
//
// Business logic lives in task.service.ts (when to enqueue)
// and notification.worker.ts (what to do when processing).
// ---------------------------------------------------------------------------

let notificationQueue: Queue<TaskDeadlineJobData> | null = null;

export function getNotificationQueue(): Queue<TaskDeadlineJobData> {
  if (!notificationQueue) {
    notificationQueue = new Queue<TaskDeadlineJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: {
        host: new URL(env.REDIS_URL).hostname,
        port: parseInt(new URL(env.REDIS_URL).port || '6379', 10),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: { count: 100 },  // keep last 100 completed jobs
        removeOnFail:     { count: 200 },  // keep last 200 failed jobs
      },
    });

    console.log(`[queue] ${NOTIFICATION_QUEUE_NAME} initialized`);
  }
  return notificationQueue;
}

/**
 * Schedule a task-deadline notification job.
 *
 * @param jobId   Stable ID derived from taskId — used for deduplication.
 *                BullMQ will replace an existing job with the same ID.
 * @param data    Job payload
 * @param delayMs How many ms from now to fire the job
 */
export async function scheduleTaskDeadlineJob(
  jobId: string,
  data: TaskDeadlineJobData,
  delayMs: number
): Promise<void> {
  const queue = getNotificationQueue();

  // Remove any previous job for this task (e.g., due_date was updated)
  const existing = await queue.getJob(jobId);
  if (existing) {
    await existing.remove();
    console.log(`[queue] Removed previous job ${jobId}`);
  }

  await queue.add(data.type, data, {
    jobId,
    delay: delayMs,
  });

  console.log(
    `[queue] Scheduled job ${jobId} — type=${data.type} delay=${Math.round(delayMs / 1000)}s`
  );
}

/**
 * Remove a scheduled deadline job (e.g., task deleted or due_date cleared).
 */
export async function removeTaskDeadlineJob(jobId: string): Promise<void> {
  const queue = getNotificationQueue();
  const existing = await queue.getJob(jobId);
  if (existing) {
    await existing.remove();
    console.log(`[queue] Removed job ${jobId}`);
  }
}

export async function closeNotificationQueue(): Promise<void> {
  if (notificationQueue) {
    await notificationQueue.close();
    notificationQueue = null;
    console.log('[queue] Notification queue closed');
  }
}
