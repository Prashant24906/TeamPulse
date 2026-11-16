'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ProjectResource } from '@/types/projectResource';

interface ResourcesResponse {
  status: string;
  data: { resources: ProjectResource[] };
}

interface ResourceResponse {
  status: string;
  data: { resource: ProjectResource };
}

// ---------------------------------------------------------------------------
// Query: fetch project resources
// ---------------------------------------------------------------------------

export function useProjectResources(projectId: string) {
  return useQuery<ProjectResource[]>({
    queryKey: ['project-resources', projectId],
    queryFn: async () => {
      const res = await api.get<ResourcesResponse>(`/projects/${projectId}/resources`);
      return res.data.data.resources;
    },
    enabled: !!projectId,
  });
}

// ---------------------------------------------------------------------------
// Mutation: add project resource
// ---------------------------------------------------------------------------

export function useCreateProjectResource(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; url: string }) => {
      const res = await api.post<ResourceResponse>(`/projects/${projectId}/resources`, data);
      return res.data.data.resource;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-resources', projectId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: update project resource
// ---------------------------------------------------------------------------

export function useUpdateProjectResource(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      resourceId,
      data,
    }: {
      resourceId: string;
      data: { name?: string; url?: string };
    }) => {
      const res = await api.patch<ResourceResponse>(
        `/projects/${projectId}/resources/${resourceId}`,
        data
      );
      return res.data.data.resource;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-resources', projectId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: delete project resource
// ---------------------------------------------------------------------------

export function useDeleteProjectResource(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (resourceId: string) => {
      await api.delete(`/projects/${projectId}/resources/${resourceId}`);
      return resourceId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-resources', projectId] });
    },
  });
}
