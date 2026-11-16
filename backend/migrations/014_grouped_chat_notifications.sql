-- =============================================================================
-- Migration: 014_grouped_chat_notifications
-- Description: Persistent, grouped chat notifications for team & project chats
-- =============================================================================

-- Allow job_id to be nullable so non-job notifications can omit it
ALTER TABLE notifications ALTER COLUMN job_id DROP NOT NULL;

-- Drop team_messages foreign key constraint on message_id so notifications can store
-- messages from either team_messages or project_messages without constraint violations
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_message_id_fkey;

-- Add conversation grouping fields
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS conversation_type TEXT,
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS conversation_name TEXT,
  ADD COLUMN IF NOT EXISTS unread_message_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS latest_sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latest_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS latest_message_preview TEXT;

-- Index for conversation lookups
CREATE INDEX IF NOT EXISTS idx_notifications_conversation
  ON notifications (conversation_type, conversation_id);

-- Partial unique index guaranteeing at most ONE unread notification per user per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unread_conversation
  ON notifications (user_id, conversation_type, conversation_id)
  WHERE is_read = FALSE;
