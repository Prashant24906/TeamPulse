import { Request, Response, NextFunction } from 'express';
import * as joinService from '../services/teamJoinRequest.service';
import { AppError } from '../middleware/error.middleware';
import {
  searchQuerySchema,
  updateJoinRequestSchema,
} from '../validators/teamJoinRequest.validator';

// Extract projectId only when the matched route actually defines it.
function projectId(req: Request): string | undefined {
  const v = req.params['projectId'];
  if (!v || v === 'undefined') return undefined;
  return Array.isArray(v) ? v[0] : v;
}

// ---------------------------------------------------------------------------
// GET /api/teams/search?q=<query>
// ---------------------------------------------------------------------------

export async function searchTeams(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = searchQuerySchema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const teams = await joinService.searchTeams(req.user!.userId, result.data.q);
    res.status(200).json({ status: 'success', data: { teams } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/teams/:teamId/join-requests
//   also mounted at /api/projects/:projectId/teams/:teamId/join-requests
// ---------------------------------------------------------------------------

export async function createJoinRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const request = await joinService.createJoinRequest(
      req.user!.userId,
      req.params.teamId as string,
      projectId(req)
    );
    res.status(201).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/teams/:teamId/join-requests
//   also mounted at /api/projects/:projectId/teams/:teamId/join-requests
// ---------------------------------------------------------------------------

export async function getJoinRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const requests = await joinService.getJoinRequests(
      req.user!.userId,
      req.params.teamId as string,
      projectId(req)
    );
    res.status(200).json({ status: 'success', data: { requests } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/teams/:teamId/join-requests/:requestId
//   also mounted at /api/projects/:projectId/teams/:teamId/join-requests/:requestId
// ---------------------------------------------------------------------------

export async function updateJoinRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateJoinRequestSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const request = await joinService.updateJoinRequest(
      req.user!.userId,
      req.params.teamId as string,
      req.params.requestId as string,
      result.data,
      projectId(req)
    );
    res.status(200).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
}
