import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectResource {
  id: string;
  project_id: string;
  name: string;
  url: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findResourcesByProjectId(
  projectId: string
): Promise<ProjectResource[]> {
  return sql<ProjectResource[]>`
    SELECT id, project_id, name, url, created_by, created_at, updated_at
      FROM project_resources
     WHERE project_id = ${projectId}
     ORDER BY created_at ASC
  `;
}

export async function findResourceById(
  resourceId: string,
  projectId: string
): Promise<ProjectResource | null> {
  const rows = await sql<ProjectResource[]>`
    SELECT id, project_id, name, url, created_by, created_at, updated_at
      FROM project_resources
     WHERE id = ${resourceId}
       AND project_id = ${projectId}
     LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createResource(
  projectId: string,
  userId: string,
  data: { name: string; url: string }
): Promise<ProjectResource> {
  const trimmedName = data.name.trim();
  const trimmedUrl = data.url.trim();

  const rows = await sql<ProjectResource[]>`
    INSERT INTO project_resources (project_id, created_by, name, url)
    VALUES (${projectId}, ${userId}, ${trimmedName}, ${trimmedUrl})
    RETURNING id, project_id, name, url, created_by, created_at, updated_at
  `;
  return rows[0];
}

export async function updateResource(
  resourceId: string,
  projectId: string,
  data: { name?: string; url?: string }
): Promise<ProjectResource> {
  const trimmedName = data.name !== undefined ? data.name.trim() : null;
  const trimmedUrl = data.url !== undefined ? data.url.trim() : null;

  const rows = await sql<ProjectResource[]>`
    UPDATE project_resources
       SET name = COALESCE(${trimmedName}, name),
           url = COALESCE(${trimmedUrl}, url),
           updated_at = NOW()
     WHERE id = ${resourceId}
       AND project_id = ${projectId}
    RETURNING id, project_id, name, url, created_by, created_at, updated_at
  `;
  return rows[0];
}

export async function deleteResource(
  resourceId: string,
  projectId: string
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM project_resources
     WHERE id = ${resourceId}
       AND project_id = ${projectId}
    RETURNING id
  `;
  return rows.length > 0;
}
