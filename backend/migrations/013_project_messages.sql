-- =============================================================================
-- Migration: 013_project_messages
-- Description: Project-wide chat messages (independent of team chat)
-- =============================================================================

CREATE TABLE project_messages (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index optimised for the primary query pattern:
--   "get the N most recent messages in project X"
CREATE INDEX idx_project_messages_project_created
  ON project_messages (project_id, created_at DESC);

-- Index for efficient sender lookups (edit/delete ownership checks)
CREATE INDEX idx_project_messages_sender
  ON project_messages (sender_id);
