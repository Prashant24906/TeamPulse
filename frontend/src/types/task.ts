// ---------------------------------------------------------------------------
// types/task.ts — matches GET /api/projects/:projectId/tasks
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
  due_date: string | null;
  created_at: string;
}
