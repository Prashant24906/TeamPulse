-- =============================================================================
-- Migration 011: Team Message Notifications
--
-- Make task_id nullable so non-task notifications (like TEAM_MESSAGE) can be stored.
-- Add team_id and message_id references to notifications table.
-- =============================================================================

ALTER TABLE notifications ALTER COLUMN task_id DROP NOT NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES team_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_team_id
  ON notifications (team_id);

CREATE INDEX IF NOT EXISTS idx_notifications_message_id
  ON notifications (message_id);
