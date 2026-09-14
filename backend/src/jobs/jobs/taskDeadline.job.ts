// ---------------------------------------------------------------------------
// taskDeadline.job.ts — Job data types and key constants
//
// This file is the single source of truth for the job's shape.
// Both the producer (task.service) and the consumer (notification.worker)
// import from here.
// ---------------------------------------------------------------------------

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export type NotificationType = 'TASK_DUE_SOON' | 'TASK_OVERDUE';

export interface TaskDeadlineJobData {
  taskId: string;
  taskName: string;
  projectId: string;
  teamId: string;
  assignedTo: string | null;
  createdBy: string;
  dueDate: string;  // ISO string
  type: NotificationType;
}
