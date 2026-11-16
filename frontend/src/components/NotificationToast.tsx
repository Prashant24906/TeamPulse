'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, UserCheck, Clock, AlertCircle, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMarkNotificationRead } from '@/hooks/useNotifications';
import { connectSocket, getSocket } from '@/lib/socket';
import type { Notification } from '@/types/notification';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

const TOAST_DURATION_MS = 2000;    // Visible for ~2 seconds
const EXIT_ANIMATION_MS = 300;     // Animation duration for smooth exit
const MAX_VISIBLE_TOASTS = 3;      // Max 3 toasts simultaneously

export interface ToastItem {
  id: string;
  notification: Notification;
  title: string;
  subtitle: string;
  preview?: string;
  iconType: 'TEAM_MESSAGE' | 'TASK_ASSIGNED' | 'TASK_DUE_SOON' | 'TASK_OVERDUE' | 'PROJECT_JOIN_REQUEST' | 'TEAM_JOIN_REQUEST';
  isExiting: boolean;
}

interface ToastContextValue {
  showToast: (notification: Notification) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useNotificationToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useNotificationToast must be used within a NotificationToastProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Parser: extract sender, action, and clean message preview
// ---------------------------------------------------------------------------

export function parseToastDetails(notification: Notification) {
  const { type, message } = notification;

  if (type === 'TEAM_MESSAGE') {
    // Expected format: "Alex sent a message in Backend Development: "preview"" or "Alex sent a message in Backend Development."
    const withPreview = message.match(/^(.*?)\s+sent a message in\s+([^:]+):\s*"([\s\S]*)"$/);
    if (withPreview) {
      return {
        title: notification.sender_name || withPreview[1],
        subtitle: `Sent a message in ${withPreview[2].trim()}`,
        preview: `"${withPreview[3]}"`,
        iconType: 'TEAM_MESSAGE' as const,
      };
    }
    const withoutPreview = message.match(/^(.*?)\s+sent a message in\s+(.*?)(\.)?$/);
    if (withoutPreview) {
      return {
        title: notification.sender_name || withoutPreview[1],
        subtitle: `Sent a message in ${withoutPreview[2].trim().replace(/\.$/, '')}`,
        iconType: 'TEAM_MESSAGE' as const,
      };
    }
    return {
      title: notification.sender_name || 'New Message',
      subtitle: message,
      iconType: 'TEAM_MESSAGE' as const,
    };
  }

  if (type === 'TASK_ASSIGNED') {
    // Expected format: "Alex assigned you a task: Implement Authentication API"
    const match = message.match(/^(.*?)\s+assigned you a task:\s*(.*)$/);
    if (match) {
      const assigner = match[1];
      const task = match[2];
      return {
        title: assigner,
        subtitle: `Assigned you a new task: ${task}`,
        iconType: 'TASK_ASSIGNED' as const,
      };
    }
    return {
      title: 'Task Assigned',
      subtitle: message,
      iconType: 'TASK_ASSIGNED' as const,
    };
  }

  if (type === 'PROJECT_JOIN_REQUEST') {
    // Expected format: "Alex requested to join Project TeamPulse."
    const match = message.match(/^(.*?)\s+requested to join\s+(.*?)(\.)?$/);
    if (match) {
      const requester = match[1];
      const target = match[2];
      return {
        title: requester,
        subtitle: `Requested to join ${target}`,
        iconType: 'PROJECT_JOIN_REQUEST' as const,
      };
    }
    return {
      title: 'Project Join Request',
      subtitle: message,
      iconType: 'PROJECT_JOIN_REQUEST' as const,
    };
  }

  if (type === 'TEAM_JOIN_REQUEST') {
    // Expected format: "Alex requested to join Backend Development."
    const match = message.match(/^(.*?)\s+requested to join\s+(.*?)(\.)?$/);
    if (match) {
      const requester = match[1];
      const target = match[2];
      return {
        title: requester,
        subtitle: `Requested to join ${target}`,
        iconType: 'TEAM_JOIN_REQUEST' as const,
      };
    }
    return {
      title: 'Team Join Request',
      subtitle: message,
      iconType: 'TEAM_JOIN_REQUEST' as const,
    };
  }

  if (type === 'TASK_OVERDUE') {
    return {
      title: 'Task Overdue',
      subtitle: message,
      iconType: 'TASK_OVERDUE' as const,
    };
  }

  // Default: TASK_DUE_SOON
  return {
    title: 'Task Due Soon',
    subtitle: message,
    iconType: 'TASK_DUE_SOON' as const,
  };
}

// ---------------------------------------------------------------------------
// Toast Card Component
// ---------------------------------------------------------------------------

function ToastCard({
  toast,
  onDismiss,
  onClick,
}: {
  toast: ToastItem;
  onDismiss: () => void;
  onClick: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger slide/fade in immediately after mount
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const getIcon = () => {
    switch (toast.iconType) {
      case 'TEAM_MESSAGE':
        return (
          <div className="h-8 w-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
            <MessageSquare size={14} />
          </div>
        );
      case 'TASK_ASSIGNED':
        return (
          <div className="h-8 w-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <UserCheck size={14} />
          </div>
        );
      case 'PROJECT_JOIN_REQUEST':
        return (
          <div className="h-8 w-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
            <UserPlus size={14} />
          </div>
        );
      case 'TEAM_JOIN_REQUEST':
        return (
          <div className="h-8 w-8 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 flex-shrink-0">
            <UserPlus size={14} />
          </div>
        );
      case 'TASK_OVERDUE':
        return (
          <div className="h-8 w-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
            <AlertCircle size={14} />
          </div>
        );
      default:
        return (
          <div className="h-8 w-8 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
            <Clock size={14} />
          </div>
        );
    }
  };

  const isLeaving = toast.isExiting;

  return (
    <div
      role="alert"
      id={`toast-${toast.id}`}
      onClick={onClick}
      className={`pointer-events-auto w-full bg-white/95 backdrop-blur-md border border-gray-200/90 rounded-2xl shadow-xl shadow-gray-900/10 p-3.5 flex items-start gap-3 cursor-pointer select-none transition-all duration-300 ease-out transform ${
        mounted && !isLeaving
          ? 'translate-y-0 opacity-100 scale-100'
          : '-translate-y-3 opacity-0 scale-95'
      }`}
    >
      {getIcon()}

      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold text-gray-900 truncate">{toast.title}</p>
        </div>
        <p className="text-[12px] text-gray-600 leading-snug mt-0.5 line-clamp-2">
          {toast.subtitle}
        </p>
        {toast.preview && (
          <p className="text-[11px] text-gray-400 italic mt-1 line-clamp-1 break-all">
            {toast.preview}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1 rounded-lg hover:bg-gray-100 transition flex-shrink-0"
        aria-label="Dismiss toast"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider & Manager
// ---------------------------------------------------------------------------

export function NotificationToastProvider({ children }: { children: React.ReactNode }) {
  const { data: currentUser } = useAuth();
  const router = useRouter();
  const markRead = useMarkNotificationRead();

  const [activeToasts, setActiveToasts] = useState<ToastItem[]>([]);
  const queueRef = useRef<ToastItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Dismiss a toast (triggers exit animation, then removes)
  const dismissToast = useCallback((id: string) => {
    // Clear auto-dismiss timer if running
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }

    // Set exit animation
    setActiveToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );

    // After animation duration, remove and process queue
    const exitTimer = setTimeout(() => {
      setActiveToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(`exit-${id}`);

      // Dequeue next toast if available
      if (queueRef.current.length > 0) {
        const nextToast = queueRef.current.shift()!;
        setActiveToasts((prev) => {
          if (prev.length < MAX_VISIBLE_TOASTS) {
            return [...prev, nextToast];
          }
          queueRef.current.unshift(nextToast);
          return prev;
        });

        // Set 2-second timer for the dequeued toast
        const newTimer = setTimeout(() => {
          dismissToast(nextToast.id);
        }, TOAST_DURATION_MS);
        timersRef.current.set(nextToast.id, newTimer);
      }
    }, EXIT_ANIMATION_MS);

    timersRef.current.set(`exit-${id}`, exitTimer);
  }, []);

  // Show toast entry point
  const showToast = useCallback(
    (notification: Notification) => {
      // 1. Guard: must be authenticated
      if (!currentUser) return;

      // 2. Guard: skip if generated by current user (if user is sender)
      if (notification.sender_id && notification.sender_id === currentUser.id) {
        return;
      }
      if (
        !notification.sender_id &&
        currentUser.name &&
        notification.type === 'TEAM_MESSAGE' &&
        notification.message.startsWith(currentUser.name + ' sent a message')
      ) {
        return;
      }

      // 3. Guard: deduplicate by notification ID
      const notifId = notification.id || `notif_${Date.now()}_${Math.random()}`;
      if (seenIdsRef.current.has(notifId)) {
        return;
      }
      seenIdsRef.current.add(notifId);

      // Parse payload
      const details = parseToastDetails(notification);
      const newToast: ToastItem = {
        id: notifId,
        notification,
        title: details.title,
        subtitle: details.subtitle,
        preview: details.preview,
        iconType: details.iconType,
        isExiting: false,
      };

      // Add to active if < MAX_VISIBLE_TOASTS, otherwise queue
      setActiveToasts((prev) => {
        if (prev.length < MAX_VISIBLE_TOASTS) {
          // Schedule auto-dismiss in 2 seconds
          const timer = setTimeout(() => {
            dismissToast(newToast.id);
          }, TOAST_DURATION_MS);
          timersRef.current.set(newToast.id, timer);

          return [...prev, newToast];
        } else {
          queueRef.current.push(newToast);
          return prev;
        }
      });
    },
    [currentUser, dismissToast]
  );

  // Handle clicking a toast: navigate to destination, mark as read (if persistent), and dismiss immediately
  const handleToastClick = useCallback(
    (toast: ToastItem) => {
      // Only persist read status for non-transient notifications
      if (!toast.notification.transient && !toast.notification.is_read) {
        markRead.mutate(toast.notification.id);
      }
      dismissToast(toast.id);

      const notif = toast.notification;
      if (notif.type === 'PROJECT_JOIN_REQUEST' && notif.project_id) {
        router.push(`/projects/${notif.project_id}?tab=requests`);
      } else if (notif.type === 'TEAM_JOIN_REQUEST' && notif.project_id && notif.team_id) {
        router.push(`/projects/${notif.project_id}/teams/${notif.team_id}?tab=requests`);
      } else if (notif.project_id && notif.team_id) {
        router.push(`/projects/${notif.project_id}/teams/${notif.team_id}?tab=chat`);
      } else if (notif.project_id) {
        router.push(`/projects/${notif.project_id}`);
      }
    },
    [markRead, dismissToast, router]
  );

  // Listen for real-time notification.received on Socket.IO and window custom event
  useEffect(() => {
    if (!currentUser) return;

    connectSocket();
    const socket = getSocket();

    const handleNotificationReceived = (notification: Notification) => {
      if (notification) {
        showToast(notification);
      }
    };

    const handleCustomNotification = (event: Event) => {
      const customEvent = event as CustomEvent<Notification>;
      if (customEvent.detail) {
        showToast(customEvent.detail);
      }
    };

    socket.on('notification.received', handleNotificationReceived);

    if (typeof window !== 'undefined') {
      window.addEventListener('teamflow:notification', handleCustomNotification);
    }

    return () => {
      socket.off('notification.received', handleNotificationReceived);
      if (typeof window !== 'undefined') {
        window.removeEventListener('teamflow:notification', handleCustomNotification);
      }
    };
  }, [currentUser, showToast]);

  // Clean up all timers on unmount
  useEffect(() => {
    const activeTimers = timersRef.current;
    return () => {
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* Toast Notification Container */}
      {activeToasts.length > 0 && (
        <aside
          aria-label="Real-time Notifications"
          className="fixed z-[9999] top-4 inset-x-4 max-w-sm mx-auto sm:top-6 sm:right-6 sm:left-auto sm:mx-0 sm:w-96 pointer-events-none flex flex-col gap-2.5"
        >
          {activeToasts.map((toast) => (
            <ToastCard
              key={toast.id}
              toast={toast}
              onDismiss={() => dismissToast(toast.id)}
              onClick={() => handleToastClick(toast)}
            />
          ))}
        </aside>
      )}
    </ToastContext.Provider>
  );
}
