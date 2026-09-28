-- =============================================================================
-- Migration: 004_team_messages
-- Description: Persistent team chat messages
-- =============================================================================

CREATE TABLE team_messages (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id    UUID        NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index optimised for the primary query pattern:
--   "get the N most recent messages in team X"
CREATE INDEX idx_team_messages_team_created
  ON team_messages (team_id, created_at DESC);
