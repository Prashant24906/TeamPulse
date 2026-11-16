import { AppError } from '../middleware/error.middleware';
import * as projectRepo from '../repositories/project.repository';
import * as projectResourceRepo from '../repositories/projectResource.repository';
import type { CreateResourceInput, UpdateResourceInput } from '../validators/projectResource.validator';
import type { ProjectRole } from '../repositories/project.repository';

// ---------------------------------------------------------------------------
// Helper: verify project exists and user is a member
// ---------------------------------------------------------------------------

async function resolveProjectAndRole(
  projectId: string,
  userId: string
): Promise<{ project: projectRepo.Project; role: ProjectRole }> {
  const project = await projectRepo.findProjectById(projectId);
  if (!project) {
    throw new AppError(404, 'Project not found');
  }

  const role = await projectRepo.findMemberRole(projectId, userId);
  if (!role) {
    throw new AppError(403, 'You are not a member of this project');
  }

  return { project, role };
}

// ---------------------------------------------------------------------------
// Get resources — OWNER, ADMIN, and MEMBER
// ---------------------------------------------------------------------------

export async function getResources(userId: string, projectId: string) {
  await resolveProjectAndRole(projectId, userId);
  return projectResourceRepo.findResourcesByProjectId(projectId);
}

// ---------------------------------------------------------------------------
// Create resource — OWNER or ADMIN only
// ---------------------------------------------------------------------------

export async function createResource(
  userId: string,
  projectId: string,
  input: CreateResourceInput
) {
  const { role } = await resolveProjectAndRole(projectId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only project OWNER or ADMIN can add resources');
  }

  return projectResourceRepo.createResource(projectId, userId, input);
}

// ---------------------------------------------------------------------------
// Update resource — OWNER or ADMIN only
// ---------------------------------------------------------------------------

export async function updateResource(
  userId: string,
  projectId: string,
  resourceId: string,
  input: UpdateResourceInput
) {
  const { role } = await resolveProjectAndRole(projectId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only project OWNER or ADMIN can edit resources');
  }

  const existing = await projectResourceRepo.findResourceById(resourceId, projectId);
  if (!existing) {
    throw new AppError(404, 'Resource not found');
  }

  return projectResourceRepo.updateResource(resourceId, projectId, input);
}

// ---------------------------------------------------------------------------
// Delete resource — OWNER or ADMIN only
// ---------------------------------------------------------------------------

export async function deleteResource(
  userId: string,
  projectId: string,
  resourceId: string
) {
  const { role } = await resolveProjectAndRole(projectId, userId);

  if (role === 'MEMBER') {
    throw new AppError(403, 'Only project OWNER or ADMIN can delete resources');
  }

  const existing = await projectResourceRepo.findResourceById(resourceId, projectId);
  if (!existing) {
    throw new AppError(404, 'Resource not found');
  }

  await projectResourceRepo.deleteResource(resourceId, projectId);
}
