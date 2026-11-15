-- Migration 009: Add partial index for efficient unread notification queries
-- Safe to run: IF NOT EXISTS prevents errors if the index already exists.

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE is_read = FALSE;
