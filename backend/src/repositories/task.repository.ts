import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Task {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  created_by: string;
  assigned_to: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: Date | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function createTask(fields: {
  name: string;
  description?: string;
  project_id: string;
  created_by: string;
  assigned_to?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
}): Promise<Task> {
  const rows = await sql<Task[]>`
    INSERT INTO tasks (name, description, project_id, created_by, assigned_to, status, priority, due_date)
    VALUES (
      ${fields.name},
      ${fields.description ?? null},
      ${fields.project_id},
      ${fields.created_by},
      ${fields.assigned_to ?? null},
      ${fields.status},
      ${fields.priority},
      ${fields.due_date ?? null}
    )
    RETURNING *
  `;
  return rows[0];
}

export async function findTaskById(taskId: string): Promise<Task | null> {
  const rows = await sql<Task[]>`
    SELECT * FROM tasks WHERE id = ${taskId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findTasksByProjectId(projectId: string): Promise<Task[]> {
  return sql<Task[]>`
    SELECT * FROM tasks
     WHERE project_id = ${projectId}
     ORDER BY created_at DESC
  `;
}

export async function updateTask(
  taskId: string,
  fields: {
    name?: string;
    description?: string | null;
    assigned_to?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    due_date?: string | null;
  }
): Promise<Task> {
  const rows = await sql<Task[]>`
    UPDATE tasks
       SET name        = COALESCE(${fields.name        ?? null}, name),
           description = CASE WHEN ${fields.description !== undefined}::boolean
                              THEN ${fields.description ?? null}
                              ELSE description END,
           assigned_to = CASE WHEN ${fields.assigned_to !== undefined}::boolean
                              THEN ${fields.assigned_to ?? null}
                              ELSE assigned_to END,
           status      = COALESCE(${fields.status   ?? null}, status),
           priority    = COALESCE(${fields.priority ?? null}, priority),
           due_date    = CASE WHEN ${fields.due_date !== undefined}::boolean
                              THEN ${fields.due_date ?? null}
                              ELSE due_date END
     WHERE id = ${taskId}
    RETURNING *
  `;
  return rows[0];
}

export async function deleteTask(taskId: string): Promise<void> {
  await sql`DELETE FROM tasks WHERE id = ${taskId}`;
}
