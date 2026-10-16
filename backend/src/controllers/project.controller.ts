import { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/project.service';
import * as teamService    from '../services/team.service';
import { AppError } from '../middleware/error.middleware';
import { createProjectSchema, updateProjectSchema } from '../validators/project.validator';
import { createTeamSchema } from '../validators/team.validator';

// ---------------------------------------------------------------------------
// POST /api/projects
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

    const project = await projectService.createProject(req.user!.userId, result.data);
    res.status(201).json({ status: 'success', data: { project } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects
// ---------------------------------------------------------------------------

export async function getMyProjects(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projects = await projectService.getMyProjects(req.user!.userId);
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
    const project = await projectService.getProject(req.user!.userId, req.params.projectId as string);
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
      req.params.projectId as string,
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
    await projectService.deleteProject(req.user!.userId, req.params.projectId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/teams
// ---------------------------------------------------------------------------

export async function getProjectTeams(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teams = await teamService.getTeamsByProject(
      req.user!.userId,
      req.params.projectId as string
    );
    res.status(200).json({ status: 'success', data: { teams } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/teams
// ---------------------------------------------------------------------------

export async function createTeamInProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = createTeamSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const team = await teamService.createTeam(
      req.user!.userId,
      req.params.projectId as string,
      result.data
    );
    res.status(201).json({ status: 'success', data: { team } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects/search?q=
// ---------------------------------------------------------------------------

export async function searchProjects(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const q = String(req.query.q ?? '');
    const results = await projectService.searchProjects(q, req.user!.userId);
    res.json({ status: 'success', data: { projects: results } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/join-requests
// ---------------------------------------------------------------------------

export async function createJoinRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projectId = req.params.projectId as string;
    const request = await projectService.createJoinRequest(projectId, req.user!.userId);
    res.status(201).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/join-requests
// ---------------------------------------------------------------------------

export async function getJoinRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projectId = req.params.projectId as string;
    const requests = await projectService.getJoinRequests(projectId, req.user!.userId);
    res.json({ status: 'success', data: { requests } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/:projectId/join-requests/:requestId
// ---------------------------------------------------------------------------

export async function resolveJoinRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projectId = req.params.projectId as string;
    const requestId = req.params.requestId as string;
    const { status } = req.body as { status: 'APPROVED' | 'REJECTED' };
    if (status !== 'APPROVED' && status !== 'REJECTED') {
      return next(new AppError(400, 'status must be APPROVED or REJECTED'));
    }
    const updated = await projectService.resolveJoinRequest(
      projectId, requestId, status, req.user!.userId
    );
    res.json({ status: 'success', data: { request: updated } });
  } catch (err) {
    next(err);
  }
}
