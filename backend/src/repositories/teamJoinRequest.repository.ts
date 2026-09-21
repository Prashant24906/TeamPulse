import { sql, withTransaction } from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface JoinRequest {
  id: string;
  team_id: string;
  user_id: string;
  status: JoinRequestStatus;
  created_at: Date;
  updated_at: Date;
}

/** Enriched row returned to admins — includes user name/email */
export interface JoinRequestWithUser extends JoinRequest {
  name: string;
  email: string;
}

/** Discoverable team info returned by the search endpoint */
export interface TeamSearchResult {
  id: string;
  name: string;
  member_count: number;
  max_size: number;
  is_member: boolean;
  has_pending_request: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape PostgreSQL ILIKE wildcards (% and _) in user-supplied strings so
 * the pattern is treated as a literal substring match.
 */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Full-text substring search across team names.
 * Returns at most 20 teams that:
 *   - match the query (case-insensitive)
 *   - still have at least one open slot (member_count < max_size)
 *   - the authenticated user is NOT already a member of
 *
 * Also includes per-row flags so the UI can show correct button state.
 */
export async function searchTeams(
  userId: string,
  q: string
): Promise<TeamSearchResult[]> {
  const pattern = `%${escapeLike(q)}%`;

  return sql<TeamSearchResult[]>`
    SELECT
      t.id,
      t.name,
      t.max_size,
      COUNT(tm.user_id)::int                              AS member_count,
      EXISTS (
        SELECT 1 FROM team_members
         WHERE team_id = t.id AND user_id = ${userId}
      )                                                   AS is_member,
      EXISTS (
        SELECT 1 FROM team_join_requests
         WHERE team_id = t.id
           AND user_id = ${userId}
           AND status  = 'PENDING'
      )                                                   AS has_pending_request
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id = t.id
    WHERE
      t.name ILIKE ${pattern}
      -- exclude teams the caller already belongs to
      AND NOT EXISTS (
        SELECT 1 FROM team_members
         WHERE team_id = t.id AND user_id = ${userId}
      )
    GROUP BY t.id
    -- only teams that still have capacity
    HAVING COUNT(tm.user_id) < t.max_size
    ORDER BY t.name ASC
    LIMIT 20
  `;
}

// ---------------------------------------------------------------------------
// Create join request
// ---------------------------------------------------------------------------

export async function createJoinRequest(
  teamId: string,
  userId: string
): Promise<JoinRequest> {
  const rows = await sql<JoinRequest[]>`
    INSERT INTO team_join_requests (team_id, user_id)
    VALUES (${teamId}, ${userId})
    RETURNING *
  `;
  return rows[0];
}

// ---------------------------------------------------------------------------
// Find existing PENDING request
// ---------------------------------------------------------------------------

export async function findPendingRequest(
  teamId: string,
  userId: string
): Promise<JoinRequest | null> {
  const rows = await sql<JoinRequest[]>`
    SELECT * FROM team_join_requests
     WHERE team_id = ${teamId}
       AND user_id = ${userId}
       AND status  = 'PENDING'
     LIMIT 1
  `;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Find request by ID
// ---------------------------------------------------------------------------

export async function findRequestById(
  requestId: string
): Promise<JoinRequest | null> {
  const rows = await sql<JoinRequest[]>`
    SELECT * FROM team_join_requests
     WHERE id = ${requestId}
     LIMIT 1
  `;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Get all PENDING join requests for a team (admin view)
// ---------------------------------------------------------------------------

export async function getJoinRequests(
  teamId: string
): Promise<JoinRequestWithUser[]> {
  return sql<JoinRequestWithUser[]>`
    SELECT
      jr.id,
      jr.team_id,
      jr.user_id,
      jr.status,
      jr.created_at,
      jr.updated_at,
      u.name,
      u.email
    FROM team_join_requests jr
    JOIN users u ON u.id = jr.user_id
    WHERE jr.team_id = ${teamId}
      AND jr.status  = 'PENDING'
    ORDER BY jr.created_at ASC
  `;
}

// ---------------------------------------------------------------------------
// Approve — transactional with FOR UPDATE lock on team to prevent
// concurrent approvals from exceeding max_size
// ---------------------------------------------------------------------------

export async function approveRequest(
  requestId: string,
  teamId: string
): Promise<{ request: JoinRequest; userId: string }> {
  return withTransaction(async (tx) => {
    // 1. Lock the team row to serialise concurrent approvals
    const teamRows = await tx<{ id: string; max_size: number }[]>`
      SELECT id, max_size FROM teams
       WHERE id = ${teamId}
       FOR UPDATE
    `;
    if (!teamRows[0]) throw new Error('Team not found');
    const { max_size } = teamRows[0];

    // 2. Get the join request (must still be PENDING and belong to this team)
    const reqRows = await tx<JoinRequest[]>`
      SELECT * FROM team_join_requests
       WHERE id      = ${requestId}
         AND team_id = ${teamId}
         AND status  = 'PENDING'
       FOR UPDATE
    `;
    if (!reqRows[0]) throw new Error('Request not found or already processed');
    const request = reqRows[0];

    // 3. Verify the user isn't already a member
    const existingRows = await tx<{ user_id: string }[]>`
      SELECT user_id FROM team_members
       WHERE team_id = ${teamId} AND user_id = ${request.user_id}
       LIMIT 1
    `;
    if (existingRows[0]) throw new Error('User is already a member of this team');

    // 4. Check team capacity (within the lock — serialised)
    const countRows = await tx<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM team_members WHERE team_id = ${teamId}
    `;
    const currentCount = parseInt(countRows[0].count, 10);
    if (currentCount >= max_size) {
      throw new Error(`Team is full (max_size: ${max_size})`);
    }

    // 5. Add user as MEMBER
    await tx`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES (${teamId}, ${request.user_id}, 'MEMBER')
    `;

    // 6. Mark request APPROVED
    const updatedRows = await tx<JoinRequest[]>`
      UPDATE team_join_requests
         SET status = 'APPROVED', updated_at = NOW()
       WHERE id = ${requestId}
      RETURNING *
    `;

    return { request: updatedRows[0], userId: request.user_id };
  });
}

// ---------------------------------------------------------------------------
// Reject — no team_members change; just update status
// ---------------------------------------------------------------------------

export async function rejectRequest(
  requestId: string,
  teamId: string
): Promise<JoinRequest> {
  const rows = await sql<JoinRequest[]>`
    UPDATE team_join_requests
       SET status = 'REJECTED', updated_at = NOW()
     WHERE id      = ${requestId}
       AND team_id = ${teamId}
       AND status  = 'PENDING'
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Request not found or already processed');
  return rows[0];
}
