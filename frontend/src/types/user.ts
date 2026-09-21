// ---------------------------------------------------------------------------
// types/user.ts — matches GET /api/auth/me response shape
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}
