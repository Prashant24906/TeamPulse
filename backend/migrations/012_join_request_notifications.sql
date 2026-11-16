-- =============================================================================
-- Migration 012: Join Request Notifications
--
-- Add project_id and join_request_id references to notifications table.
-- =============================================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS join_request_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_project_id
  ON notifications (project_id);

CREATE INDEX IF NOT EXISTS idx_notifications_join_request_id
  ON notifications (join_request_id);
