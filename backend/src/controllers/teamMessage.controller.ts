import { Request, Response, NextFunction } from 'express';
import * as messageService from '../services/teamMessage.service';
import { AppError }        from '../middleware/error.middleware';
import {
  sendMessageSchema,
  listMessagesSchema,
} from '../validators/teamMessage.validator';

// ---------------------------------------------------------------------------
// GET /api/teams/:teamId/messages?limit=50&before=<uuid>
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
      result.data
    );
    res.status(200).json({ status: 'success', data: { messages } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/teams/:teamId/messages
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
      result.data
    );
    res.status(201).json({ status: 'success', data: { message } });
  } catch (err) {
    next(err);
  }
}

