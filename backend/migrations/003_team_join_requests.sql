-- =============================================================================
-- Migration: 003_team_join_requests
-- Description: Adds team discovery join request workflow
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM for request status
-- ---------------------------------------------------------------------------

CREATE TYPE join_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- team_join_requests table
-- ---------------------------------------------------------------------------

CREATE TABLE team_join_requests (
  id         UUID                NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id    UUID                NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  user_id    UUID                NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status     join_request_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Lookup by team (admin views all requests for their team)
CREATE INDEX idx_join_requests_team_id ON team_join_requests (team_id);

-- Lookup by user (user checks status of their own requests)
CREATE INDEX idx_join_requests_user_id ON team_join_requests (user_id);

-- Prevent duplicate PENDING requests for the same (team_id, user_id).
-- A partial unique index allows multiple APPROVED/REJECTED rows for the same
-- pair (e.g. rejected then re-applied) while blocking a second PENDING row.
CREATE UNIQUE INDEX idx_join_requests_one_pending_per_user
  ON team_join_requests (team_id, user_id)
  WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- Trigger: prevent a join request when the user is already a team member.
-- The application layer checks this first and returns a friendly error;
-- the trigger is the authoritative DB-level guard.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_join_request_not_already_member()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM team_members
     WHERE team_id = NEW.team_id
       AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION
      'User % is already a member of team %', NEW.user_id, NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_join_request_member_check
  BEFORE INSERT ON team_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_join_request_not_already_member();
