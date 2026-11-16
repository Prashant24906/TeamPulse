import sql from '../config/database';
import type { TaskDeadlineJobData, NotificationType } from '../jobs/jobs/taskDeadline.job';
import { createPubSubConnection } from '../config/redis';
import * as teamRepo from '../repositories/team.repository';
import * as projectRepo from '../repositories/project.repository';

// ---------------------------------------------------------------------------
// notification.service.ts
//
// Responsibilities:
//   - Persist notifications written by the worker process (deadline jobs)
//   - Persist TASK_ASSIGNED notifications directly from the HTTP process
//   - Persist PROJECT_JOIN_REQUEST and TEAM_JOIN_REQUEST notifications directly from the HTTP process
//   - Dispatch transient TEAM_MESSAGE notifications directly from the HTTP process
//   - Query, count, and mark notifications for the REST API
//   - Check task status so TASK_OVERDUE is skipped for completed/closed tasks
//
// Real-time delivery:
//   Deadline notifications: worker persists → Redis publish → HTTP subscriber → emitToUser
//   Assignment, Join Request & Message notifications: HTTP process persists + publishes → Redis subscriber → emitToUser
// ---------------------------------------------------------------------------

const NOTIFICATION_CHANNEL = 'notifications:push';

export interface Notification {
  id: string;
  user_id: string;
  task_id: string | null;
  team_id?: string | null;
  project_id?: string | null;
  message_id?: string | null;
  join_request_id?: string | null;
  type: NotificationType;
  message: string;
  job_id: string | null;
  is_read: boolean;
  created_at: Date;
  transient?: boolean;
  conversation_type?: 'TEAM' | 'PROJECT' | null;
  conversation_id?: string | null;
  conversation_name?: string | null;
  unread_message_count?: number;
  latest_sender_id?: string | null;
  latest_sender_name?: string | null;
  latest_message_preview?: string | null;
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
  messageId?: string | null,
  projectId?: string | null,
  joinRequestId?: string | null
): Promise<Notification | null> {
  const rows = await sql<Notification[]>`
    INSERT INTO notifications (job_id, user_id, task_id, team_id, message_id, project_id, join_request_id, type, message)
    VALUES (${jobId}, ${userId}, ${taskId}, ${teamId ?? null}, ${messageId ?? null}, ${projectId ?? null}, ${joinRequestId ?? null}, ${type}, ${message})
    ON CONFLICT (job_id, user_id) DO NOTHING
    RETURNING *
  `;

  // Returns null if skipped (duplicate) — caller can log accordingly
  return rows[0] ?? null;
}

export interface UpsertGroupedChatInput {
  userId: string;
  conversationType: 'TEAM' | 'PROJECT';
  conversationId: string;
  conversationName: string;
  type: 'TEAM_MESSAGE' | 'PROJECT_MESSAGE';
  senderId: string;
  senderName: string;
  preview: string;
  teamId?: string | null;
  projectId?: string | null;
  messageId?: string | null;
}

/**
 * Atomically create or update a persistent grouped chat notification.
 * Guarantees at most ONE unread notification per user per conversation
 * using the partial unique index on (user_id, conversation_type, conversation_id) WHERE is_read = FALSE.
 */
export async function upsertGroupedChatNotification(
  input: UpsertGroupedChatInput
): Promise<Notification> {
  const initialMessage = input.preview
    ? `${input.senderName} sent a message in ${input.conversationName}: "${input.preview}"`
    : `${input.senderName} sent a message in ${input.conversationName}.`;

  const rows = await sql<Notification[]>`
    INSERT INTO notifications (
      user_id,
      type,
      message,
      conversation_type,
      conversation_id,
      conversation_name,
      unread_message_count,
      latest_sender_id,
      latest_sender_name,
      latest_message_preview,
      team_id,
      project_id,
      message_id,
      is_read,
      created_at
    )
    VALUES (
      ${input.userId},
      ${input.type},
      ${initialMessage},
      ${input.conversationType},
      ${input.conversationId},
      ${input.conversationName},
      1,
      ${input.senderId},
      ${input.senderName},
      ${input.preview},
      ${input.teamId ?? null},
      ${input.projectId ?? null},
      ${input.messageId ?? null},
      FALSE,
      NOW()
    )
    ON CONFLICT (user_id, conversation_type, conversation_id) WHERE is_read = FALSE
    DO UPDATE SET
      unread_message_count = notifications.unread_message_count + 1,
      message = EXCLUDED.latest_sender_name || ' and others sent ' || (notifications.unread_message_count + 1) || ' messages in ' || EXCLUDED.conversation_name || '.',
      latest_sender_id = EXCLUDED.latest_sender_id,
      latest_sender_name = EXCLUDED.latest_sender_name,
      latest_message_preview = EXCLUDED.latest_message_preview,
      conversation_name = EXCLUDED.conversation_name,
      message_id = EXCLUDED.message_id,
      created_at = NOW()
    RETURNING *
  `;

  return rows[0];
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

  const notification = await persistNotification(
    jobId,
    assignedTo,
    taskId,
    'TASK_ASSIGNED',
    message,
    teamId,
    null,
    projectId
  );

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
        // A. Real-time transient toast notification (Instagram-style toast)
        const transientNotification = {
          id: `transient_msg_${messageId}_${recipient.user_id}`,
          user_id: recipient.user_id,
          sender_id: senderId,
          sender_name: senderName,
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
          conversation_type: 'TEAM' as const,
          conversation_id: teamId,
          conversation_name: teamName,
          latest_sender_name: senderName,
          latest_message_preview: preview,
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
              `[notification] Redis publish failed for recipient toast ${recipient.user_id} (non-fatal):`,
              (pubErr as Error).message
            );
          }
        }

        // B. Create or update persistent grouped notification in DB
        let groupedNotification: Notification | null = null;
        try {
          groupedNotification = await upsertGroupedChatNotification({
            userId: recipient.user_id,
            conversationType: 'TEAM',
            conversationId: teamId,
            conversationName: teamName,
            type: 'TEAM_MESSAGE',
            senderId,
            senderName,
            preview,
            teamId,
            projectId: resolvedProjectId,
            messageId,
          });
        } catch (dbErr) {
          console.error(`[notification] Failed to persist grouped TEAM_MESSAGE for ${recipient.user_id}:`, (dbErr as Error).message);
        }

        // C. Publish persistent grouped notification over Redis to update the bell & badge
        if (publisher && groupedNotification) {
          try {
            await publisher.publish(
              NOTIFICATION_CHANNEL,
              JSON.stringify({
                userId: recipient.user_id,
                notification: {
                  ...groupedNotification,
                  team_id: teamId,
                  project_id: resolvedProjectId,
                  transient: false,
                },
              })
            );
          } catch (pubErr) {
            console.error(
              `[notification] Redis publish failed for persistent TEAM_MESSAGE to ${recipient.user_id} (non-fatal):`,
              (pubErr as Error).message
            );
          }
        }
      } catch (recipErr) {
        console.error(
          `[notification] Failed to deliver TEAM_MESSAGE for recipient ${recipient.user_id} (non-fatal):`,
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

// ---------------------------------------------------------------------------
// PROJECT_MESSAGE — persistent grouped notification + transient real-time toast
// ---------------------------------------------------------------------------

/**
 * Notify all project members (except the sender) that a message was posted.
 * Grouped in PostgreSQL (at most one unread notification per project) and triggers a toast.
 *
 * @param messageId   ID of the posted project message
 * @param projectId   ID of the project
 * @param senderId    User ID of the sender (excluded from notifications)
 * @param senderName  Display name of the sender
 * @param content     Content of the message (preview will be truncated safely)
 */
export async function notifyProjectMessage(
  messageId: string,
  projectId: string,
  senderId: string,
  senderName: string,
  content: string
): Promise<void> {
  // 1. Resolve project info
  const project = await projectRepo.findProjectById(projectId);
  if (!project) return;

  const projectName = project.name;
  const conversationName = `${projectName} Project Chat`;

  // 2. Resolve recipients from project_members table — strictly excluding sender
  const members = await projectRepo.findMembersByProject(projectId);
  const recipients = members.filter((m) => m.user_id !== senderId);
  if (recipients.length === 0) return;

  // 3. Format message preview safely
  const cleanContent = content.replace(/\s+/g, ' ').trim();
  const preview = cleanContent.length > 60
    ? cleanContent.substring(0, 57) + '...'
    : cleanContent;
  const messageText = preview
    ? `${senderName} sent a message in ${projectName}: "${preview}"`
    : `${senderName} sent a message in ${projectName}.`;

  // 4. Connect Redis publisher for real-time delivery (best-effort)
  let publisher: ReturnType<typeof createPubSubConnection> | null = null;
  try {
    publisher = createPubSubConnection();
  } catch (err) {
    console.error('[notification] Redis connection failed for PROJECT_MESSAGE (non-fatal):', (err as Error).message);
  }

  try {
    for (const recipient of recipients) {
      try {
        // A. Real-time transient toast notification
        const transientNotification = {
          id: `transient_projmsg_${messageId}_${recipient.user_id}`,
          user_id: recipient.user_id,
          sender_id: senderId,
          sender_name: senderName,
          task_id: null,
          team_id: null,
          project_id: projectId,
          message_id: messageId,
          type: 'PROJECT_MESSAGE' as const,
          message: messageText,
          job_id: `projmsg_${messageId}`,
          is_read: false,
          created_at: new Date().toISOString(),
          transient: true,
          conversation_type: 'PROJECT' as const,
          conversation_id: projectId,
          conversation_name: conversationName,
          latest_sender_name: senderName,
          latest_message_preview: preview,
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
              `[notification] Redis publish failed for project message toast ${recipient.user_id} (non-fatal):`,
              (pubErr as Error).message
            );
          }
        }

        // B. Create or update persistent grouped notification in DB
        let groupedNotification: Notification | null = null;
        try {
          groupedNotification = await upsertGroupedChatNotification({
            userId: recipient.user_id,
            conversationType: 'PROJECT',
            conversationId: projectId,
            conversationName: conversationName,
            type: 'PROJECT_MESSAGE',
            senderId,
            senderName,
            preview,
            teamId: null,
            projectId,
            messageId: null,
          });
        } catch (dbErr) {
          console.error(`[notification] Failed to persist grouped PROJECT_MESSAGE for ${recipient.user_id}:`, (dbErr as Error).message);
        }

        // C. Publish persistent grouped notification over Redis
        if (publisher && groupedNotification) {
          try {
            await publisher.publish(
              NOTIFICATION_CHANNEL,
              JSON.stringify({
                userId: recipient.user_id,
                notification: {
                  ...groupedNotification,
                  project_id: projectId,
                  transient: false,
                },
              })
            );
          } catch (pubErr) {
            console.error(
              `[notification] Redis publish failed for project message persistent notif ${recipient.user_id} (non-fatal):`,
              (pubErr as Error).message
            );
          }
        }
      } catch (recipErr) {
        console.error(
          `[notification] Failed to deliver PROJECT_MESSAGE for recipient ${recipient.user_id} (non-fatal):`,
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

// ---------------------------------------------------------------------------
// PROJECT_JOIN_REQUEST — persistent & real-time notification to project OWNER/ADMIN
// ---------------------------------------------------------------------------

/**
 * Notify project OWNER and ADMIN members of a new project join request.
 *
 * @param requestId     Join request UUID
 * @param projectId     Target project UUID
 * @param projectName   Name of the project
 * @param requesterId   User ID of requester (excluded from notifications)
 * @param requesterName Display name of requester
 * @param eventKey      Timestamp or version key for idempotency (e.g. updated_at timestamp)
 */
export async function notifyProjectJoinRequest(
  requestId: string,
  projectId: string,
  projectName: string,
  requesterId: string,
  requesterName: string,
  eventKey?: number | string
): Promise<void> {
  // 1. Resolve recipients: project members with role OWNER or ADMIN, strictly excluding requester
  const members = await projectRepo.findMembersByProject(projectId);
  const recipients = members.filter(
    (m) => (m.role === 'OWNER' || m.role === 'ADMIN') && m.user_id !== requesterId
  );
  if (recipients.length === 0) return;

  // 2. Build message: e.g. "Alex requested to join Project TeamPulse."
  const targetName = projectName.toLowerCase().startsWith('project ')
    ? projectName
    : `Project ${projectName}`;
  const message = `${requesterName} requested to join ${targetName}.`;

  // 3. Formulate stable idempotency key for this request event
  const stamp = eventKey ?? 'req';
  const jobId = `pjr_${requestId}_${stamp}`;

  // 4. Connect Redis publisher for real-time delivery
  let publisher: ReturnType<typeof createPubSubConnection> | null = null;
  try {
    publisher = createPubSubConnection();
  } catch (err) {
    console.error('[notification] Redis connection failed for PROJECT_JOIN_REQUEST (non-fatal):', (err as Error).message);
  }

  try {
    for (const recipient of recipients) {
      try {
        const notification = await persistNotification(
          jobId,
          recipient.user_id,
          null,
          'PROJECT_JOIN_REQUEST',
          message,
          null,
          null,
          projectId,
          requestId
        );

        if (!notification) {
          // Idempotency: duplicate notification already exists for this (job_id, user_id)
          continue;
        }

        if (publisher) {
          try {
            await publisher.publish(
              NOTIFICATION_CHANNEL,
              JSON.stringify({
                userId: recipient.user_id,
                notification: {
                  ...notification,
                  project_id: projectId,
                  join_request_id: requestId,
                },
              })
            );
          } catch (pubErr) {
            console.error(
              `[notification] Redis publish failed for project join request to ${recipient.user_id} (non-fatal):`,
              (pubErr as Error).message
            );
          }
        }
      } catch (recipErr) {
        console.error(
          `[notification] Failed to persist/deliver project join request for ${recipient.user_id} (non-fatal):`,
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

// ---------------------------------------------------------------------------
// TEAM_JOIN_REQUEST — persistent & real-time notification to team OWNER/ADMIN
// ---------------------------------------------------------------------------

/**
 * Notify team OWNER and ADMIN members of a new team join request.
 *
 * @param requestId     Join request UUID
 * @param teamId        Target team UUID
 * @param teamName      Name of the team
 * @param requesterId   User ID of requester (excluded from notifications)
 * @param requesterName Display name of requester
 * @param projectId     Optional project UUID for navigation context
 * @param eventKey      Timestamp or version key for idempotency
 */
export async function notifyTeamJoinRequest(
  requestId: string,
  teamId: string,
  teamName: string,
  requesterId: string,
  requesterName: string,
  projectId?: string,
  eventKey?: number | string
): Promise<void> {
  // 1. Resolve recipients: team members with role OWNER or ADMIN, strictly excluding requester
  const members = await teamRepo.getMembers(teamId);
  const recipients = members.filter(
    (m) => (m.role === 'OWNER' || m.role === 'ADMIN') && m.user_id !== requesterId
  );
  if (recipients.length === 0) return;

  // Resolve projectId if not provided
  let resolvedProjectId = projectId;
  if (!resolvedProjectId) {
    const team = await teamRepo.findTeamById(teamId);
    if (team) {
      resolvedProjectId = team.project_id;
    }
  }

  // 2. Build message: e.g. "Alex requested to join Backend Development."
  const message = `${requesterName} requested to join ${teamName}.`;

  // 3. Formulate stable idempotency key for this request event
  const stamp = eventKey ?? 'req';
  const jobId = `tjr_${requestId}_${stamp}`;

  // 4. Connect Redis publisher for real-time delivery
  let publisher: ReturnType<typeof createPubSubConnection> | null = null;
  try {
    publisher = createPubSubConnection();
  } catch (err) {
    console.error('[notification] Redis connection failed for TEAM_JOIN_REQUEST (non-fatal):', (err as Error).message);
  }

  try {
    for (const recipient of recipients) {
      try {
        const notification = await persistNotification(
          jobId,
          recipient.user_id,
          null,
          'TEAM_JOIN_REQUEST',
          message,
          teamId,
          null,
          resolvedProjectId,
          requestId
        );

        if (!notification) {
          // Idempotency: duplicate notification already exists for this (job_id, user_id)
          continue;
        }

        if (publisher) {
          try {
            await publisher.publish(
              NOTIFICATION_CHANNEL,
              JSON.stringify({
                userId: recipient.user_id,
                notification: {
                  ...notification,
                  team_id: teamId,
                  project_id: resolvedProjectId ?? null,
                  join_request_id: requestId,
                },
              })
            );
          } catch (pubErr) {
            console.error(
              `[notification] Redis publish failed for team join request to ${recipient.user_id} (non-fatal):`,
              (pubErr as Error).message
            );
          }
        }
      } catch (recipErr) {
        console.error(
          `[notification] Failed to persist/deliver team join request for ${recipient.user_id} (non-fatal):`,
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
      n.project_id AS direct_project_id,
      n.join_request_id,
      n.type, 
      n.message, 
      n.job_id, 
      n.is_read, 
      n.created_at,
      n.conversation_type,
      n.conversation_id,
      n.conversation_name,
      n.unread_message_count,
      n.latest_sender_id,
      n.latest_sender_name,
      n.latest_message_preview,
      COALESCE(n.team_id, t.team_id) AS team_id,
      COALESCE(n.project_id, tm.project_id, direct_team.project_id) AS project_id
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
      SET is_read = TRUE,
          unread_message_count = 0
      WHERE id = ${notificationId} AND user_id = ${userId}
      RETURNING id, user_id, task_id, team_id, message_id, project_id, join_request_id, type, message, job_id, is_read, created_at,
                conversation_type, conversation_id, conversation_name, unread_message_count, latest_sender_id, latest_sender_name, latest_message_preview
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
      u.join_request_id,
      u.conversation_type,
      u.conversation_id,
      u.conversation_name,
      u.unread_message_count,
      u.latest_sender_id,
      u.latest_sender_name,
      u.latest_message_preview,
      COALESCE(u.team_id, t.team_id) AS team_id,
      COALESCE(u.project_id, tm.project_id, direct_team.project_id) AS project_id
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
      SET is_read = TRUE,
          unread_message_count = 0
      WHERE user_id = ${userId} AND is_read = FALSE
      RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM updated
  `;
  return parseInt(rows[0]?.count ?? '0', 10);
}

/**
 * Mark all unread notifications for a specific conversation (TEAM or PROJECT) as read.
 * Resets unread_message_count to 0.
 */
export async function markConversationNotificationsAsRead(
  userId: string,
  conversationType: 'TEAM' | 'PROJECT',
  conversationId: string
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    WITH updated AS (
      UPDATE notifications
      SET is_read = TRUE,
          unread_message_count = 0
      WHERE user_id = ${userId}
        AND conversation_type = ${conversationType}
        AND conversation_id = ${conversationId}
        AND is_read = FALSE
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
