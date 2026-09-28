'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { TeamMessage } from '@/types/message';

interface MessagesResponse { status: string; data: { messages: TeamMessage[] } }
interface MessageResponse  { status: string; data: { message: TeamMessage } }

// ---------------------------------------------------------------------------
// useMessages — paginated; initial load = latest 50 messages
// ---------------------------------------------------------------------------

export function useMessages(teamId: string) {
  return useQuery<TeamMessage[]>({
    queryKey: ['messages', teamId],
    queryFn:  async () => {
      const res = await api.get<MessagesResponse>(`/teams/${teamId}/messages`, {
        params: { limit: 50 },
      });
      return res.data.data.messages;
    },
    enabled: !!teamId,
    staleTime: Infinity, // messages are kept fresh via WS; no polling needed
  });
}

// ---------------------------------------------------------------------------
// useSendMessage — POST, appends to cache optimistically on success
// ---------------------------------------------------------------------------

export function useSendMessage(teamId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await api.post<MessageResponse>(`/teams/${teamId}/messages`, { content });
      return res.data.data.message;
    },
    onSuccess: (newMsg) => {
      // Append to the existing cache so there is no extra HTTP round-trip.
      // The WS event will also arrive, but deduplication in useSocket prevents doubles.
      qc.setQueryData<TeamMessage[]>(['messages', teamId], (prev = []) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    },
  });
}
