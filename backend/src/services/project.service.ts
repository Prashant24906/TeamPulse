import { AppError } from '../middleware/error.middleware';
import * as projectRepo from '../repositories/project.repository';
import * as teamRepo    from '../repositories/team.repository';
import type { ProjectRole } from '../repositories/project.repository';
import type { CreateProjectInput, UpdateProjectInput } from '../validators/project.validator';
import { cacheGet, cacheSet, cacheInvalidate, CacheKeys } from '../utils/cache';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import { evictUserFromTeamRooms } from '../websocket/rooms';

// ---------------------------------------------------------------------------
// Helper — resolve project and caller's project-level role
// ---------------------------------------------------------------------------

async function resolveProjectAndRole(
  projectId: string,
  userId: string
): Promise<{ project: projectRepo.Project; role: ProjectRole }> {
  const project = await projectRepo.findProjectById(projectId);
  if (!project) throw new AppError(404, 'Project not found');

  const role = await projectRepo.findMemberRole(projectId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this project');

  return { project, role };
}

// ---------------------------------------------------------------------------
// Create project — any authenticated user; creator becomes OWNER
// ---------------------------------------------------------------------------

export async function createProject(
  userId: string,
  input: CreateProjectInput
) {
  const project = await projectRepo.createProject(input.name, userId);
  await projectRepo.addMember(project.id, userId, 'OWNER');
  return project;
}

// ---------------------------------------------------------------------------
// Get all projects for the caller (via project_members)
// ---------------------------------------------------------------------------

export async function getMyProjects(userId: string) {
  return projectRepo.findProjectsByUserId(userId);
}

// ---------------------------------------------------------------------------
// Get members of a project — OWNER or ADMIN only (returns emails and roles)
// ---------------------------------------------------------------------------

export async function getProjectMembers(userId: string, projectId: string) {
  const role = await projectRepo.findMemberRole(projectId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this project');
  if (role === 'MEMBER') throw new AppError(403, 'Only project OWNER or ADMIN can view the member list');
  return projectRepo.findMembersByProject(projectId);
}

// ---------------------------------------------------------------------------
// Update a project member's role — OWNER only
// ---------------------------------------------------------------------------

export async function updateProjectMemberRole(
  callerId: string,
  projectId: string,
  targetUserId: string,
  newRole: ProjectRole
) {
  // Only OWNER can change project-level roles
  const callerRole = await projectRepo.findMemberRole(projectId, callerId);
  if (!callerRole) throw new AppError(403, 'You are not a member of this project');
  if (callerRole !== 'OWNER') throw new AppError(403, 'Only the project OWNER can change member roles');

  // Cannot change own role
  if (callerId === targetUserId) throw new AppError(400, 'You cannot change your own role');

  // Cannot promote anyone to OWNER (transfer ownership is a separate action)
  if (newRole === 'OWNER') throw new AppError(400, 'Cannot promote to OWNER — use ownership transfer');

  // Target must be a member
  const targetRole = await projectRepo.findMemberRole(projectId, targetUserId);
  if (!targetRole) throw new AppError(404, 'User is not a member of this project');
  if (targetRole === 'OWNER') throw new AppError(400, 'Cannot change the OWNER\'s role');

  return projectRepo.updateMemberRole(projectId, targetUserId, newRole);
}

// ---------------------------------------------------------------------------
// Kick a project member — OWNER only
// ---------------------------------------------------------------------------

export async function kickProjectMember(
  callerId: string,
  projectId: string,
  targetUserId: string
) {
  const callerRole = await projectRepo.findMemberRole(projectId, callerId);
  if (!callerRole) throw new AppError(403, 'You are not a member of this project');
  if (callerRole !== 'OWNER') throw new AppError(403, 'Only the project OWNER can remove members');
  if (callerId === targetUserId) throw new AppError(400, 'You cannot remove yourself');

  const targetRole = await projectRepo.findMemberRole(projectId, targetUserId);
  if (!targetRole) throw new AppError(404, 'User is not a member of this project');
  if (targetRole === 'OWNER') throw new AppError(400, 'Cannot remove the project OWNER');

  // Remove the user's team memberships in this project BEFORE removing the
  // project membership. Returns the affected team IDs for WS eviction.
  // This is a system-level cascade: it intentionally bypasses the service-layer
  // OWNER guard because the user is losing a higher-level authority (project
  // membership), which supersedes any team-level ownership protection.
  const teamIds = await teamRepo.removeAllTeamMembershipsInProject(projectId, targetUserId);

  // Remove the project membership
  await projectRepo.removeMember(projectId, targetUserId);

  // Notify team members that this user was removed from each team
  for (const teamId of teamIds) {
    emitToTeam(teamId, WS_EVENTS.TEAM_MEMBER_REMOVED, { teamId, userId: targetUserId });
  }

  // Evict user's sockets from every team room they had in this project.
  // Best-effort, non-fatal — DB mutations already committed.
  await evictUserFromTeamRooms(targetUserId, teamIds);
}

// ---------------------------------------------------------------------------
// Get single project — caller must be a project member
// ---------------------------------------------------------------------------

export async function getProject(userId: string, projectId: string) {
  const cacheKey = CacheKeys.project(projectId);
  const cached = await cacheGet<projectRepo.Project>(cacheKey);

  const role = await projectRepo.findMemberRole(projectId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this project');

  if (cached) {
    return { ...cached, role };
  }

  const project = await projectRepo.findProjectById(projectId);
  if (!project) throw new AppError(404, 'Project not found');

  await cacheSet(cacheKey, project);
  return { ...project, role };
}

// ---------------------------------------------------------------------------
// Update project — OWNER or ADMIN
// ---------------------------------------------------------------------------

export async function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput
) {
  const { project, role } = await resolveProjectAndRole(projectId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only OWNER or ADMIN can update the project');
  }

  const updated = await projectRepo.updateProject(project.id, input);
  await cacheInvalidate(CacheKeys.project(project.id));

  return updated;
}

// ---------------------------------------------------------------------------
// Delete project — OWNER only
// ---------------------------------------------------------------------------

export async function deleteProject(userId: string, projectId: string) {
  const { project, role } = await resolveProjectAndRole(projectId, userId);

  if (role !== 'OWNER') {
    throw new AppError(403, 'Only the project OWNER can delete the project');
  }

  await projectRepo.deleteProject(project.id);
  await cacheInvalidate(CacheKeys.project(project.id));
}


// ---------------------------------------------------------------------------
// Project search / discovery
// ---------------------------------------------------------------------------

export async function searchProjects(q: string, userId: string) {
  return projectRepo.searchProjects(q, userId);
}

// ---------------------------------------------------------------------------
// Project join requests
// ---------------------------------------------------------------------------

export async function createJoinRequest(projectId: string, userId: string) {
  const project = await projectRepo.findProjectById(projectId);
  if (!project) throw new AppError(404, 'Project not found');

  // Already a member — no need to request
  const existing = await projectRepo.findMemberRole(projectId, userId);
  if (existing) throw new AppError(409, 'You are already a member of this project');

  return projectRepo.createJoinRequest(projectId, userId);
}

export async function getJoinRequests(projectId: string, callerId: string) {
  const role = await projectRepo.findMemberRole(projectId, callerId);
  if (!role || (role !== 'OWNER' && role !== 'ADMIN')) {
    throw new AppError(403, 'Only project OWNER or ADMIN can view join requests');
  }
  return projectRepo.findJoinRequestsByProject(projectId);
}

export async function resolveJoinRequest(
  projectId: string,
  requestId: string,
  status: 'APPROVED' | 'REJECTED',
  callerId: string
) {
  const role = await projectRepo.findMemberRole(projectId, callerId);
  if (!role || (role !== 'OWNER' && role !== 'ADMIN')) {
    throw new AppError(403, 'Only project OWNER or ADMIN can resolve join requests');
  }

  const req = await projectRepo.findJoinRequestById(requestId);
  if (!req || req.project_id !== projectId) throw new AppError(404, 'Join request not found');
  if (req.status !== 'PENDING') throw new AppError(409, 'Request already resolved');

  const updated = await projectRepo.updateJoinRequest(requestId, status);

  if (status === 'APPROVED') {
    // Add the user as a MEMBER of the project
    await projectRepo.addMember(projectId, req.user_id, 'MEMBER');
  }

  return updated;
}
