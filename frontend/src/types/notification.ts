// ---------------------------------------------------------------------------
// types/notification.ts — TypeScript types for the notification system
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'TASK_DUE_SOON'
  | 'TASK_OVERDUE'
  | 'TASK_ASSIGNED'
  | 'TEAM_MESSAGE'
  | 'PROJECT_MESSAGE'
  | 'PROJECT_JOIN_REQUEST'
  | 'TEAM_JOIN_REQUEST';

export interface Notification {
  id: string;
  user_id: string;
  task_id?: string | null;
  team_id?: string | null;
  project_id?: string | null;
  message_id?: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
  join_request_id?: string | null;
  type: NotificationType;
  message: string;
  job_id?: string | null;
  is_read: boolean;
  created_at: string;
  transient?: boolean;
  conversation_type?: 'TEAM' | 'PROJECT' | null;
  conversation_id?: string | null;
  conversation_name?: string | null;
  unread_message_count?: number;
  latest_sender_id?: string | null;
  latest_sender_name?: string | null;
  latest_message_preview?: string | null;
}
