-- Migration 008: Globally Unique Project Names
-- Enforce case-insensitive and whitespace-trimmed uniqueness across all projects.
-- Expression index: LOWER(TRIM(name))

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_unique_name
  ON projects (LOWER(TRIM(name)));
