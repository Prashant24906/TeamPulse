// ---------------------------------------------------------------------------
// types/notification.ts — TypeScript types for the notification system
// ---------------------------------------------------------------------------

export type NotificationType = 'TASK_DUE_SOON' | 'TASK_OVERDUE';

export interface Notification {
  id: string;
  user_id: string;
  task_id: string;
  type: NotificationType;
  message: string;
  job_id: string;
  is_read: boolean;
  created_at: string;
}
