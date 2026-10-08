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
