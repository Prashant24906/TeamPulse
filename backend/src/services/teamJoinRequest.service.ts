import { AppError } from '../middleware/error.middleware';
import * as teamRepo from '../repositories/team.repository';
import * as joinRepo from '../repositories/teamJoinRequest.repository';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import type { UpdateJoinRequestInput } from '../validators/teamJoinRequest.validator';

// Role hierarchy helper (mirrors team.service.ts)
const ROLE_RANK: Record<'OWNER' | 'ADMIN' | 'MEMBER', number> = {
  MEMBER: 1, ADMIN: 2, OWNER: 3,
};
function hasRole(actual: 'OWNER' | 'ADMIN' | 'MEMBER', required: 'OWNER' | 'ADMIN' | 'MEMBER'): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

// ---------------------------------------------------------------------------
// searchTeams — any authenticated user can search
// ---------------------------------------------------------------------------

export async function searchTeams(userId: string, q: string) {
  // Validation already happened in the controller (Zod), but guard once more
  if (!q || q.trim().length < 2) {
    throw new AppError(400, 'Search query must be at least 2 characters');
  }
  return joinRepo.searchTeams(userId, q.trim());
}

// ---------------------------------------------------------------------------
// createJoinRequest — authenticated user requests to join a team
// ---------------------------------------------------------------------------

export async function createJoinRequest(userId: string, teamId: string) {
  // 1. Team must exist
  const team = await teamRepo.findTeamById(teamId);
  if (!team) throw new AppError(404, 'Team not found');

  // 2. User must not already be a member
  const existingRole = await teamRepo.findMemberRole(teamId, userId);
  if (existingRole) throw new AppError(409, 'You are already a member of this team');

  // 3. Must not already have a PENDING request (friendly error before DB constraint)
  const existing = await joinRepo.findPendingRequest(teamId, userId);
  if (existing) throw new AppError(409, 'You already have a pending join request for this team');

  // 4. Team must have capacity
  const count = await teamRepo.getMemberCount(teamId);
  if (count >= team.max_size) {
    throw new AppError(400, `Team is full (max_size: ${team.max_size})`);
  }

  // 5. Create the request
  const request = await joinRepo.createJoinRequest(teamId, userId);

  // 6. Notify admins/owner in the team room (best-effort — never blocks HTTP)
  emitToTeam(teamId, WS_EVENTS.TEAM_JOIN_REQUEST_CREATED, {
    teamId,
    requestId: request.id,
    userId,
  });

  return request;
}

// ---------------------------------------------------------------------------
// getJoinRequests — OWNER or ADMIN only
// ---------------------------------------------------------------------------

export async function getJoinRequests(callerId: string, teamId: string) {
  const role = await teamRepo.findMemberRole(teamId, callerId);
  if (!role) throw new AppError(403, 'You are not a member of this team');
  if (!hasRole(role, 'ADMIN')) {
    throw new AppError(403, 'Only OWNER or ADMIN can view join requests');
  }

  return joinRepo.getJoinRequests(teamId);
}

// ---------------------------------------------------------------------------
// updateJoinRequest — OWNER or ADMIN: approve or reject a request
// ---------------------------------------------------------------------------

export async function updateJoinRequest(
  callerId: string,
  teamId: string,
  requestId: string,
  input: UpdateJoinRequestInput
) {
  // 1. Caller must be OWNER or ADMIN
  const callerRole = await teamRepo.findMemberRole(teamId, callerId);
  if (!callerRole) throw new AppError(403, 'You are not a member of this team');
  if (!hasRole(callerRole, 'ADMIN')) {
    throw new AppError(403, 'Only OWNER or ADMIN can approve or reject join requests');
  }

  // 2. Request must exist and belong to this team (checked again inside repo transaction)
  const existingReq = await joinRepo.findRequestById(requestId);
  if (!existingReq) throw new AppError(404, 'Join request not found');
  if (existingReq.team_id !== teamId) throw new AppError(404, 'Join request not found');
  if (existingReq.status !== 'PENDING') {
    throw new AppError(409, `Request has already been ${existingReq.status.toLowerCase()}`);
  }

  if (input.status === 'APPROVED') {
    // Transactional approval (with SELECT FOR UPDATE to prevent concurrent overflow)
    const { request, userId } = await joinRepo.approveRequest(requestId, teamId);

    // Emit after successful DB commit — WebSocket failure is non-fatal
    emitToTeam(teamId, WS_EVENTS.TEAM_MEMBER_ADDED, {
      teamId,
      userId,
      role: 'MEMBER',
    });

    return request;
  } else {
    // Rejection: simple status update, no team_members change
    const request = await joinRepo.rejectRequest(requestId, teamId);
    return request;
  }
}
