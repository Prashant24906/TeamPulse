-- =============================================================================
-- Migration: 002_notifications
-- Description: Notification table for task deadline background jobs
-- =============================================================================

CREATE TABLE notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  task_id     UUID        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,   -- e.g. 'TASK_DUE_SOON', 'TASK_OVERDUE'
  message     TEXT        NOT NULL,
  job_id      TEXT        NOT NULL,   -- BullMQ job ID — used for idempotency
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency: one notification per job per user
  UNIQUE (job_id, user_id)
);

CREATE INDEX idx_notifications_user_id ON notifications (user_id);
CREATE INDEX idx_notifications_task_id ON notifications (task_id);
