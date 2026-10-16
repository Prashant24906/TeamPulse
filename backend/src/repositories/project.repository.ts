import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Project {
  id: string;
  name: string;
  created_by: string;
  created_at: Date;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_on: Date;
}

export interface ProjectWithRole extends Project {
  role: ProjectRole;
}

// ---------------------------------------------------------------------------
// Project queries
// ---------------------------------------------------------------------------

export async function createProject(
  name: string,
  userId: string
): Promise<Project> {
  const rows = await sql<Project[]>`
    INSERT INTO projects (name, created_by)
    VALUES (${name}, ${userId})
    RETURNING *
  `;
  return rows[0];
}

export async function findProjectById(projectId: string): Promise<Project | null> {
  const rows = await sql<Project[]>`
    SELECT * FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  return rows[0] ?? null;
}

/** All projects the user is a member of (via project_members JOIN) */
export async function findProjectsByUserId(userId: string): Promise<ProjectWithRole[]> {
  return sql<ProjectWithRole[]>`
    SELECT p.*, pm.role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ${userId}
     ORDER BY p.created_at DESC
  `;
}

export async function updateProject(
  projectId: string,
  fields: Partial<{ name: string }>
): Promise<Project> {
  const rows = await sql<Project[]>`
    UPDATE projects
       SET name = COALESCE(${fields.name ?? null}, name)
     WHERE id = ${projectId}
    RETURNING *
  `;
  return rows[0];
}

export async function deleteProject(projectId: string): Promise<void> {
  await sql`DELETE FROM projects WHERE id = ${projectId}`;
}

// ---------------------------------------------------------------------------
// project_members queries
// ---------------------------------------------------------------------------

export async function findMemberRole(
  projectId: string,
  userId: string
): Promise<ProjectRole | null> {
  const rows = await sql<{ role: ProjectRole }[]>`
    SELECT role FROM project_members
     WHERE project_id = ${projectId} AND user_id = ${userId}
     LIMIT 1
  `;
  return rows[0]?.role ?? null;
}

export async function addMember(
  projectId: string,
  userId: string,
  role: ProjectRole
): Promise<ProjectMember> {
  const rows = await sql<ProjectMember[]>`
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (${projectId}, ${userId}, ${role})
    RETURNING *
  `;
  return rows[0];
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await sql`
    DELETE FROM project_members
     WHERE project_id = ${projectId} AND user_id = ${userId}
  `;
}

// ---------------------------------------------------------------------------
// Project search / discovery
// ---------------------------------------------------------------------------

export interface ProjectSearchResult {
  id: string;
  name: string;
  created_by: string;
  team_count: number;
  is_member: boolean;
  has_pending_request: boolean;
}

/**
 * Returns all projects whose name matches `q`, annotated with
 * the calling user's membership status and any pending join request.
 */
export async function searchProjects(
  q: string,
  userId: string
): Promise<ProjectSearchResult[]> {
  const pattern = `%${q}%`;
  return sql<ProjectSearchResult[]>`
    SELECT
      p.id,
      p.name,
      p.created_by,
      COUNT(DISTINCT t.id)::int          AS team_count,
      EXISTS (
        SELECT 1 FROM project_members pm2
         WHERE pm2.project_id = p.id AND pm2.user_id = ${userId}
      )                                  AS is_member,
      EXISTS (
        SELECT 1 FROM project_join_requests pjr
         WHERE pjr.project_id = p.id
           AND pjr.user_id    = ${userId}
           AND pjr.status     = 'PENDING'
      )                                  AS has_pending_request
    FROM projects p
    LEFT JOIN teams t ON t.project_id = p.id
    WHERE p.name ILIKE ${pattern}
    GROUP BY p.id
    ORDER BY p.name ASC
  `;
}

// ---------------------------------------------------------------------------
// Project join requests
// ---------------------------------------------------------------------------

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ProjectJoinRequest {
  id: string;
  project_id: string;
  user_id: string;
  status: JoinRequestStatus;
  created_at: Date;
  updated_at: Date;
  // joined from users table:
  name: string;
  email: string;
}

export async function createJoinRequest(
  projectId: string,
  userId: string
): Promise<ProjectJoinRequest> {
  const rows = await sql<ProjectJoinRequest[]>`
    INSERT INTO project_join_requests (project_id, user_id)
    VALUES (${projectId}, ${userId})
    ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'PENDING', updated_at = NOW()
    RETURNING *,
      (SELECT name  FROM users WHERE id = ${userId}) AS name,
      (SELECT email FROM users WHERE id = ${userId}) AS email
  `;
  return rows[0];
}

export async function findJoinRequestsByProject(
  projectId: string
): Promise<ProjectJoinRequest[]> {
  return sql<ProjectJoinRequest[]>`
    SELECT pjr.*, u.name, u.email
      FROM project_join_requests pjr
      JOIN users u ON u.id = pjr.user_id
     WHERE pjr.project_id = ${projectId} AND pjr.status = 'PENDING'
     ORDER BY pjr.created_at ASC
  `;
}

export async function updateJoinRequest(
  requestId: string,
  status: 'APPROVED' | 'REJECTED'
): Promise<ProjectJoinRequest> {
  const rows = await sql<ProjectJoinRequest[]>`
    UPDATE project_join_requests
       SET status = ${status}, updated_at = NOW()
     WHERE id = ${requestId}
    RETURNING *,
      (SELECT name  FROM users WHERE id = user_id) AS name,
      (SELECT email FROM users WHERE id = user_id) AS email
  `;
  return rows[0];
}

export async function findJoinRequestById(
  requestId: string
): Promise<ProjectJoinRequest | null> {
  const rows = await sql<ProjectJoinRequest[]>`
    SELECT pjr.*, u.name, u.email
      FROM project_join_requests pjr
      JOIN users u ON u.id = pjr.user_id
     WHERE pjr.id = ${requestId}
     LIMIT 1
  `;
  return rows[0] ?? null;
}
