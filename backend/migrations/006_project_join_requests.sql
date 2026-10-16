-- Migration 006: Project join requests table
-- Allows users to request access to a project they aren't members of.

CREATE TABLE IF NOT EXISTS project_join_requests (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pjr_project ON project_join_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_pjr_user    ON project_join_requests(user_id);
