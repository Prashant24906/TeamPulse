'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ProjectMessage } from '@/types/message';

interface ProjectMessagesResponse { status: string; data: { messages: ProjectMessage[] } }
interface ProjectMessageResponse  { status: string; data: { message: ProjectMessage } }

// ---------------------------------------------------------------------------
// useProjectMessages — paginated; initial load = latest 50 messages
// ---------------------------------------------------------------------------

export function useProjectMessages(projectId: string) {
  return useQuery<ProjectMessage[]>({
    queryKey: ['project-messages', projectId],
    queryFn:  async () => {
      const res = await api.get<ProjectMessagesResponse>(`/projects/${projectId}/messages`, {
        params: { limit: 50 },
      });
      return res.data.data.messages;
    },
    enabled:   !!projectId,
    staleTime: Infinity, // messages are kept fresh via WS; no polling needed
  });
}

// ---------------------------------------------------------------------------
// useSendProjectMessage — POST, appends to cache on success
// ---------------------------------------------------------------------------

export function useSendProjectMessage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await api.post<ProjectMessageResponse>(`/projects/${projectId}/messages`, { content });
      return res.data.data.message;
    },
    onSuccess: (newMsg) => {
      // Append to the existing cache so there is no extra HTTP round-trip.
      // The WS event will also arrive, but deduplication prevents doubles.
      qc.setQueryData<ProjectMessage[]>(['project-messages', projectId], (prev = []) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateProjectMessage
// ---------------------------------------------------------------------------

export function useUpdateProjectMessage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const res = await api.patch<ProjectMessageResponse>(
        `/projects/${projectId}/messages/${messageId}`,
        { content }
      );
      return res.data.data.message;
    },
    onSuccess: (updated) => {
      qc.setQueryData<ProjectMessage[]>(['project-messages', projectId], (prev = []) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
    },
  });
}

// ---------------------------------------------------------------------------
// useDeleteProjectMessage
// ---------------------------------------------------------------------------

export function useDeleteProjectMessage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      await api.delete(`/projects/${projectId}/messages/${messageId}`);
      return messageId;
    },
    onSuccess: (messageId) => {
      qc.setQueryData<ProjectMessage[]>(['project-messages', projectId], (prev = []) =>
        prev.filter((m) => m.id !== messageId)
      );
    },
  });
}
