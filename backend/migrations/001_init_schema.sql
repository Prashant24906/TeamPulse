-- =============================================================================
-- Migration: 001_init_schema
-- Description: Initial schema for TeamFlow
-- Tables: users, teams, team_members, projects, tasks
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUMs
-- ---------------------------------------------------------------------------

CREATE TYPE team_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TYPE task_status AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED');

CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT          NOT NULL,
  email         TEXT          NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Auth lookup by email
CREATE INDEX idx_users_email ON users (email);

-- ---------------------------------------------------------------------------
-- 2. teams
-- ---------------------------------------------------------------------------

CREATE TABLE teams (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_by  UUID        NOT NULL REFERENCES users (id),
  max_size    INT         NOT NULL CHECK (max_size > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fetching teams created by a user
CREATE INDEX idx_teams_created_by ON teams (created_by);

-- ---------------------------------------------------------------------------
-- 3. team_members  (membership / role junction table)
-- ---------------------------------------------------------------------------

CREATE TABLE team_members (
  team_id   UUID        NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  role      team_role   NOT NULL,
  joined_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (team_id, user_id)   -- prevents duplicate membership
);

-- Fetching all teams a user belongs to
CREATE INDEX idx_team_members_user_id ON team_members (user_id);

-- ---------------------------------------------------------------------------
-- 4. projects
-- ---------------------------------------------------------------------------

CREATE TABLE projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  team_id     UUID        NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fetching all projects for a team
CREATE INDEX idx_projects_team_id ON projects (team_id);

-- ---------------------------------------------------------------------------
-- 5. tasks
-- ---------------------------------------------------------------------------

CREATE TABLE tasks (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT          NOT NULL,
  description TEXT,
  project_id  UUID          NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  created_by  UUID          NOT NULL REFERENCES users (id),
  assigned_to UUID          REFERENCES users (id),          -- nullable
  status      task_status   NOT NULL DEFAULT 'TODO',
  priority    task_priority NOT NULL DEFAULT 'MEDIUM',
  due_date    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Fetching all tasks in a project
CREATE INDEX idx_tasks_project_id  ON tasks (project_id);

-- Fetching tasks assigned to a specific user
CREATE INDEX idx_tasks_assigned_to ON tasks (assigned_to);

-- ---------------------------------------------------------------------------
-- 6. Business rule: task.assigned_to must be a member of the task's team
--
-- Enforced via a BEFORE INSERT / UPDATE trigger.
-- The backend also validates this, but the DB is the last line of defence.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_task_assignee_is_team_member()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id UUID;
BEGIN
  -- Only enforce when assigned_to is not NULL
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the team that owns this task's project
  SELECT team_id INTO v_team_id
    FROM projects
   WHERE id = NEW.project_id;

  -- Verify the assignee is a member of that team
  IF NOT EXISTS (
    SELECT 1 FROM team_members
     WHERE team_id = v_team_id
       AND user_id = NEW.assigned_to
  ) THEN
    RAISE EXCEPTION
      'assigned_to user (%) is not a member of the team that owns this project',
      NEW.assigned_to;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_assignee_team_check
  BEFORE INSERT OR UPDATE OF assigned_to, project_id
  ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION check_task_assignee_is_team_member();
