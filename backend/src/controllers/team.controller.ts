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
// POST /api/teams
// ---------------------------------------------------------------------------

export async function createTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = createTeamSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const team = await teamService.createTeam(req.user!.userId, result.data);
    res.status(201).json({ status: 'success', data: { team } });
  } catch (err) {
    next(err);
  }
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
// GET /api/teams/:teamId
// ---------------------------------------------------------------------------

export async function getTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const team = await teamService.getTeam(req.user!.userId, req.params.teamId);
    res.status(200).json({ status: 'success', data: { team } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/teams/:teamId
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

    const team = await teamService.updateTeam(req.user!.userId, req.params.teamId, result.data);
    res.status(200).json({ status: 'success', data: { team } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/teams/:teamId
// ---------------------------------------------------------------------------

export async function deleteTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await teamService.deleteTeam(req.user!.userId, req.params.teamId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/teams/:teamId/members
// ---------------------------------------------------------------------------

export async function getMembers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const members = await teamService.getMembers(req.user!.userId, req.params.teamId);
    res.status(200).json({ status: 'success', data: { members } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/teams/:teamId/members
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

    const member = await teamService.addMember(req.user!.userId, req.params.teamId, result.data);
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
      req.params.teamId,
      req.params.userId,
      result.data
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
    await teamService.removeMember(req.user!.userId, req.params.teamId, req.params.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
