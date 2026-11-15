'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Clock, AlertCircle, Loader2, X } from 'lucide-react';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/useNotifications';
import type { Notification } from '@/types/notification';

// ---------------------------------------------------------------------------
// NotificationBell — bell icon + badge + dropdown popover
//
// Supports `align="left" | "right"` for desktop positioning:
//   - "left"  (default for sidebar): dropdown extends rightwards (prevents off-screen left overflow)
//   - "right" (default for topbars): dropdown extends leftwards
// On mobile, the dropdown is viewport-anchored (`fixed`) to prevent any off-screen clipping.
// ---------------------------------------------------------------------------

interface NotificationBellProps {
  align?: 'left' | 'right';
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: string) => void;
}) {
  const isOverdue = notification.type === 'TASK_OVERDUE';
  return (
    <button
      type="button"
      onClick={() => !notification.is_read && onRead(notification.id)}
      className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors hover:bg-gray-50 ${
        notification.is_read ? 'opacity-60' : ''
      }`}
    >
      <span className={`mt-0.5 flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-amber-500'}`}>
        {isOverdue ? <AlertCircle size={15} /> : <Clock size={15} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${notification.is_read ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
          {notification.message}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(notification.created_at)}</p>
      </div>
      {!notification.is_read && (
        <span className="mt-1.5 flex-shrink-0 h-2 w-2 rounded-full bg-emerald-500" />
      )}
    </button>
  );
}

export default function NotificationBell({ align = 'left' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: count = 0 }          = useUnreadNotificationCount();
  const { data: notifications = [], isLoading, isError } = useNotifications();
  const markRead    = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Close dropdown on outside click or touch
  useEffect(() => {
    function handleClick(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('touchstart', handleClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [open]);

  const alignmentClasses =
    align === 'left'
      ? 'md:left-0 md:right-auto'
      : 'md:right-0 md:left-auto';

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
      >
        <Bell size={19} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-150"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Dropdown Modal */}
      {open && (
        <div
          className={`
            fixed left-4 right-4 top-16 max-w-sm mx-auto
            sm:left-auto sm:right-4 sm:w-80 sm:max-w-none
            md:absolute md:top-full md:mt-2 md:w-80
            ${alignmentClasses}
            bg-white rounded-xl shadow-2xl md:shadow-xl border border-gray-200/80 z-50 overflow-hidden
            animate-in fade-in zoom-in-95 duration-150
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/70">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              {count > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full">
                  {count} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50 transition-colors"
                >
                  <CheckCheck size={13} />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[calc(100vh-9rem)] sm:max-h-80 overflow-y-auto divide-y divide-gray-50">
            {isLoading && (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="animate-spin text-gray-400" size={20} />
              </div>
            )}
            {isError && (
              <p className="text-xs text-red-500 text-center py-6 px-4">
                Failed to load notifications.
              </p>
            )}
            {!isLoading && !isError && notifications.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">
                No notifications yet.
              </p>
            )}
            {!isLoading && !isError && notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={(id) => markRead.mutate(id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
