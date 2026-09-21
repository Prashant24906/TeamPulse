'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { TeamSearchResult, JoinRequest } from '@/types/joinRequest';

interface SearchResponse      { status: string; data: { teams: TeamSearchResult[] } }
interface JoinRequestResponse { status: string; data: { request: JoinRequest } }
interface JoinRequestsResponse{ status: string; data: { requests: JoinRequest[] } }

// ---------------------------------------------------------------------------
// useTeamSearch — search discoverable teams by name
// Only fires when query is >= 2 characters
// ---------------------------------------------------------------------------

export function useTeamSearch(q: string) {
  return useQuery<TeamSearchResult[]>({
    queryKey: ['team-search', q],
    queryFn: async () => {
      const res = await api.get<SearchResponse>('/teams/search', { params: { q } });
      return res.data.data.teams;
    },
    enabled: q.trim().length >= 2,
    staleTime: 15 * 1000,   // 15 s — search results stay fresh briefly
  });
}

// ---------------------------------------------------------------------------
// useCreateJoinRequest — authenticated user requests to join a team
// On success, invalidates the search cache so the button state updates
// ---------------------------------------------------------------------------

export function useCreateJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (teamId: string) => {
      const res = await api.post<JoinRequestResponse>(`/teams/${teamId}/join-requests`);
      return res.data.data.request;
    },
    onSuccess: () => {
      // Invalidate all search cache entries — has_pending_request flag must refresh
      qc.invalidateQueries({ queryKey: ['team-search'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useJoinRequests — admin/owner: list pending requests for a team
// ---------------------------------------------------------------------------

export function useJoinRequests(teamId: string) {
  return useQuery<JoinRequest[]>({
    queryKey: ['join-requests', teamId],
    queryFn: async () => {
      const res = await api.get<JoinRequestsResponse>(`/teams/${teamId}/join-requests`);
      return res.data.data.requests;
    },
    enabled: !!teamId,
  });
}

// ---------------------------------------------------------------------------
// useUpdateJoinRequest — admin/owner: approve or reject a request
// On success, refreshes both members list and join requests list
// ---------------------------------------------------------------------------

export function useUpdateJoinRequest(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      status,
    }: {
      requestId: string;
      status: 'APPROVED' | 'REJECTED';
    }) => {
      const res = await api.patch<JoinRequestResponse>(
        `/teams/${teamId}/join-requests/${requestId}`,
        { status }
      );
      return res.data.data.request;
    },
    onSuccess: () => {
      // Members list changes on approval; join-requests list shrinks on either action
      qc.invalidateQueries({ queryKey: ['team-members', teamId] });
      qc.invalidateQueries({ queryKey: ['join-requests', teamId] });
      // Also refresh the caller's own team list (they might have been auto-added)
      qc.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}
