import { Request, Response, NextFunction } from 'express';
import * as teamService from '../services/team.service';
import { AppError } from '../middleware/error.middleware';
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  updateMemberRoleSchema,
} from '../validators/team.validator';

// ---------------------------------------------------------------------------
// Helper: extract projectId only when the route actually defines it.
// req.params is typed as Record<string, string | string[]>, so we must narrow.
// ---------------------------------------------------------------------------

function projectId(req: Request): string | undefined {
  const v = req.params['projectId'];
  if (!v || v === 'undefined') return undefined;
  return Array.isArray(v) ? v[0] : v;
}

// ---------------------------------------------------------------------------
// POST /api/teams  (stub — teams must be created via project routes)
// ---------------------------------------------------------------------------

export async function createTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  return next(new AppError(400, 'Use POST /projects/:projectId/teams to create a team'));
}

// ---------------------------------------------------------------------------
// GET /api/teams
// ---------------------------------------------------------------------------

export async function getMyTeams(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teams = await teamService.getMyTeams(req.user!.userId);
    res.status(200).json({ status: 'success', data: { teams } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/teams/:teamId  |  GET /api/projects/:projectId/teams/:teamId
// ---------------------------------------------------------------------------

export async function getTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const team = await teamService.getTeam(
      req.user!.userId,
      req.params.teamId as string,
      projectId(req)
    );
    res.status(200).json({ status: 'success', data: { team } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/teams/:teamId  |  PATCH /api/projects/:projectId/teams/:teamId
// ---------------------------------------------------------------------------

export async function updateTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateTeamSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const team = await teamService.updateTeam(
      req.user!.userId,
      req.params.teamId as string,
      result.data,
      projectId(req)
    );
    res.status(200).json({ status: 'success', data: { team } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/teams/:teamId  |  DELETE /api/projects/:projectId/teams/:teamId
// ---------------------------------------------------------------------------

export async function deleteTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await teamService.deleteTeam(
      req.user!.userId,
      req.params.teamId as string,
      projectId(req)
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/teams/:teamId/members  |  .../projects/:projectId/teams/:teamId/members
// ---------------------------------------------------------------------------

export async function getMembers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const members = await teamService.getMembers(
      req.user!.userId,
      req.params.teamId as string,
      projectId(req)
    );
    res.status(200).json({ status: 'success', data: { members } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/teams/:teamId/members  |  .../projects/:projectId/teams/:teamId/members
// ---------------------------------------------------------------------------

export async function addMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = addMemberSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const member = await teamService.addMember(
      req.user!.userId,
      req.params.teamId as string,
      result.data,
      projectId(req)
    );
    res.status(201).json({ status: 'success', data: { member } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/teams/:teamId/members/:userId
// ---------------------------------------------------------------------------

export async function updateMemberRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateMemberRoleSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const member = await teamService.updateMemberRole(
      req.user!.userId,
      req.params.teamId as string,
      req.params.userId as string,
      result.data,
      projectId(req)
    );
    res.status(200).json({ status: 'success', data: { member } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/teams/:teamId/members/:userId
// ---------------------------------------------------------------------------

export async function removeMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await teamService.removeMember(
      req.user!.userId,
      req.params.teamId as string,
      req.params.userId as string,
      projectId(req)
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
