'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Team, TeamMember } from '@/types/team';
import type { TeamRole } from '@/types/team';

interface TeamsResponse  { status: string; data: { teams: Team[] } }
interface TeamResponse   { status: string; data: { team: Team } }
interface MembersResponse{ status: string; data: { members: TeamMember[] } }

export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get<TeamsResponse>('/teams');
      return res.data.data.teams;
    },
  });
}

export function useTeam(teamId: string) {
  return useQuery<Team>({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const res = await api.get<TeamResponse>(`/teams/${teamId}`);
      return res.data.data.team;
    },
    enabled: !!teamId,
  });
}

export function useTeamMembers(teamId: string) {
  return useQuery<TeamMember[]>({
    queryKey: ['team-members', teamId],
    queryFn: async () => {
      const res = await api.get<MembersResponse>(`/teams/${teamId}/members`);
      return res.data.data.members;
    },
    enabled: !!teamId,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; max_size?: number }) => {
      const res = await api.post<TeamResponse>('/teams', data);
      return res.data.data.team;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name?: string; max_size?: number }) => {
      const res = await api.patch<TeamResponse>(`/teams/${teamId}`, data);
      return res.data.data.team;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', teamId] });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (teamId: string) => {
      await api.delete(`/teams/${teamId}`);
      return teamId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useAddMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userId: string; role: TeamRole }) => {
      await api.post(`/teams/${teamId}/members`, data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-members', teamId] }),
  });
}

export function useRemoveMember(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/teams/${teamId}/members/${userId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-members', teamId] }),
  });
}
