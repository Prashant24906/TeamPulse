'use client';

import { AlertCircle } from 'lucide-react';
import { useMessages } from '@/hooks/useMessages';
import { MessageList }  from './MessageList';
import { MessageInput } from './MessageInput';

interface Props {
  teamId: string;
}

export function ChatPanel({ teamId }: Props) {
  const { data: messages = [], isLoading, isError, refetch } = useMessages(teamId);

  if (isError) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center gap-3 text-gray-500 bg-gray-900">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm">Unable to load messages.</p>
        <button onClick={() => refetch()} className="text-sm text-emerald-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full w-full min-h-0 flex flex-col bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 md:px-8 py-3 border-b border-gray-800 flex-shrink-0 bg-gray-900 flex items-center justify-between">
        <div>
          <h3 className="text-xs sm:text-sm font-semibold text-white">Team Chat</h3>
          <p className="text-[11px] text-gray-400">Visible to team members</p>
        </div>
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live connection" />
      </div>

      {/* Messages */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Input */}
      <MessageInput teamId={teamId} />
    </div>
  );
}
