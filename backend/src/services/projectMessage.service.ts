import { AppError } from '../middleware/error.middleware';
import * as projectRepo  from '../repositories/project.repository';
import * as messageRepo  from '../repositories/projectMessage.repository';
import * as notificationService from './notification.service';
import { emitToProject } from '../websocket/emit';
import { WS_EVENTS }     from '../websocket/events';
import type {
  SendProjectMessageInput,
  UpdateProjectMessageInput,
  ListProjectMessagesInput,
} from '../validators/projectMessage.validator';

// ---------------------------------------------------------------------------
// Authorization helper — all project roles (OWNER/ADMIN/MEMBER) can chat
// ---------------------------------------------------------------------------

async function requireProjectMember(projectId: string, userId: string): Promise<void> {
  const role = await projectRepo.findMemberRole(projectId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this project');
}

// ---------------------------------------------------------------------------
// getMessages
// ---------------------------------------------------------------------------

export async function getMessages(
  userId: string,
  projectId: string,
  input: ListProjectMessagesInput
) {
  await requireProjectMember(projectId, userId);
  return messageRepo.getMessages(projectId, input.limit, input.before);
}

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

export async function sendMessage(
  userId: string,
  projectId: string,
  input: SendProjectMessageInput
) {
  await requireProjectMember(projectId, userId);

  const message = await messageRepo.createMessage(projectId, userId, input.content);

  // Emit to all project members in the Socket.IO room — best-effort, non-fatal
  emitToProject(projectId, WS_EVENTS.PROJECT_MESSAGE_CREATED, {
    id:          message.id,
    projectId:   message.project_id,
    senderId:    message.sender_id,
    senderName:  message.sender_name,
    content:     message.content,
    createdAt:   message.created_at,
  });

  // Transient toast notifications to other project members — best-effort, non-fatal
  try {
    await notificationService.notifyProjectMessage(
      message.id,
      projectId,
      userId,
      message.sender_name,
      message.content
    );
  } catch (err) {
    console.error('[project-message] Failed to generate notifications (non-fatal):', (err as Error).message);
  }

  return message;
}

// ---------------------------------------------------------------------------
// updateMessage — sender only
// ---------------------------------------------------------------------------

export async function updateMessage(
  userId: string,
  projectId: string,
  messageId: string,
  input: UpdateProjectMessageInput
) {
  await requireProjectMember(projectId, userId);

  const existing = await messageRepo.findMessageById(messageId, projectId);
  if (!existing) throw new AppError(404, 'Message not found');
  if (existing.sender_id !== userId) throw new AppError(403, 'You can only edit your own messages');

  const updated = await messageRepo.updateMessage(messageId, projectId, input.content);
  if (!updated) throw new AppError(404, 'Message not found');

  // Emit update — best-effort
  emitToProject(projectId, WS_EVENTS.PROJECT_MESSAGE_UPDATED, {
    id:        updated.id,
    projectId: updated.project_id,
    content:   updated.content,
    updatedAt: updated.updated_at,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// deleteMessage — sender only
// ---------------------------------------------------------------------------

export async function deleteMessage(
  userId: string,
  projectId: string,
  messageId: string
) {
  await requireProjectMember(projectId, userId);

  const existing = await messageRepo.findMessageById(messageId, projectId);
  if (!existing) throw new AppError(404, 'Message not found');
  if (existing.sender_id !== userId) throw new AppError(403, 'You can only delete your own messages');

  await messageRepo.deleteMessage(messageId, projectId);

  // Emit deletion — best-effort
  emitToProject(projectId, WS_EVENTS.PROJECT_MESSAGE_DELETED, {
    id:        messageId,
    projectId,
  });
}
