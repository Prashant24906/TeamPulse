import { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/project.service';
import { AppError } from '../middleware/error.middleware';
import { createProjectSchema, updateProjectSchema } from '../validators/project.validator';

// ---------------------------------------------------------------------------
// POST /api/teams/:teamId/projects
// ---------------------------------------------------------------------------

export async function createProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = createProjectSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const project = await projectService.createProject(
      req.user!.userId,
      req.params.teamId,
      result.data
    );
    res.status(201).json({ status: 'success', data: { project } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/teams/:teamId/projects
// ---------------------------------------------------------------------------

export async function getProjectsByTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projects = await projectService.getProjectsByTeam(
      req.user!.userId,
      req.params.teamId
    );
    res.status(200).json({ status: 'success', data: { projects } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId
// ---------------------------------------------------------------------------

export async function getProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const project = await projectService.getProject(req.user!.userId, req.params.projectId);
    res.status(200).json({ status: 'success', data: { project } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/:projectId
// ---------------------------------------------------------------------------

export async function updateProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateProjectSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const project = await projectService.updateProject(
      req.user!.userId,
      req.params.projectId,
      result.data
    );
    res.status(200).json({ status: 'success', data: { project } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/:projectId
// ---------------------------------------------------------------------------

export async function deleteProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await projectService.deleteProject(req.user!.userId, req.params.projectId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
