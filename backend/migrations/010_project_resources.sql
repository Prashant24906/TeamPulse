-- =============================================================================
-- Migration 010: Project Resources
--
-- Adds project_resources table for storing named external URLs (GitHub, Figma,
-- docs, deployment, etc.) scoped to a project.
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_resources (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  url        TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by project
CREATE INDEX IF NOT EXISTS idx_project_resources_project_id
  ON project_resources (project_id);

-- Index for lookup by creator
CREATE INDEX IF NOT EXISTS idx_project_resources_created_by
  ON project_resources (created_by);
