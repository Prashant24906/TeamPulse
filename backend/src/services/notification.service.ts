import sql from '../config/database';
import type { TaskDeadlineJobData, NotificationType } from '../jobs/jobs/taskDeadline.job';

// ---------------------------------------------------------------------------
// notification.service.ts
//
// Responsibilities:
//   - Persist notifications written by the worker process
//   - Query, count, and mark notifications for the REST API
//   - Check task status so TASK_OVERDUE is skipped for completed/closed tasks
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

// ---------------------------------------------------------------------------
// Query functions — called by the notification REST API
// ---------------------------------------------------------------------------

/**
 * Retrieve paginated notifications for a user, newest first.
 */
export async function getNotificationsByUser(
  userId: string,
  limit = 20,
  offset = 0
): Promise<Notification[]> {
  return sql<Notification[]>`
    SELECT id, user_id, task_id, type, message, job_id, is_read, created_at
    FROM notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/**
 * Count unread notifications for a user.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM notifications
    WHERE user_id = ${userId} AND is_read = FALSE
  `;
  return parseInt(rows[0]?.count ?? '0', 10);
}

/**
 * Mark a single notification as read.
 * Returns null if not found or if the notification belongs to a different user (IDOR protection).
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<Notification | null> {
  const rows = await sql<Notification[]>`
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = ${notificationId} AND user_id = ${userId}
    RETURNING id, user_id, task_id, type, message, job_id, is_read, created_at
  `;
  return rows[0] ?? null;
}

/**
 * Mark all unread notifications as read for a user.
 * Returns the count of rows updated.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    WITH updated AS (
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = ${userId} AND is_read = FALSE
      RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM updated
  `;
  return parseInt(rows[0]?.count ?? '0', 10);
}

/**
 * Check whether a task is still open (not COMPLETED or CLOSED).
 * Used by the worker to skip TASK_OVERDUE for already-finished tasks.
 */
export async function isTaskStillOpen(taskId: string): Promise<boolean> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM tasks WHERE id = ${taskId}
  `;
  if (!rows[0]) return false;
  return !['COMPLETED', 'CLOSED'].includes(rows[0].status);
}
