-- =============================================================================
-- Migration 005: Architecture Inversion — Projects become the root entity
--
-- EXISTING SCHEMA:
--   users, teams, team_members
--   projects  (old: team_id FK → teams, this was a "task board" concept)
--   tasks     (old: project_id FK → old projects table)
--   trigger   trg_task_assignee_team_check (references projects.team_id)
--
-- AFTER:
--   users
--   projects  (NEW: root entity — created_by, no team_id)
--   project_members (NEW: project-level OWNER/ADMIN/MEMBER)
--   teams     (gains project_id FK → new projects)
--   tasks     (project_id renamed → team_id, FK points to teams now)
--
-- SAFE TO RUN: existing data is preserved and migrated.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Drop the old trigger + function that references the OLD projects table
--    (it will break once we rename/restructure projects)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_task_assignee_team_check ON tasks;
DROP FUNCTION IF EXISTS check_task_assignee_is_team_member();

-- ---------------------------------------------------------------------------
-- 1. Rename the OLD projects table → old_task_boards
--    (preserves the old data; we reference it to migrate tasks)
-- ---------------------------------------------------------------------------
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE projects RENAME TO old_task_boards;

-- ---------------------------------------------------------------------------
-- 2. Create the NEW top-level `projects` table
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Create project-level membership table
-- ---------------------------------------------------------------------------
CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')) DEFAULT 'MEMBER',
  joined_on  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 4. Add project_id column to teams (nullable for now)
-- ---------------------------------------------------------------------------
ALTER TABLE teams
  ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. DATA MIGRATION
--    For each existing team, create one default project named "<TeamName> (Project)"
--    and make the team's creator the project OWNER.
-- ---------------------------------------------------------------------------

-- 5a. Create a project for every existing team
INSERT INTO projects (id, name, created_by, created_at)
SELECT
  gen_random_uuid(),
  t.name || ' (Project)',
  t.created_by,
  t.created_at
FROM teams t;

-- 5b. Link each team to its newly-created project
WITH mapping AS (
  SELECT t.id AS team_id, p.id AS project_id
  FROM teams t
  JOIN projects p
    ON p.name       = t.name || ' (Project)'
   AND p.created_by = t.created_by
)
UPDATE teams
   SET project_id = mapping.project_id
  FROM mapping
 WHERE teams.id = mapping.team_id;

-- 5c. Add OWNER entries in project_members for each team creator
INSERT INTO project_members (project_id, user_id, role)
SELECT t.project_id, t.created_by, 'OWNER'
  FROM teams t
 WHERE t.project_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Rename tasks.project_id → tasks.team_id
--    and re-point the FK from old_task_boards → teams
-- ---------------------------------------------------------------------------
ALTER TABLE tasks RENAME COLUMN project_id TO team_id;

-- Point team_id at the teams table directly (tasks now belong to a team)
-- We derive the team_id from the old task board's team_id
UPDATE tasks t
   SET team_id = ob.team_id
  FROM old_task_boards ob
 WHERE t.team_id = ob.id;

-- Now add the FK constraint to teams
ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_team
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Make teams.project_id NOT NULL now that every team has one
-- ---------------------------------------------------------------------------
ALTER TABLE teams ALTER COLUMN project_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. Drop old_task_boards — no longer needed
-- ---------------------------------------------------------------------------
DROP TABLE old_task_boards CASCADE;

-- ---------------------------------------------------------------------------
-- 9. Recreate the assignee check trigger (now uses tasks.team_id directly)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_task_assignee_is_team_member()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
     WHERE team_id = NEW.team_id
       AND user_id = NEW.assigned_to
  ) THEN
    RAISE EXCEPTION
      'assigned_to user (%) is not a member of the team that owns this task',
      NEW.assigned_to;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_assignee_team_check
  BEFORE INSERT OR UPDATE OF assigned_to, team_id
  ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_task_assignee_is_team_member();

-- ---------------------------------------------------------------------------
-- 10. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_teams_project_id        ON teams(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user    ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team_id           ON tasks(team_id);

COMMIT;

-- =============================================================================
-- Verification queries — run these after the migration to confirm correctness:
--
--   SELECT COUNT(*) FROM teams WHERE project_id IS NULL;           -- must be 0
--
--   SELECT p.id, p.name FROM projects p
--   WHERE NOT EXISTS (
--     SELECT 1 FROM project_members pm
--     WHERE pm.project_id = p.id AND pm.role = 'OWNER'
--   );                                                              -- must return 0 rows
--
--   SELECT COUNT(*) FROM tasks t
--   LEFT JOIN teams ON teams.id = t.team_id
--   WHERE teams.id IS NULL;                                         -- must be 0
-- =============================================================================

