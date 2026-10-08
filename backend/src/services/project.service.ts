import { AppError } from '../middleware/error.middleware';
import * as projectRepo from '../repositories/project.repository';
import type { ProjectRole } from '../repositories/project.repository';
import type { CreateProjectInput, UpdateProjectInput } from '../validators/project.validator';
import { cacheGet, cacheSet, cacheInvalidate, CacheKeys } from '../utils/cache';

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
// Get single project — caller must be a project member
// ---------------------------------------------------------------------------

export async function getProject(userId: string, projectId: string) {
  const cacheKey = CacheKeys.project(projectId);
  const cached = await cacheGet<projectRepo.Project>(cacheKey);

  if (cached) {
    const role = await projectRepo.findMemberRole(projectId, userId);
    if (!role) throw new AppError(403, 'You are not a member of this project');
    return cached;
  }

  const project = await projectRepo.findProjectById(projectId);
  if (!project) throw new AppError(404, 'Project not found');

  const role = await projectRepo.findMemberRole(projectId, userId);
  if (!role) throw new AppError(403, 'You are not a member of this project');

  await cacheSet(cacheKey, project);
  return project;
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
// Helper — resolve a project's team and the caller's role in that team.
