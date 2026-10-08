// ---------------------------------------------------------------------------
// types/project.ts — matches GET /api/projects and GET /api/projects/:id
// ---------------------------------------------------------------------------

export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Project {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  role: ProjectRole; // caller's role — included by backend
}
