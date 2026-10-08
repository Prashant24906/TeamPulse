// ---------------------------------------------------------------------------
// types/team.ts — matches GET /api/projects/:projectId/teams
// ---------------------------------------------------------------------------

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Team {
  id: string;
  name: string;
  project_id: string;
  created_by: string;
  max_size: number;
  created_at: string;
  role: TeamRole; // caller's role — included by backend
}

export interface TeamMember {
  user_id: string;
  team_id: string;
  role: TeamRole;
  joined_on: string;
  name: string;
  email: string;
}
