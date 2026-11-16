import { AppError } from '../middleware/error.middleware';
import * as teamRepo from '../repositories/team.repository';
import * as joinRepo from '../repositories/teamJoinRequest.repository';
import * as projectRepo from '../repositories/project.repository';
import * as userRepo from '../repositories/user.repository';
import { emitToTeam, emitToUser } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import type { UpdateJoinRequestInput } from '../validators/teamJoinRequest.validator';
import { assertTeamBelongsToProject } from './team.guard';
import * as notificationService from './notification.service';

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
  return joinRepo.searchTeams(userId, q.trim());
}

// ---------------------------------------------------------------------------
// createJoinRequest — authenticated user requests to join a team
// ---------------------------------------------------------------------------

export async function createJoinRequest(userId: string, teamId: string, projectId?: string) {
  if (projectId) await assertTeamBelongsToProject(teamId, projectId);
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

  // 7. Persistent & real-time notification to team OWNER and ADMIN members
  try {
    let requesterName = 'A user';
    try {
      const user = await userRepo.findById(userId);
      if (user?.name) requesterName = user.name;
    } catch {
      // silent
    }
    const eventKey = new Date(request.updated_at || request.created_at || Date.now()).getTime();
    await notificationService.notifyTeamJoinRequest(
      request.id,
      teamId,
      team.name,
      userId,
      requesterName,
      team.project_id,
      eventKey
    );
  } catch (err) {
    console.error('[teamJoinRequest.service] Failed to send team join request notification (non-fatal):', (err as Error).message);
  }

  return request;
}

// ---------------------------------------------------------------------------
// getJoinRequests — OWNER or ADMIN only
// ---------------------------------------------------------------------------

export async function getJoinRequests(callerId: string, teamId: string, projectId?: string) {
  if (projectId) await assertTeamBelongsToProject(teamId, projectId);

  const role = await teamRepo.findMemberRole(teamId, callerId);
  if (role && hasRole(role, 'ADMIN')) {
    return joinRepo.getJoinRequests(teamId);
  }

  // Fallback: project OWNER or ADMIN
  const team = await teamRepo.findTeamById(teamId);
  if (!team) throw new AppError(404, 'Team not found');

  const projectRole = await projectRepo.findMemberRole(team.project_id, callerId);
  if (projectRole === 'OWNER' || projectRole === 'ADMIN') {
    return joinRepo.getJoinRequests(teamId);
  }

  if (!role && !projectRole) {
    throw new AppError(403, 'You are not a member of this team');
  }
  throw new AppError(403, 'Only OWNER or ADMIN can view join requests');
}

// ---------------------------------------------------------------------------
// updateJoinRequest — OWNER or ADMIN: approve or reject a request
// ---------------------------------------------------------------------------

export async function updateJoinRequest(
  callerId: string,
  teamId: string,
  requestId: string,
  input: UpdateJoinRequestInput,
  projectId?: string
) {
  if (projectId) await assertTeamBelongsToProject(teamId, projectId);

  // 1. Caller must be OWNER or ADMIN of team or parent project
  const callerRole = await teamRepo.findMemberRole(teamId, callerId);
  const isTeamAdmin = callerRole && hasRole(callerRole, 'ADMIN');

  let team: Awaited<ReturnType<typeof teamRepo.findTeamById>> | null = null;

  if (!isTeamAdmin) {
    team = await teamRepo.findTeamById(teamId);
    if (!team) throw new AppError(404, 'Team not found');

    const projectRole = await projectRepo.findMemberRole(team.project_id, callerId);
    const isProjectAdmin = projectRole === 'OWNER' || projectRole === 'ADMIN';

    if (!isProjectAdmin) {
      if (!callerRole && !projectRole) {
        throw new AppError(403, 'You are not a member of this team');
      }
      throw new AppError(403, 'Only OWNER or ADMIN can approve or reject join requests');
    }
  }

  // 2. Request must exist and belong to this team (checked again inside repo transaction)
  const existingReq = await joinRepo.findRequestById(requestId);
  if (!existingReq) throw new AppError(404, 'Join request not found');
  if (existingReq.team_id !== teamId) throw new AppError(404, 'Join request not found');
  if (existingReq.status !== 'PENDING') {
    throw new AppError(409, `Request has already been ${existingReq.status.toLowerCase()}`);
  }

  if (input.status === 'APPROVED') {
    // Verify the requester is a member of the team's parent project before approving
    if (!team) {
      team = await teamRepo.findTeamById(teamId);
      if (!team) throw new AppError(404, 'Team not found');
    }
    const requesterProjectRole = await projectRepo.findMemberRole(team.project_id, existingReq.user_id);
    if (!requesterProjectRole) {
      throw new AppError(403, 'User is not a member of the project this team belongs to');
    }

    // Transactional approval (with SELECT FOR UPDATE to prevent concurrent overflow)
    const { request, userId } = await joinRepo.approveRequest(requestId, teamId);

    // Emit after successful DB commit — WebSocket failure is non-fatal
    emitToTeam(teamId, WS_EVENTS.TEAM_MEMBER_ADDED, {
      teamId,
      userId,
      role: 'MEMBER',
    });

    // Notify the requester directly (they are NOT in the team room yet)
    emitToUser(userId, WS_EVENTS.TEAM_JOIN_REQUEST_UPDATED, {
      teamId,
      requestId,
      userId,
      status: 'APPROVED',
    });

    emitToUser(userId, WS_EVENTS.TEAM_MEMBERSHIP_ACCEPTED, {
      teamId,
      projectId: team.project_id,
      teamName: team.name,
      userId,
    });

    return request;
  } else {
    // Rejection: simple status update, no team_members change
    const request = await joinRepo.rejectRequest(requestId, teamId);

    // Notify the requester that their request was rejected
    emitToUser(existingReq.user_id, WS_EVENTS.TEAM_JOIN_REQUEST_UPDATED, {
      teamId,
      requestId,
      userId: existingReq.user_id,
      status: 'REJECTED',
    });

    return request;
  }
}
