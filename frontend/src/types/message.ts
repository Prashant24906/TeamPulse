// ---------------------------------------------------------------------------
// types/message.ts — matches backend TeamMessageWithSender response shape
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
