'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Notification } from '@/types/notification';

// ---------------------------------------------------------------------------
// useNotifications — TanStack React Query hooks for the notification API
// ---------------------------------------------------------------------------

/** Fetch paginated notifications for the authenticated user */
export function useNotifications(limit = 20, offset = 0) {
  return useQuery<Notification[]>({
    queryKey: ['notifications', limit, offset],
    queryFn: async () => {
      const res = await api.get<{ status: string; data: { notifications: Notification[] } }>(
        `/notifications?limit=${limit}&offset=${offset}`
      );
      return res.data.data.notifications;
    },
    staleTime: 30_000,
  });
}

/** Fetch the unread notification count — polled every 60 s as a fallback */
export function useUnreadNotificationCount() {
  return useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await api.get<{ status: string; data: { count: number } }>(
        '/notifications/unread-count'
      );
      return res.data.data.count;
    },
    staleTime: 10_000,
    refetchInterval: 60_000, // poll every 60 s as a fallback for missed WS events
  });
}

/** Mark a single notification as read */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await api.patch<{ status: string; data: { notification: Notification } }>(
        `/notifications/${notificationId}/read`
      );
      return res.data.data.notification;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Mark all notifications as read */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.patch<{ status: string; data: { updated: number } }>(
        '/notifications/read-all'
      );
      return res.data.data.updated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
