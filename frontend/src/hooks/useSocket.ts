'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';

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
    });
    socket.on('team.member_removed', (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['team-members', payload.teamId] });
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
      disconnectSocket();
    };
  }, [qc]);
}
