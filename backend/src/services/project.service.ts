import { AppError } from '../middleware/error.middleware';
import * as projectRepo from '../repositories/project.repository';
import * as teamRepo    from '../repositories/team.repository';
import type { TeamRole } from '../repositories/team.repository';
import type { CreateProjectInput, UpdateProjectInput } from '../validators/project.validator';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import { cacheGet, cacheSet, cacheInvalidate, CacheKeys } from '../utils/cache';

// ---------------------------------------------------------------------------
// Helper — resolve a project's team and the caller's role in that team.
// This is the key authorization boundary described in the docs:
//   projectId → project.team_id → caller's membership → role
// ---------------------------------------------------------------------------

async function resolveProjectAndRole(
  projectId: string,
  userId: string
): Promise<{ project: projectRepo.Project; role: TeamRole }> {
  const project = await projectRepo.findProjectById(projectId);
  if (!project) throw new AppError(404, 'Project not found');

  const role = await teamRepo.findMemberRole(project.team_id, userId);
  if (!role) throw new AppError(403, 'You are not a member of the team that owns this project');

  return { project, role };
}

// ---------------------------------------------------------------------------
// Create project — OWNER or ADMIN of the team
// ---------------------------------------------------------------------------

export async function createProject(
  userId: string,
  teamId: string,
  input: CreateProjectInput
) {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');
  if (role === 'MEMBER') throw new AppError(403, 'Only OWNER or ADMIN can create projects');

  const project = await projectRepo.createProject(input.name, teamId);

  emitToTeam(teamId, WS_EVENTS.PROJECT_CREATED, {
    teamId,
    projectId: project.id,
    name:      project.name,
  });

  return project;
}

// ---------------------------------------------------------------------------
// Get all projects for a team — any team member
// ---------------------------------------------------------------------------

export async function getProjectsByTeam(userId: string, teamId: string) {
  const role = await teamRepo.findMemberRole(teamId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this team');

  return projectRepo.findProjectsByTeamId(teamId);
}

// ---------------------------------------------------------------------------
// Get single project — any member of the project's team
// ---------------------------------------------------------------------------

export async function getProject(userId: string, projectId: string) {
  // Authorization: resolve the team and verify membership
  const role = await (async () => {
    // Check cache first to avoid a DB hit just for the team_id lookup
    const cacheKey = CacheKeys.project(projectId);
    const cached = await cacheGet<projectRepo.Project>(cacheKey);
    if (cached) {
      const r = await teamRepo.findMemberRole(cached.team_id, userId);
      if (!r) throw new AppError(403, 'You are not a member of the team that owns this project');
      return { project: cached, role: r };
    }

    // Cache miss — fetch from DB
    const project = await projectRepo.findProjectById(projectId);
    if (!project) throw new AppError(404, 'Project not found');

    const r = await teamRepo.findMemberRole(project.team_id, userId);
    if (!r) throw new AppError(403, 'You are not a member of the team that owns this project');

    await cacheSet(cacheKey, project);
    return { project, role: r };
  })();

  return role.project;
}

// ---------------------------------------------------------------------------
// Update project — OWNER or ADMIN of the project's team
// ---------------------------------------------------------------------------

export async function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput
) {
  const { project, role } = await resolveProjectAndRole(projectId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only OWNER or ADMIN can update projects');
  }

  const updated = await projectRepo.updateProject(project.id, input);

  // Invalidate cache
  await cacheInvalidate(CacheKeys.project(project.id));

  emitToTeam(project.team_id, WS_EVENTS.PROJECT_UPDATED, {
    teamId:    project.team_id,
    projectId: project.id,
    changes:   input,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Delete project — OWNER or ADMIN of the project's team
// ---------------------------------------------------------------------------

export async function deleteProject(userId: string, projectId: string) {
  const { project, role } = await resolveProjectAndRole(projectId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only OWNER or ADMIN can delete projects');
  }

  const teamId = project.team_id;
  await projectRepo.deleteProject(project.id);

  // Invalidate cache
  await cacheInvalidate(CacheKeys.project(project.id));

  emitToTeam(teamId, WS_EVENTS.PROJECT_DELETED, {
    teamId,
    projectId: project.id,
  });
}
