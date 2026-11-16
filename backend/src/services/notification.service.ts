import sql from '../config/database';
import type { TaskDeadlineJobData, NotificationType } from '../jobs/jobs/taskDeadline.job';
import { createPubSubConnection } from '../config/redis';
import * as teamRepo from '../repositories/team.repository';

// ---------------------------------------------------------------------------
// notification.service.ts
//
// Responsibilities:
//   - Persist notifications written by the worker process (deadline jobs)
//   - Persist TASK_ASSIGNED notifications directly from the HTTP process
//   - Persist TEAM_MESSAGE notifications directly from the HTTP process
//   - Query, count, and mark notifications for the REST API
//   - Check task status so TASK_OVERDUE is skipped for completed/closed tasks
//
// Real-time delivery:
//   Deadline notifications: worker persists → Redis publish → HTTP subscriber → emitToUser
//   Assignment & Message notifications: HTTP process persists + publishes → Redis subscriber → emitToUser
// ---------------------------------------------------------------------------

const NOTIFICATION_CHANNEL = 'notifications:push';

export interface Notification {
  id: string;
  user_id: string;
  task_id: string | null;
  team_id?: string | null;
  project_id?: string | null;
  message_id?: string | null;
  type: NotificationType;
  message: string;
  job_id: string;
  is_read: boolean;
  created_at: Date;
  transient?: boolean;
}

/**
 * Persist a notification for a single user.
 * Idempotent: the (job_id, user_id) UNIQUE constraint + ON CONFLICT DO NOTHING
 * ensures the same job can be processed more than once without duplicate rows.
 */
export async function persistNotification(
  jobId: string,
  userId: string,
  taskId: string | null,
  type: NotificationType,
  message: string,
  teamId?: string | null,
  messageId?: string | null
): Promise<Notification | null> {
  const rows = await sql<Notification[]>`
    INSERT INTO notifications (job_id, user_id, task_id, team_id, message_id, type, message)
    VALUES (${jobId}, ${userId}, ${taskId}, ${teamId ?? null}, ${messageId ?? null}, ${type}, ${message})
    ON CONFLICT (job_id, user_id) DO NOTHING
    RETURNING *
  `;

  // Returns null if skipped (duplicate) — caller can log accordingly
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// TASK_ASSIGNED — synchronous notification from the HTTP process
//
// Unlike deadline notifications (which go through BullMQ worker), assignment
// notifications are lightweight and synchronous: persist directly then publish
// to Redis so the subscriber pushes to the assignee's Socket.IO room.
// ---------------------------------------------------------------------------

/**
 * Notify a user they have been assigned a task.
 *
 * @param jobId       Stable idempotency key — `assign_${taskId}_${assignedTo}`
 * @param taskId      The task being assigned
 * @param assignedTo  The user being assigned
 * @param assignerName  Display name of the person doing the assigning
 * @param taskName    Name of the task
 */
export async function notifyTaskAssigned(
  jobId: string,
  taskId: string,
  assignedTo: string,
  assignerName: string,
  taskName: string,
  teamId?: string,
  projectId?: string
): Promise<void> {
  const message = `${assignerName} assigned you a task: ${taskName}`;

  const notification = await persistNotification(jobId, assignedTo, taskId, 'TASK_ASSIGNED', message);

  if (!notification) {
    // Duplicate — idempotency guard already prevented a double insert
    return;
  }

  // Best-effort: publish to Redis so the HTTP subscriber can deliver in real-time.
  // Failure is non-fatal — the notification is already persisted in DB.
  try {
    const publisher = createPubSubConnection();
    await publisher.publish(
      NOTIFICATION_CHANNEL,
      JSON.stringify({
        userId: assignedTo,
        notification: {
          ...notification,
          team_id: teamId ?? null,
          project_id: projectId ?? null,
        },
      })
    );
    // Quit immediately — this is a fire-and-forget one-shot publish
    await publisher.quit();
  } catch (err) {
    console.error('[notification] Redis publish failed for TASK_ASSIGNED (non-fatal):', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// TEAM_MESSAGE — transient real-time toast to all other team members
//
// Transient: does NOT insert into PostgreSQL, does NOT increase unread count,
// does NOT appear in the notification bell dropdown. Publishes to Redis with
// `transient: true` so the frontend displays an Instagram-style toast only.
// ---------------------------------------------------------------------------

/**
 * Notify all team members (except the sender) that a message was posted.
 * Transient only: delivers real-time toast without PostgreSQL persistence.
 *
 * @param messageId   ID of the posted team message
 * @param teamId      ID of the team
 * @param senderId    User ID of the sender (excluded from notifications)
 * @param senderName  Display name of the sender
 * @param content     Content of the message (preview will be truncated safely)
 * @param projectId   Optional project ID for navigation context
 */
export async function notifyTeamMessage(
  messageId: string,
  teamId: string,
  senderId: string,
  senderName: string,
  content: string,
  projectId?: string
): Promise<void> {
  // 1. Resolve team info
  const team = await teamRepo.findTeamById(teamId);
  if (!team) return;

  const resolvedProjectId = projectId ?? team.project_id;
  const teamName = team.name;

  // 2. Resolve recipients from team_members table — strictly excluding sender
  const members = await teamRepo.getMembers(teamId);
  const recipients = members.filter((m) => m.user_id !== senderId);
  if (recipients.length === 0) return;

  // 3. Format message preview safely
  const cleanContent = content.replace(/\s+/g, ' ').trim();
  const preview = cleanContent.length > 60
    ? cleanContent.substring(0, 57) + '...'
    : cleanContent;
  const messageText = preview
    ? `${senderName} sent a message in ${teamName}: "${preview}"`
    : `${senderName} sent a message in ${teamName}.`;

  // 4. Connect Redis publisher for real-time delivery (best-effort)
  let publisher: ReturnType<typeof createPubSubConnection> | null = null;
  try {
    publisher = createPubSubConnection();
  } catch (err) {
    console.error('[notification] Redis connection failed for TEAM_MESSAGE (non-fatal):', (err as Error).message);
  }

  try {
    for (const recipient of recipients) {
      try {
        const transientNotification = {
          id: `transient_msg_${messageId}_${recipient.user_id}`,
          user_id: recipient.user_id,
          task_id: null,
          team_id: teamId,
          project_id: resolvedProjectId,
          message_id: messageId,
          type: 'TEAM_MESSAGE' as const,
          message: messageText,
          job_id: `msg_${messageId}`,
          is_read: false,
          created_at: new Date().toISOString(),
          transient: true,
        };

        if (publisher) {
          try {
            await publisher.publish(
              NOTIFICATION_CHANNEL,
              JSON.stringify({
                userId: recipient.user_id,
                notification: transientNotification,
              })
            );
          } catch (pubErr) {
            console.error(
              `[notification] Redis publish failed for recipient ${recipient.user_id} (non-fatal):`,
              (pubErr as Error).message
            );
          }
        }
      } catch (recipErr) {
        console.error(
          `[notification] Failed to deliver transient TEAM_MESSAGE for recipient ${recipient.user_id} (non-fatal):`,
          (recipErr as Error).message
        );
      }
    }
  } finally {
    if (publisher) {
      try {
        await publisher.quit();
      } catch {
        // silent
      }
    }
  }
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
 * Includes team_id and project_id joined from tasks/teams for frontend navigation.
 */
export async function getNotificationsByUser(
  userId: string,
  limit = 20,
  offset = 0
): Promise<Notification[]> {
  return sql<Notification[]>`
    SELECT 
      n.id, 
      n.user_id, 
      n.task_id, 
      n.team_id AS direct_team_id,
      n.message_id,
      n.type, 
      n.message, 
      n.job_id, 
      n.is_read, 
      n.created_at,
      COALESCE(n.team_id, t.team_id) AS team_id,
      COALESCE(tm.project_id, direct_team.project_id) AS project_id
    FROM notifications n
    LEFT JOIN tasks t ON t.id = n.task_id
    LEFT JOIN teams tm ON tm.id = t.team_id
    LEFT JOIN teams direct_team ON direct_team.id = n.team_id
    WHERE n.user_id = ${userId}
    ORDER BY n.created_at DESC
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
    WITH updated AS (
      UPDATE notifications
      SET is_read = TRUE
      WHERE id = ${notificationId} AND user_id = ${userId}
      RETURNING id, user_id, task_id, team_id, message_id, type, message, job_id, is_read, created_at
    )
    SELECT 
      u.id, 
      u.user_id, 
      u.task_id, 
      u.type, 
      u.message, 
      u.job_id, 
      u.is_read, 
      u.created_at,
      u.message_id,
      COALESCE(u.team_id, t.team_id) AS team_id,
      COALESCE(tm.project_id, direct_team.project_id) AS project_id
    FROM updated u
    LEFT JOIN tasks t ON t.id = u.task_id
    LEFT JOIN teams tm ON tm.id = t.team_id
    LEFT JOIN teams direct_team ON direct_team.id = u.team_id
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
