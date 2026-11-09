-- Migration 007: Add CLOSED status and closure-tracking columns to tasks
-- PostgreSQL note: ALTER TYPE … ADD VALUE cannot run inside an explicit transaction block.
-- Run this file with a psql client or migration runner that supports that constraint.

-- 1. Extend the task_status enum
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'CLOSED';

-- 2. Add closure-tracking columns
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- 3. Index: fast per-team closed-task queries ordered by closure time
CREATE INDEX IF NOT EXISTS idx_tasks_closed_at
  ON tasks(team_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;

