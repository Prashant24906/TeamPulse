import { AppError } from '../middleware/error.middleware';
import * as teamRepo    from '../repositories/team.repository';
import * as messageRepo from '../repositories/teamMessage.repository';
import { emitToTeam }   from '../websocket/emit';
import { WS_EVENTS }    from '../websocket/events';
import type { SendMessageInput, ListMessagesInput } from '../validators/teamMessage.validator';

// ---------------------------------------------------------------------------
// Authorization helper — all roles (OWNER/ADMIN/MEMBER) can chat
// ---------------------------------------------------------------------------

async function requireMember(teamId: string, userId: string): Promise<void> {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');
}

// ---------------------------------------------------------------------------
// getMessages
// ---------------------------------------------------------------------------

export async function getMessages(
  userId: string,
  teamId: string,
  input: ListMessagesInput
) {
  await requireMember(teamId, userId);
  return messageRepo.getMessages(teamId, input.limit, input.before);
}

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

export async function sendMessage(
  userId: string,
  teamId: string,
  input: SendMessageInput
) {
  await requireMember(teamId, userId);

  const message = await messageRepo.createMessage(teamId, userId, input.content);

  // Emit to all team members in the Socket.IO room — best-effort, non-fatal
  emitToTeam(teamId, WS_EVENTS.MESSAGE_CREATED, {
    id:          message.id,
    teamId:      message.team_id,
    senderId:    message.sender_id,
    senderName:  message.sender_name,
    content:     message.content,
    createdAt:   message.created_at,
  });

  return message;
}
