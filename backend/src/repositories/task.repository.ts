import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Task {
  id: string;
  name: string;
  description: string | null;
  team_id: string;
  created_by: string;
  assigned_to: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: Date | null;
  created_at: Date;
  closed_by: string | null;
  closed_at: Date | null;
}

/** Closed task with denormalised user display names (for the closed-tasks list). */
export interface ClosedTaskWithUsers extends Task {
  created_by_name: string;
  assigned_to_name: string | null;
  closed_by_name: string | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function createTask(fields: {
  name: string;
  description?: string;
  team_id: string;
  created_by: string;
  assigned_to?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
}): Promise<Task> {
  const rows = await sql<Task[]>`
    INSERT INTO tasks (name, description, team_id, created_by, assigned_to, status, priority, due_date)
    VALUES (
      ${fields.name},
      ${fields.description ?? null},
      ${fields.team_id},
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

/** Returns all non-closed tasks for a team (feeds the Kanban board). */
export async function findTasksByTeamId(teamId: string): Promise<Task[]> {
  return sql<Task[]>`
    SELECT * FROM tasks
     WHERE team_id = ${teamId}
       AND status  != 'CLOSED'
     ORDER BY created_at DESC
  `;
}

/** Returns all CLOSED tasks for a team, joined with user display names. */
export async function findClosedTasksByTeamId(teamId: string): Promise<ClosedTaskWithUsers[]> {
  return sql<ClosedTaskWithUsers[]>`
    SELECT
      t.*,
      creator.name   AS created_by_name,
      assignee.name  AS assigned_to_name,
      closer.name    AS closed_by_name
    FROM tasks t
    JOIN  users creator  ON creator.id  = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    LEFT JOIN users closer   ON closer.id   = t.closed_by
    WHERE t.team_id = ${teamId}
      AND t.status  = 'CLOSED'
    ORDER BY t.closed_at DESC
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

/** Close a task: sets status=CLOSED, records who closed it and when. */
export async function closeTask(taskId: string, closedBy: string): Promise<Task> {
  const rows = await sql<Task[]>`
    UPDATE tasks
       SET status    = 'CLOSED',
           closed_by = ${closedBy},
           closed_at = NOW()
     WHERE id = ${taskId}
    RETURNING *
  `;
  return rows[0];
}

/** Reopen a task: restores it to TODO and clears closure metadata. */
export async function reopenTask(taskId: string): Promise<Task> {
  const rows = await sql<Task[]>`
    UPDATE tasks
       SET status    = 'TODO',
           closed_by = NULL,
           closed_at = NULL
     WHERE id = ${taskId}
    RETURNING *
  `;
  return rows[0];
}

export async function deleteTask(taskId: string): Promise<void> {
  await sql`DELETE FROM tasks WHERE id = ${taskId}`;
}
