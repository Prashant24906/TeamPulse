import { Request, Response, NextFunction } from 'express';
import * as taskService from '../services/task.service';
import { AppError } from '../middleware/error.middleware';
import { createTaskSchema, updateTaskSchema } from '../validators/task.validator';

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/teams/:teamId/tasks
// ---------------------------------------------------------------------------

export async function createTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = createTaskSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const task = await taskService.createTask(
      req.user!.userId,
      req.params.teamId as string,
      result.data
    );
    res.status(201).json({ status: 'success', data: { task } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/teams/:teamId/tasks
// ---------------------------------------------------------------------------

export async function getTasksByTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tasks = await taskService.getTasksByTeam(
      req.user!.userId,
      req.params.teamId as string
    );
    res.status(200).json({ status: 'success', data: { tasks } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/tasks/:taskId
// ---------------------------------------------------------------------------

export async function getTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const task = await taskService.getTask(req.user!.userId, req.params.taskId as string);
    res.status(200).json({ status: 'success', data: { task } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:taskId
// ---------------------------------------------------------------------------

export async function updateTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateTaskSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const task = await taskService.updateTask(
      req.user!.userId,
      req.params.taskId as string,
      result.data
    );
    res.status(200).json({ status: 'success', data: { task } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:taskId
// ---------------------------------------------------------------------------

export async function deleteTask(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await taskService.deleteTask(req.user!.userId, req.params.taskId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

