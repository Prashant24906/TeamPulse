'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, getSocket } from '@/lib/socket';
import { getStoredToken } from '@/lib/api';
import type { TeamMessage, ProjectMessage } from '@/types/message';
import type { Team } from '@/types/team';
import type { User } from '@/types/user';
import type { Notification } from '@/types/notification';

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

  const pathnameRef = useRef(pathname);
  const routerRef   = useRef(router);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    connectSocket();
    const socket = getSocket();

    // Task events — invalidate the correct project's and team's task list
    const onTaskCreated = (payload: { projectId: string; teamId?: string }) => {
      if (payload.teamId) qc.invalidateQueries({ queryKey: ['tasks', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    };

    const onTaskUpdated = (payload: { projectId: string; teamId?: string }) => {
      if (payload.teamId) {
        qc.invalidateQueries({ queryKey: ['tasks', payload.teamId] });
        qc.invalidateQueries({ queryKey: ['closed-tasks', payload.teamId] });
      }
      qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    };

    const onTaskDeleted = (payload: { projectId: string; teamId?: string }) => {
      if (payload.teamId) {
        qc.invalidateQueries({ queryKey: ['tasks', payload.teamId] });
        qc.invalidateQueries({ queryKey: ['closed-tasks', payload.teamId] });
      }
      qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    };

    const onTaskClosed = (payload: { projectId?: string; teamId: string }) => {
      if (payload.teamId) {
        qc.invalidateQueries({ queryKey: ['tasks', payload.teamId] });
        qc.invalidateQueries({ queryKey: ['closed-tasks', payload.teamId] });
      }
      if (payload.projectId) qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    };

    const onTaskReopened = (payload: { projectId?: string; teamId: string }) => {
      if (payload.teamId) {
        qc.invalidateQueries({ queryKey: ['tasks', payload.teamId] });
        qc.invalidateQueries({ queryKey: ['closed-tasks', payload.teamId] });
      }
      if (payload.projectId) qc.invalidateQueries({ queryKey: ['tasks', payload.projectId] });
    };

    // Project events — invalidate the team's project list
    const onProjectCreated = (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['projects', payload.teamId] });
    };

    const onProjectUpdated = (payload: { teamId: string; projectId: string }) => {
      qc.invalidateQueries({ queryKey: ['projects', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['project', payload.projectId] });
    };

    const onProjectDeleted = (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['projects', payload.teamId] });
    };

    // Project member removed or self-left — refresh members, and if it's the current user, clean up and redirect
    const onProjectMemberRemoved = (payload: { projectId: string; userId: string }) => {
      qc.invalidateQueries({ queryKey: ['project-members', payload.projectId] });

      const me = qc.getQueryData<User>(['me']);
      if (me && me.id === payload.userId) {
        qc.setQueryData<any[]>(['projects'], (old: any) =>
          old ? old.filter((p: any) => p.id !== payload.projectId) : old
        );
        qc.removeQueries({ queryKey: ['project', payload.projectId] });
        qc.removeQueries({ queryKey: ['project-members', payload.projectId] });
        qc.removeQueries({ queryKey: ['project-teams', payload.projectId] });
        qc.removeQueries({ queryKey: ['project-resources', payload.projectId] });
        qc.removeQueries({ queryKey: ['project-join-requests', payload.projectId] });
        qc.invalidateQueries({ queryKey: ['projects'] });
        qc.invalidateQueries({ queryKey: ['teams'] });
        qc.invalidateQueries({ queryKey: ['project-teams'] });
        qc.invalidateQueries({ queryKey: ['project-search'] });
        if (pathnameRef.current?.includes(`/projects/${payload.projectId}`)) {
          routerRef.current.replace('/projects');
        }
      }
    };

    // Project membership accepted — notify the accepted user in real time
    const onProjectMembershipAccepted = (payload: {
      projectId: string;
      projectName?: string;
      userId: string;
    }) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', payload.projectId] });
      qc.invalidateQueries({ queryKey: ['project-members', payload.projectId] });
      qc.invalidateQueries({ queryKey: ['project-teams', payload.projectId] });
      qc.invalidateQueries({ queryKey: ['project-teams'] });
      qc.invalidateQueries({ queryKey: ['project-join-requests', payload.projectId] });
      qc.invalidateQueries({ queryKey: ['project-search'] });
    };

    // Team events
    const onTeamUpdated = (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['team', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    };

    const onTeamMemberAdded = (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['team-members', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['join-requests', payload.teamId] });
    };

    // Ownership transfer — refresh member list so roles reflect the change
    const onTeamOwnershipTransferred = (payload: {
      teamId:      string;
      newOwnerId:  string;
      prevOwnerId: string;
    }) => {
      qc.invalidateQueries({ queryKey: ['team-members', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['teams'] });
    };

    const onTeamMemberRemoved = (payload: { teamId: string; userId: string }) => {
      qc.invalidateQueries({ queryKey: ['team-members', payload.teamId] });

      const me = qc.getQueryData<User>(['me']);
      if (me && me.id === payload.userId) {
        qc.setQueryData<Team[]>(['projects'], (old: any) =>
          old ? old.filter((t: any) => t.id !== payload.teamId) : old
        );
        qc.removeQueries({ queryKey: ['team', payload.teamId] });
        qc.removeQueries({ queryKey: ['team-members', payload.teamId] });
        if (pathnameRef.current?.includes(`/teams/${payload.teamId}`)) {
          const match = pathnameRef.current.match(/\/projects\/([^/]+)/);
          routerRef.current.replace(match ? `/projects/${match[1]}` : '/projects');
        }
      }
    };

    // New join request submitted — notify admin UI
    const onTeamJoinRequestCreated = (payload: { teamId: string }) => {
      qc.invalidateQueries({ queryKey: ['join-requests', payload.teamId] });
    };

    // Join request approved or rejected — notify the requester
    const onTeamJoinRequestUpdated = (payload: {
      teamId: string;
      requestId: string;
      userId: string;
      status: 'APPROVED' | 'REJECTED';
    }) => {
      qc.invalidateQueries({ queryKey: ['team-search'] });

      if (payload.status === 'APPROVED') {
        qc.invalidateQueries({ queryKey: ['project-teams'] });
        qc.invalidateQueries({ queryKey: ['projects'] });
      }
    };

    // Team membership accepted — notify the accepted user in real time
    const onTeamMembershipAccepted = (payload: {
      teamId: string;
      projectId: string;
      teamName?: string;
      userId: string;
    }) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['team-members', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['project-teams', payload.projectId] });
      qc.invalidateQueries({ queryKey: ['project-teams'] });
      qc.invalidateQueries({ queryKey: ['join-requests', payload.teamId] });
      qc.invalidateQueries({ queryKey: ['team-search'] });
    };

    // Team deleted — remove from cache immediately; redirect if currently viewing it
    const onTeamDeleted = (payload: { teamId: string }) => {
      qc.setQueryData<Team[]>(['project-teams'], (old: any) =>
        old ? old.filter((t: any) => t.id !== payload.teamId) : old
      );
      qc.removeQueries({ queryKey: ['team', payload.teamId] });
      qc.removeQueries({ queryKey: ['team-members', payload.teamId] });

      if (pathnameRef.current?.includes(`/teams/${payload.teamId}`)) {
        const match = pathnameRef.current.match(/\/projects\/([^/]+)/);
        routerRef.current.replace(match ? `/projects/${match[1]}` : '/projects');
      }
    };

    // Chat — append new team message directly to the cache (no extra HTTP request).
    const onMessageCreated = (payload: {
      id: string; teamId: string; senderId: string;
      senderName: string; content: string; createdAt: string;
    }) => {
      const existing = qc.getQueryData<TeamMessage[]>(['messages', payload.teamId]);
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
    };

    // Project Chat — append new project message to cache
    const onProjectMessageCreated = (payload: {
      id: string; projectId: string; senderId: string;
      senderName: string; content: string; createdAt: string;
    }) => {
      const existing = qc.getQueryData<ProjectMessage[]>(['project-messages', payload.projectId]);
      if (existing === undefined) return;
      if (existing.some((m) => m.id === payload.id)) return;

      const newMsg: ProjectMessage = {
        id:          payload.id,
        project_id:  payload.projectId,
        sender_id:   payload.senderId,
        sender_name: payload.senderName,
        content:     payload.content,
        created_at:  payload.createdAt,
        updated_at:  payload.createdAt,
      };
      qc.setQueryData<ProjectMessage[]>(['project-messages', payload.projectId], [...existing, newMsg]);
    };

    // Project Chat — update existing project message in cache
    const onProjectMessageUpdated = (payload: {
      id: string; projectId: string; content: string; updatedAt: string;
    }) => {
      qc.setQueryData<ProjectMessage[]>(['project-messages', payload.projectId], (prev = []) =>
        prev.map((m) =>
          m.id === payload.id
            ? { ...m, content: payload.content, updated_at: payload.updatedAt }
            : m
        )
      );
    };

    // Project Chat — remove deleted project message from cache
    const onProjectMessageDeleted = (payload: { id: string; projectId: string }) => {
      qc.setQueryData<ProjectMessage[]>(['project-messages', payload.projectId], (prev = []) =>
        prev.filter((m) => m.id !== payload.id)
      );
    };

    // Notification events — invalidate cache so the bell and dropdown refresh
    const onNotificationReceived = (payload?: Notification) => {
      // Transient notifications (e.g. team chat messages) must NOT invalidate the persistent notification cache
      if (!payload?.transient) {
        qc.invalidateQueries({ queryKey: ['notifications'] });
      }
      // Broadcast to window so any component (e.g. NotificationToast) receives it reliably
      if (typeof window !== 'undefined' && payload) {
        window.dispatchEvent(new CustomEvent('teamflow:notification', { detail: payload }));
      }
    };

    // Register all listeners
    socket.on('task.created', onTaskCreated);
    socket.on('task.updated', onTaskUpdated);
    socket.on('task.deleted', onTaskDeleted);
    socket.on('task.closed', onTaskClosed);
    socket.on('task.reopened', onTaskReopened);
    socket.on('project.created', onProjectCreated);
    socket.on('project.updated', onProjectUpdated);
    socket.on('project.deleted', onProjectDeleted);
    socket.on('project.member_removed', onProjectMemberRemoved);
    socket.on('project.membership.accepted', onProjectMembershipAccepted);
    socket.on('team.updated', onTeamUpdated);
    socket.on('team.member_added', onTeamMemberAdded);
    socket.on('team.ownership_transferred', onTeamOwnershipTransferred);
    socket.on('team.member_removed', onTeamMemberRemoved);
    socket.on('team.join_request_created', onTeamJoinRequestCreated);
    socket.on('team.join_request_updated', onTeamJoinRequestUpdated);
    socket.on('team.membership.accepted', onTeamMembershipAccepted);
    socket.on('team.deleted', onTeamDeleted);
    socket.on('message.created', onMessageCreated);
    socket.on('project.message.created', onProjectMessageCreated);
    socket.on('project.message.updated', onProjectMessageUpdated);
    socket.on('project.message.deleted', onProjectMessageDeleted);
    socket.on('notification.received', onNotificationReceived);

    return () => {
      socket.off('task.created', onTaskCreated);
      socket.off('task.updated', onTaskUpdated);
      socket.off('task.deleted', onTaskDeleted);
      socket.off('task.closed', onTaskClosed);
      socket.off('task.reopened', onTaskReopened);
      socket.off('project.created', onProjectCreated);
      socket.off('project.updated', onProjectUpdated);
      socket.off('project.deleted', onProjectDeleted);
      socket.off('project.member_removed', onProjectMemberRemoved);
      socket.off('project.membership.accepted', onProjectMembershipAccepted);
      socket.off('team.updated', onTeamUpdated);
      socket.off('team.member_added', onTeamMemberAdded);
      socket.off('team.ownership_transferred', onTeamOwnershipTransferred);
      socket.off('team.member_removed', onTeamMemberRemoved);
      socket.off('team.join_request_created', onTeamJoinRequestCreated);
      socket.off('team.join_request_updated', onTeamJoinRequestUpdated);
      socket.off('team.membership.accepted', onTeamMembershipAccepted);
      socket.off('team.deleted', onTeamDeleted);
      socket.off('message.created', onMessageCreated);
      socket.off('project.message.created', onProjectMessageCreated);
      socket.off('project.message.updated', onProjectMessageUpdated);
      socket.off('project.message.deleted', onProjectMessageDeleted);
      socket.off('notification.received', onNotificationReceived);
    };
  }, [qc]);
}
