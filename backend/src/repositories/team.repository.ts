import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Team {
  id: string;
  name: string;
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
  maxSize: number
): Promise<Team> {
  const rows = await sql<Team[]>`
    INSERT INTO teams (name, created_by, max_size)
    VALUES (${name}, ${createdBy}, ${maxSize})
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

/** Transfer ownership atomically: demote old owner → MEMBER, promote new → OWNER. */
export async function transferOwnership(
  teamId: string,
  fromUserId: string,
  toUserId: string
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      UPDATE team_members SET role = 'MEMBER'
       WHERE team_id = ${teamId} AND user_id = ${fromUserId}
    `;
    await tx`
      UPDATE team_members SET role = 'OWNER'
       WHERE team_id = ${teamId} AND user_id = ${toUserId}
    `;
  });
}
