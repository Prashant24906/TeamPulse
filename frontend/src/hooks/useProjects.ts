'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Project } from '@/types/project';
import type { Team } from '@/types/team';

interface ProjectsResponse { status: string; data: { projects: Project[] } }
interface ProjectResponse  { status: string; data: { project: Project } }
interface TeamsResponse    { status: string; data: { teams: Team[] } }
interface TeamResponse     { status: string; data: { team: Team } }

// ---------------------------------------------------------------------------
// Project queries (top-level)
// ---------------------------------------------------------------------------

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<ProjectsResponse>('/projects');
      return res.data.data.projects;
    },
  });
}

export function useProject(projectId: string) {
  return useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await api.get<ProjectResponse>(`/projects/${projectId}`);
      return res.data.data.project;
    },
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await api.post<ProjectResponse>('/projects', data);
      return res.data.data.project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name?: string }) => {
      const res = await api.patch<ProjectResponse>(`/projects/${projectId}`, data);
      return res.data.data.project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/projects/${projectId}`);
      return projectId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ---------------------------------------------------------------------------
// Teams nested under a project
// ---------------------------------------------------------------------------

export function useProjectTeams(projectId: string) {
  return useQuery<Team[]>({
    queryKey: ['project-teams', projectId],
    queryFn: async () => {
      const res = await api.get<TeamsResponse>(`/projects/${projectId}/teams`);
      return res.data.data.teams;
    },
    enabled: !!projectId,
  });
}

export function useCreateTeam(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; max_size?: number }) => {
      const res = await api.post<TeamResponse>(`/projects/${projectId}/teams`, data);
      return res.data.data.team;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-teams', projectId] }),
  });
}
