import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';
import {
  getNotificationsByUser,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notification.service';

// ---------------------------------------------------------------------------
// notification.controller.ts
//
// All endpoints require authentication (enforced by router-level middleware).
// user.id is attached by auth middleware as req.user.userId.
// ---------------------------------------------------------------------------

interface AuthRequest extends Request {
  user: { userId: string };
}

/**
 * GET /api/notifications
 * Query params: limit (default 20, max 50), offset (default 0)
 */
export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as AuthRequest).user.userId;

    const rawLimit  = parseInt((req.query.limit  as string) ?? '20', 10);
    const rawOffset = parseInt((req.query.offset as string) ?? '0',  10);

    const limit  = isNaN(rawLimit)  || rawLimit  < 1  ? 20 : Math.min(rawLimit,  50);
    const offset = isNaN(rawOffset) || rawOffset < 0  ? 0  : rawOffset;

    const notifications = await getNotificationsByUser(userId, limit, offset);
    res.json({ status: 'success', data: { notifications } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/unread-count
 */
export async function getUnreadCount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as AuthRequest).user.userId;
    const count  = await getUnreadNotificationCount(userId);
    res.json({ status: 'success', data: { count } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/read
 */
export async function markAsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId         = (req as AuthRequest).user.userId;
    const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!notificationId) {
      throw new AppError(400, 'Notification ID is required');
    }

    const notification = await markNotificationAsRead(notificationId, userId);
    if (!notification) {
      throw new AppError(404, 'Notification not found');
    }

    res.json({ status: 'success', data: { notification } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/read-all
 */
export async function markAllAsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as AuthRequest).user.userId;
    const count  = await markAllNotificationsAsRead(userId);
    res.json({ status: 'success', data: { updated: count } });
  } catch (err) {
    next(err);
  }
}
