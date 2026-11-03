import { Request, Response, NextFunction } from 'express';
import * as messageService from '../services/teamMessage.service';
import { AppError }        from '../middleware/error.middleware';
import {
  sendMessageSchema,
  listMessagesSchema,
} from '../validators/teamMessage.validator';

// Extract projectId only when the matched route actually defines it.
function projectId(req: Request): string | undefined {
  const v = req.params['projectId'];
  if (!v || v === 'undefined') return undefined;
  return Array.isArray(v) ? v[0] : v;
}

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/teams/:teamId/messages?limit=50&before=<uuid>
// ---------------------------------------------------------------------------

export async function getMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = listMessagesSchema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const messages = await messageService.getMessages(
      req.user!.userId,
      req.params.teamId as string,
      result.data,
      projectId(req)
    );
    res.status(200).json({ status: 'success', data: { messages } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/teams/:teamId/messages
// ---------------------------------------------------------------------------

export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = sendMessageSchema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'Validation failed', result.error.flatten().fieldErrors));
    }

    const message = await messageService.sendMessage(
      req.user!.userId,
      req.params.teamId as string,
      result.data,
      projectId(req)
    );
    res.status(201).json({ status: 'success', data: { message } });
  } catch (err) {
    next(err);
  }
}
