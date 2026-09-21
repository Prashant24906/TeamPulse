// ---------------------------------------------------------------------------
// types/joinRequest.ts — matches backend response shapes
// ---------------------------------------------------------------------------

export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Returned by GET /api/teams/search */
export interface TeamSearchResult {
  id: string;
  name: string;
  member_count: number;
  max_size: number;
  is_member: boolean;
  has_pending_request: boolean;
}

/** Returned by GET /api/teams/:teamId/join-requests (admin view) */
export interface JoinRequest {
  id: string;
  team_id: string;
  user_id: string;
  name: string;      // user's name (joined from users table)
  email: string;     // user's email
  status: JoinRequestStatus;
  created_at: string;
  updated_at: string;
}
