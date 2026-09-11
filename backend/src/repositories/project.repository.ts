import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  team_id: string;
  status: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function createProject(
  name: string,
  teamId: string
): Promise<Project> {
  const rows = await sql<Project[]>`
    INSERT INTO projects (name, team_id)
    VALUES (${name}, ${teamId})
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

export async function findProjectsByTeamId(teamId: string): Promise<Project[]> {
  return sql<Project[]>`
    SELECT * FROM projects
     WHERE team_id = ${teamId}
     ORDER BY created_at DESC
  `;
}

export async function updateProject(
  projectId: string,
  fields: Partial<{ name: string; status: string }>
): Promise<Project> {
  const rows = await sql<Project[]>`
    UPDATE projects
       SET name   = COALESCE(${fields.name   ?? null}, name),
           status = COALESCE(${fields.status ?? null}, status)
     WHERE id = ${projectId}
    RETURNING *
  `;
  return rows[0];
}

export async function deleteProject(projectId: string): Promise<void> {
  await sql`DELETE FROM projects WHERE id = ${projectId}`;
}
