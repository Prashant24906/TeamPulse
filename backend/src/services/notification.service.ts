import sql from '../../config/database';
import type { TaskDeadlineJobData, NotificationType } from '../jobs/taskDeadline.job';

// ---------------------------------------------------------------------------
// notification.service.ts — persist a notification to PostgreSQL
//
// Called by the worker after a job fires.
// Uses ON CONFLICT DO NOTHING for idempotency:
//   same job × 2 → only one row inserted.
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  user_id: string;
  task_id: string;
  type: NotificationType;
  message: string;
  job_id: string;
  is_read: boolean;
  created_at: Date;
}

/**
 * Persist a notification for a single user.
 * Idempotent: the (job_id, user_id) UNIQUE constraint + ON CONFLICT DO NOTHING
 * ensures the same job can be processed more than once without duplicate rows.
 */
export async function persistNotification(
  jobId: string,
  userId: string,
  taskId: string,
  type: NotificationType,
  message: string
): Promise<Notification | null> {
  const rows = await sql<Notification[]>`
    INSERT INTO notifications (job_id, user_id, task_id, type, message)
    VALUES (${jobId}, ${userId}, ${taskId}, ${type}, ${message})
    ON CONFLICT (job_id, user_id) DO NOTHING
    RETURNING *
  `;

  // Returns null if skipped (duplicate) — caller can log accordingly
  return rows[0] ?? null;
}

/**
 * Build recipient list for a task deadline job.
 * Notifies: assigned_to user (if set), otherwise the task creator.
 */
export function getRecipients(data: TaskDeadlineJobData): string[] {
  const recipients = new Set<string>();
  if (data.assignedTo) recipients.add(data.assignedTo);
  else recipients.add(data.createdBy);
  return [...recipients];
}

export function buildMessage(data: TaskDeadlineJobData): string {
  const dueDate = new Date(data.dueDate).toLocaleString('en-IN', {
    timeZone:   'Asia/Kolkata',
    dateStyle:  'medium',
    timeStyle:  'short',
  });
  return data.type === 'TASK_DUE_SOON'
    ? `Task "${data.taskName}" is due soon (${dueDate}).`
    : `Task "${data.taskName}" is overdue (was due ${dueDate}).`;
}
