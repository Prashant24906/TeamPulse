'use client';

import type { TeamMessage } from '@/types/message';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  message: TeamMessage;
}

export function MessageBubble({ message }: Props) {
  const { data: me } = useAuth();
  const isOwn = me?.id === message.sender_id;

  const time = new Date(message.created_at).toLocaleTimeString('en-IN', {
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
      {/* Sender name */}
      <span className="text-xs text-gray-500 px-1">
        {isOwn ? 'You' : message.sender_name}
      </span>

      {/* Bubble */}
      <div className={`flex items-end gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar — only for others */}
        {!isOwn && (
          <div className="h-7 w-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold text-xs flex-shrink-0 mb-1">
            {message.sender_name.charAt(0).toUpperCase()}
          </div>
        )}

        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
            isOwn
              ? 'bg-emerald-600 text-white rounded-br-sm'
              : 'bg-gray-800 border border-gray-700/60 text-gray-200 rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-gray-600 flex-shrink-0 mb-1">{time}</span>
      </div>
    </div>
  );
}
