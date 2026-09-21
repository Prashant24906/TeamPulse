import { Request, Response, NextFunction } from 'express';
import * as joinService from '../services/teamJoinRequest.service';
import { AppError } from '../middleware/error.middleware';
import {
  searchQuerySchema,
  updateJoinRequestSchema,
} from '../validators/teamJoinRequest.validator';

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
// ---------------------------------------------------------------------------

export async function createJoinRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const request = await joinService.createJoinRequest(
      req.user!.userId,
      req.params.teamId
    );
    res.status(201).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/teams/:teamId/join-requests
// ---------------------------------------------------------------------------

export async function getJoinRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const requests = await joinService.getJoinRequests(
      req.user!.userId,
      req.params.teamId
    );
    res.status(200).json({ status: 'success', data: { requests } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/teams/:teamId/join-requests/:requestId
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
      req.params.teamId,
      req.params.requestId,
      result.data
    );
    res.status(200).json({ status: 'success', data: { request } });
  } catch (err) {
    next(err);
  }
}
