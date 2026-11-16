// ---------------------------------------------------------------------------
// types/message.ts — matches backend message response shapes
// ---------------------------------------------------------------------------

export interface TeamMessage {
  id: string;
  team_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMessage {
  id: string;
  project_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}
