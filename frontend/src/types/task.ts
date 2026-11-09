// ---------------------------------------------------------------------------
// types/task.ts — matches GET /api/projects/:projectId/tasks
// ---------------------------------------------------------------------------

export type TaskStatus   = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Task {
  id: string;
  name: string;
  description: string | null;
  project_id?: string;
  team_id?: string;
  created_by: string;
  assigned_to: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  closed_by?: string | null;
  closed_at?: string | null;
}

export interface ClosedTask extends Task {
  created_by_name: string;
  assigned_to_name: string | null;
  closed_by_name: string | null;
}
