'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import type { TeamMessage } from '@/types/message';
import type { Team } from '@/types/team';

// ---------------------------------------------------------------------------
// useSocket — manages Socket.IO lifecycle for a protected page
//
// On mount: connect the socket (authenticated via HttpOnly cookie)
// On unmount: disconnect cleanly
//
// WebSocket events → invalidate TanStack Query cache
// The payload always contains teamId + projectId so we know which
// cache entry to invalidate.
// ---------------------------------------------------------------------------

export function useSocket() {
  const qc = useQueryClient();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    connectSocket();
    const socket = getSocket();

    // Task events — invalidate the correct project's task list
    socket.on('task.created', (payload: { projectId: string }) => {
      qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    });
    socket.on('task.updated', (payload: { projectId: string }) => {
      qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    });
    socket.on('task.deleted', (payload: { projectId: string }) => {
      qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    });

    // Project events — invalidate the team's project list
    socket.on('project.created', (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['projects', payload.teamId] });
    });
    socket.on('project.updated', (payload: { teamId: string; projectId: string }) => {
      qc.invalidateQueries({ queryKey: ['projects', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['project', payload.projectId] });
    });
    socket.on('project.deleted', (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['projects', payload.teamId] });
    });

    // Team events
    socket.on('team.updated', (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['team', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    });
    socket.on('team.member_added', (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['team-members', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['join-requests', payload.teamId] });
    });
    socket.on('team.member_removed', (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['team-members', payload.teamId] });
    });
    // New join request submitted — notify admin UI
    socket.on('team.join_request_created', (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['join-requests', payload.teamId] });
    });

    // Team deleted — remove from cache immediately; redirect if currently viewing it
    socket.on('team.deleted', (payload: { teamId: string }) => {
      // Surgically remove the deleted team from the list cache
      qc.setQueryData<Team[]>(['teams'], (old) =>
        old ? old.filter((t) => t.id !== payload.teamId) : old
      );
      // Remove the per-team cache entries too
      qc.removeQueries({ queryKey: ['team', payload.teamId] });
      qc.removeQueries({ queryKey: ['team-members', payload.teamId] });

      // Redirect any member who is currently inside the deleted team's pages
      if (pathname?.startsWith(`/teams/${payload.teamId}`)) {
        router.replace('/teams');
      }
    });

    // Chat — append new message directly to the cache (no extra HTTP request).
    // Deduplication prevents doubles when the sender's own useSendMessage
    // mutation has already appended the same message.
    socket.on('message.created', (payload: {
      id: string; teamId: string; senderId: string;
      senderName: string; content: string; createdAt: string;
    }) => {
      const existing = qc.getQueryData<TeamMessage[]>(['messages', payload.teamId]);
      // Only update if the cache for this team is already loaded
      if (existing === undefined) return;
      if (existing.some((m) => m.id === payload.id)) return;

      const newMsg: TeamMessage = {
        id:          payload.id,
        team_id:     payload.teamId,
        sender_id:   payload.senderId,
        sender_name: payload.senderName,
        content:     payload.content,
        created_at:  payload.createdAt,
        updated_at:  payload.createdAt,
      };
      qc.setQueryData<TeamMessage[]>(['messages', payload.teamId], [...existing, newMsg]);
    });

    return () => {
      socket.off('task.created');
      socket.off('task.updated');
      socket.off('task.deleted');
      socket.off('project.created');
      socket.off('project.updated');
      socket.off('project.deleted');
      socket.off('team.updated');
      socket.off('team.member_added');
      socket.off('team.member_removed');
      socket.off('team.join_request_created');
      socket.off('team.deleted');
      socket.off('message.created');
      disconnectSocket();
    };
  }, [qc, router, pathname]);
}
