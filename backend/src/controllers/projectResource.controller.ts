import { Request, Response, NextFunction } from 'express';
import * as resourceService from '../services/projectResource.service';
import { AppError } from '../middleware/error.middleware';
import {
  createResourceSchema,
  updateResourceSchema,
} from '../validators/projectResource.validator';

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/resources
// ---------------------------------------------------------------------------

export async function getResources(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const resources = await resourceService.getResources(
      req.user!.userId,
      req.params.projectId as string
    );
    res.status(200).json({ status: 'success', data: { resources } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/resources
// ---------------------------------------------------------------------------

export async function createResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = createResourceSchema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(400, 'Validation failed', result.error.flatten().fieldErrors)
      );
    }

    const resource = await resourceService.createResource(
      req.user!.userId,
      req.params.projectId as string,
      result.data
    );
    res.status(201).json({ status: 'success', data: { resource } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/:projectId/resources/:resourceId
// ---------------------------------------------------------------------------

export async function updateResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateResourceSchema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(400, 'Validation failed', result.error.flatten().fieldErrors)
      );
    }

    const resource = await resourceService.updateResource(
      req.user!.userId,
      req.params.projectId as string,
      req.params.resourceId as string,
      result.data
    );
    res.status(200).json({ status: 'success', data: { resource } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/:projectId/resources/:resourceId
// ---------------------------------------------------------------------------

export async function deleteResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await resourceService.deleteResource(
      req.user!.userId,
      req.params.projectId as string,
      req.params.resourceId as string
    );
    res.status(200).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
}
