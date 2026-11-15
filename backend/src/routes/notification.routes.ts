import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../controllers/notification.controller';

const router = Router();

// All notification endpoints require authentication
router.use(authenticate);

// GET  /api/notifications              — paginated list (limit, offset query params)
// GET  /api/notifications/unread-count — count of unread notifications
// PATCH /api/notifications/read-all    — mark all as read
// PATCH /api/notifications/:id/read   — mark one as read

// Important: /read-all must be declared BEFORE /:id/read to prevent
// Express matching "read-all" as a dynamic :id segment.
router.get('/',             getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all',   markAllAsRead);
router.patch('/:id/read',   markAsRead);

export default router;
