import { Request, Response, NextFunction } from 'express';
import * as messageService from '../services/projectMessage.service';
import { AppError }        from '../middleware/error.middleware';
import {
  sendProjectMessageSchema,
  updateProjectMessageSchema,
  listProjectMessagesSchema,
} from '../validators/projectMessage.validator';

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/messages?limit=50&before=<uuid>
// ---------------------------------------------------------------------------

export async function getMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = listProjectMessagesSchema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const messages = await messageService.getMessages(
      req.user!.userId,
      req.params.projectId as string,
      result.data
    );
    res.status(200).json({ status: 'success', data: { messages } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/messages
// ---------------------------------------------------------------------------

export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = sendProjectMessageSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const message = await messageService.sendMessage(
      req.user!.userId,
      req.params.projectId as string,
      result.data
    );
    res.status(201).json({ status: 'success', data: { message } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/:projectId/messages/:messageId
// ---------------------------------------------------------------------------

export async function updateMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = updateProjectMessageSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const message = await messageService.updateMessage(
      req.user!.userId,
      req.params.projectId as string,
      req.params.messageId as string,
      result.data
    );
    res.status(200).json({ status: 'success', data: { message } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/:projectId/messages/:messageId
// ---------------------------------------------------------------------------

export async function deleteMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await messageService.deleteMessage(
      req.user!.userId,
      req.params.projectId as string,
      req.params.messageId as string
    );
    res.status(200).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
}
