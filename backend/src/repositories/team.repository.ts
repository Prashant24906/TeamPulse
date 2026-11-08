import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Team {
  id: string;
  name: string;
  project_id: string;
  created_by: string;
  max_size: number;
  created_at: Date;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_on?: Date;
}

export interface TeamMemberWithUser extends TeamMember {
  name: string;
  email: string;
}

export interface TeamWithRole extends Team {
  role: TeamRole;
}

// ---------------------------------------------------------------------------
// Team queries
// ---------------------------------------------------------------------------

export async function createTeam(
  name: string,
  createdBy: string,
  maxSize: number,
  projectId: string
): Promise<Team> {
  const rows = await sql<Team[]>`
    INSERT INTO teams (name, created_by, max_size, project_id)
    VALUES (${name}, ${createdBy}, ${maxSize}, ${projectId})
    RETURNING *
  `;
  return rows[0];
}

export async function findTeamById(teamId: string): Promise<Team | null> {
  const rows = await sql<Team[]>`
    SELECT * FROM teams WHERE id = ${teamId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findTeamsByProjectId(projectId: string): Promise<Team[]> {
  return sql<Team[]>`
    SELECT *
      FROM teams
     WHERE project_id = ${projectId}
     ORDER BY created_at DESC
  `;
}

export async function findTeamsByUserId(userId: string): Promise<TeamWithRole[]> {
  return sql<TeamWithRole[]>`
    SELECT t.*, tm.role
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = ${userId}
     ORDER BY t.created_at DESC
  `;
}

export async function updateTeam(
  teamId: string,
  fields: Partial<{ name: string; max_size: number }>
): Promise<Team> {
  const rows = await sql<Team[]>`
    UPDATE teams
       SET name     = COALESCE(${fields.name     ?? null}, name),
           max_size = COALESCE(${fields.max_size ?? null}, max_size)
     WHERE id = ${teamId}
    RETURNING *
  `;
  return rows[0];
}

export async function deleteTeam(teamId: string): Promise<void> {
  await sql`DELETE FROM teams WHERE id = ${teamId}`;
}

// ---------------------------------------------------------------------------
// Member queries
// ---------------------------------------------------------------------------

export async function findMemberRole(
  teamId: string,
  userId: string
): Promise<TeamRole | null> {
  const rows = await sql<{ role: TeamRole }[]>`
    SELECT role FROM team_members
     WHERE team_id = ${teamId} AND user_id = ${userId}
     LIMIT 1
  `;
  return rows[0]?.role ?? null;
}

export async function getMemberCount(teamId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM team_members WHERE team_id = ${teamId}
  `;
  return parseInt(rows[0].count, 10);
}

export async function getMembers(teamId: string): Promise<TeamMemberWithUser[]> {
  return sql<TeamMemberWithUser[]>`
    SELECT tm.team_id, tm.user_id, tm.role, u.name, u.email
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ${teamId}
     ORDER BY u.name ASC
  `;
}

export async function addMember(
  teamId: string,
  userId: string,
  role: TeamRole
): Promise<TeamMember> {
  const rows = await sql<TeamMember[]>`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (${teamId}, ${userId}, ${role})
    RETURNING *
  `;
  return rows[0];
}

export async function updateMemberRole(
  teamId: string,
  userId: string,
  role: TeamRole
): Promise<TeamMember> {
  const rows = await sql<TeamMember[]>`
    UPDATE team_members
       SET role = ${role}
     WHERE team_id = ${teamId} AND user_id = ${userId}
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Member not found');
  return rows[0];
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  await sql`
    DELETE FROM team_members
     WHERE team_id = ${teamId} AND user_id = ${userId}
  `;
}

/**
 * Returns the IDs of all teams (within a given project) that `userId` belongs
 * to. Used by the project-member removal path to identify which Socket.IO team
 * rooms to evict the user from before the membership rows are deleted.
 */
export async function findTeamIdsByUserAndProject(
  projectId: string,
  userId: string
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT t.id
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
     WHERE t.project_id = ${projectId}
       AND tm.user_id   = ${userId}
  `;
  return rows.map((r) => r.id);
}

/**
 * Bulk-delete all team_members rows for `userId` across every team that
 * belongs to `projectId`. Returns the list of team IDs from which the user
 * was removed (useful for WebSocket eviction).
 *
 * This is a system-level cascade operation (not user-initiated removal) and
 * intentionally bypasses the service-layer OWNER guard — the user has already
 * lost project membership, which is a higher authority than team ownership.
 */
export async function removeAllTeamMembershipsInProject(
  projectId: string,
  userId: string
): Promise<string[]> {
  const rows = await sql<{ team_id: string }[]>`
    DELETE FROM team_members
     WHERE user_id = ${userId}
       AND team_id IN (
         SELECT id FROM teams WHERE project_id = ${projectId}
       )
    RETURNING team_id
  `;
  return rows.map((r) => r.team_id);
}

/**
 * Transfer ownership atomically inside a serializable transaction.
 * - Demotes the outgoing owner to ADMIN.
 * - Promotes the incoming user to OWNER.
 * Uses SELECT FOR UPDATE to prevent concurrent races on the same team.
 */
export async function transferOwnership(
  teamId: string,
  fromUserId: string,
  toUserId: string
): Promise<void> {
  await sql.begin('SERIALIZABLE', async (tx) => {
    // Lock both rows for the duration of the transaction
    await tx`
      SELECT role FROM team_members
       WHERE team_id = ${teamId}
         AND user_id IN (${fromUserId}, ${toUserId})
       FOR UPDATE
    `;
    await tx`
      UPDATE team_members SET role = 'ADMIN'
       WHERE team_id = ${teamId} AND user_id = ${fromUserId}
    `;
    await tx`
      UPDATE team_members SET role = 'OWNER'
       WHERE team_id = ${teamId} AND user_id = ${toUserId}
    `;
  });
}
