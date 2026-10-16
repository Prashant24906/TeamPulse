'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectSearchResult {
  id: string;
  name: string;
  created_by: string;
  team_count: number;
  is_member: boolean;
  has_pending_request: boolean;
}

export interface ProjectJoinRequest {
  id: string;
  project_id: string;
  user_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  name: string;
  email: string;
}

interface SearchResponse      { status: string; data: { projects: ProjectSearchResult[] } }
interface JoinRequestResponse { status: string; data: { request: ProjectJoinRequest } }
interface JoinRequestsResponse{ status: string; data: { requests: ProjectJoinRequest[] } }

// ---------------------------------------------------------------------------
// useProjectSearch — search discoverable projects by name
// ---------------------------------------------------------------------------

export function useProjectSearch(q: string) {
  return useQuery<ProjectSearchResult[]>({
    queryKey: ['project-search', q],
    queryFn: async () => {
      const res = await api.get<SearchResponse>('/projects/search', { params: { q } });
      return res.data.data.projects;
    },
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// useCreateProjectJoinRequest — send a join request to a project
// ---------------------------------------------------------------------------

export function useCreateProjectJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const res = await api.post<JoinRequestResponse>(`/projects/${projectId}/join-requests`);
      return res.data.data.request;
    },
    onSuccess: () => {
      // Refresh search results so the button state updates immediately
      qc.invalidateQueries({ queryKey: ['project-search'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useProjectJoinRequests — list pending requests (admin view)
// ---------------------------------------------------------------------------

export function useProjectJoinRequests(projectId: string) {
  return useQuery<ProjectJoinRequest[]>({
    queryKey: ['project-join-requests', projectId],
    queryFn: async () => {
      const res = await api.get<JoinRequestsResponse>(`/projects/${projectId}/join-requests`);
      return res.data.data.requests;
    },
    enabled: !!projectId,
  });
}

// ---------------------------------------------------------------------------
// useResolveProjectJoinRequest — approve or reject a request
// ---------------------------------------------------------------------------

export function useResolveProjectJoinRequest(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: 'APPROVED' | 'REJECTED' }) => {
      const res = await api.patch<JoinRequestResponse>(
        `/projects/${projectId}/join-requests/${requestId}`,
        { status }
      );
      return res.data.data.request;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-join-requests', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
