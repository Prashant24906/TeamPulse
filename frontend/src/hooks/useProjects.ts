'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Project } from '@/types/project';

interface ProjectsResponse { status: string; data: { projects: Project[] } }
interface ProjectResponse  { status: string; data: { project: Project } }

export function useProjects(teamId: string) {
  return useQuery<Project[]>({
    queryKey: ['projects', teamId],
    queryFn: async () => {
      const res = await api.get<ProjectsResponse>(`/teams/${teamId}/projects`);
      return res.data.data.projects;
    },
    enabled: !!teamId,
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

export function useCreateProject(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await api.post<ProjectResponse>(`/teams/${teamId}/projects`, data);
      return res.data.data.project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', teamId] }),
  });
}

export function useUpdateProject(projectId: string, teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name?: string }) => {
      const res = await api.patch<ProjectResponse>(`/projects/${projectId}`, data);
      return res.data.data.project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', teamId] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useDeleteProject(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/projects/${projectId}`);
      return projectId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects', teamId] }),
  });
}
