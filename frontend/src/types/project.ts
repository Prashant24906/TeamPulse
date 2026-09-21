// ---------------------------------------------------------------------------
// types/project.ts — matches GET /api/teams/:teamId/projects
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  team_id: string;
  status: string;
  created_at: string;
}
