import { AppError } from '../middleware/error.middleware';
import * as teamRepo from '../repositories/team.repository';
import type { TeamRole } from '../repositories/team.repository';
import type {
  CreateTeamInput,
  UpdateTeamInput,
  AddMemberInput,
  UpdateMemberRoleInput,
} from '../validators/team.validator';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';


// Role hierarchy for comparisons
const ROLE_RANK: Record<TeamRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

function hasRole(actual: TeamRole, required: TeamRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

// ---------------------------------------------------------------------------
// Create team — creator automatically becomes OWNER
// ---------------------------------------------------------------------------

export async function createTeam(userId: string, input: CreateTeamInput) {
  const team = await teamRepo.createTeam(input.name, userId, input.max_size);
  await teamRepo.addMember(team.id, userId, 'OWNER');
  return team;
}

// ---------------------------------------------------------------------------
// Get my teams (all teams the caller belongs to)
// ---------------------------------------------------------------------------

export async function getMyTeams(userId: string) {
  return teamRepo.findTeamsByUserId(userId);
}

// ---------------------------------------------------------------------------
// Get single team — caller must be a member
// ---------------------------------------------------------------------------

export async function getTeam(userId: string, teamId: string) {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');

  const team = await teamRepo.findTeamById(teamId);
  if (!team) throw new AppError(404, 'Team not found');

  return { ...team, role };
}

// ---------------------------------------------------------------------------
// Update team — OWNER or ADMIN
// ---------------------------------------------------------------------------

export async function updateTeam(
  userId: string,
  teamId: string,
  input: UpdateTeamInput
) {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');
  if (!hasRole(role, 'ADMIN')) throw new AppError(403, 'Only OWNER or ADMIN can update the team');

  // If lowering max_size, ensure it is not below current member count
  if (input.max_size !== undefined) {
    const count = await teamRepo.getMemberCount(teamId);
    if (input.max_size < count) {
      throw new AppError(
        400,
        `Cannot set max_size to ${input.max_size} — the team already has ${count} members`
      );
    }
  }

  const updated = await teamRepo.updateTeam(teamId, input);

  emitToTeam(teamId, WS_EVENTS.TEAM_UPDATED, { teamId, changes: input });

  return updated;
}

// ---------------------------------------------------------------------------
// Delete team — OWNER only
// ---------------------------------------------------------------------------

export async function deleteTeam(userId: string, teamId: string) {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');
  if (role !== 'OWNER') throw new AppError(403, 'Only the OWNER can delete the team');

  await teamRepo.deleteTeam(teamId);

  // Note: no emit here — members in the room will lose the room on their
  // next reconnect. The REST response is the source of truth.
}

// ---------------------------------------------------------------------------
// Get members — any team member can view
// ---------------------------------------------------------------------------

export async function getMembers(userId: string, teamId: string) {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');

  return teamRepo.getMembers(teamId);
}

// ---------------------------------------------------------------------------
// Add member — OWNER or ADMIN; respects max_size
// ---------------------------------------------------------------------------

export async function addMember(
  callerId: string,
  teamId: string,
  input: AddMemberInput
) {
  const callerRole = await teamRepo.findMemberRole(teamId, callerId);
  if (!callerRole) throw new AppError(403, 'You are not a member of this team');
  if (!hasRole(callerRole, 'ADMIN')) throw new AppError(403, 'Only OWNER or ADMIN can add members');

  // Check the target isn't already a member
  const existingRole = await teamRepo.findMemberRole(teamId, input.userId);
  if (existingRole) throw new AppError(409, 'User is already a member of this team');

  // Check max_size
  const team = await teamRepo.findTeamById(teamId);
  if (!team) throw new AppError(404, 'Team not found');
  const count = await teamRepo.getMemberCount(teamId);
  if (count >= team.max_size) {
    throw new AppError(400, `Team is full (max_size: ${team.max_size})`);
  }

  const member = await teamRepo.addMember(teamId, input.userId, input.role);

  emitToTeam(teamId, WS_EVENTS.TEAM_MEMBER_ADDED, {
    teamId,
    userId: input.userId,
    role:   input.role,
  });
  // Note: the newly added user is not in the room yet — they'll auto-join
  // team rooms on their next connect. Existing members receive the event.

  return member;
}

// ---------------------------------------------------------------------------
// Update member role — complex authorization rules
// ---------------------------------------------------------------------------

export async function updateMemberRole(
  callerId: string,
  teamId: string,
  targetUserId: string,
  input: UpdateMemberRoleInput
) {
  const callerRole = await teamRepo.findMemberRole(teamId, callerId);
  if (!callerRole) throw new AppError(403, 'You are not a member of this team');
  if (!hasRole(callerRole, 'ADMIN')) throw new AppError(403, 'Only OWNER or ADMIN can change roles');

  const targetRole = await teamRepo.findMemberRole(teamId, targetUserId);
  if (!targetRole) throw new AppError(404, 'User is not a member of this team');

  // Cannot change the OWNER's role (must use transfer ownership)
  if (targetRole === 'OWNER') {
    throw new AppError(400, 'Cannot change the OWNER\'s role — transfer ownership instead');
  }

  // ADMIN cannot promote anyone to OWNER
  if (callerRole === 'ADMIN' && input.role === 'OWNER') {
    throw new AppError(403, 'ADMIN cannot promote members to OWNER');
  }

  // ADMIN cannot demote another ADMIN
  if (callerRole === 'ADMIN' && targetRole === 'ADMIN') {
    throw new AppError(403, 'ADMIN cannot change the role of another ADMIN');
  }

  const updated = await teamRepo.updateMemberRole(teamId, targetUserId, input.role);

  emitToTeam(teamId, WS_EVENTS.TEAM_MEMBER_ADDED, {
    teamId,
    userId: targetUserId,
    role:   input.role,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Remove member — OWNER or ADMIN; cannot remove OWNER
// ---------------------------------------------------------------------------

export async function removeMember(
  callerId: string,
  teamId: string,
  targetUserId: string
) {
  const callerRole = await teamRepo.findMemberRole(teamId, callerId);
  if (!callerRole) throw new AppError(403, 'You are not a member of this team');

  // Any member can leave (remove themselves)
  const isSelf = callerId === targetUserId;

  if (!isSelf && !hasRole(callerRole, 'ADMIN')) {
    throw new AppError(403, 'Only OWNER or ADMIN can remove other members');
  }

  const targetRole = await teamRepo.findMemberRole(teamId, targetUserId);
  if (!targetRole) throw new AppError(404, 'User is not a member of this team');

  if (targetRole === 'OWNER') {
    throw new AppError(400, 'Cannot remove the OWNER — transfer ownership first');
  }

  // ADMIN cannot remove another ADMIN (only OWNER can)
  if (!isSelf && callerRole === 'ADMIN' && targetRole === 'ADMIN') {
    throw new AppError(403, 'ADMIN cannot remove another ADMIN');
  }

  await teamRepo.removeMember(teamId, targetUserId);

  emitToTeam(teamId, WS_EVENTS.TEAM_MEMBER_REMOVED, { teamId, userId: targetUserId });
}
