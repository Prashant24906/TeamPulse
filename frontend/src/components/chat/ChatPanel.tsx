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
      <div className="flex flex-col items-center justify-center gap-3 h-64 text-gray-500">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm">Unable to load messages.</p>
        <button onClick={() => refetch()} className="text-sm text-emerald-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden"
         style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-800 flex-shrink-0">
        <h3 className="text-sm font-semibold text-white">Team Chat</h3>
        <p className="text-xs text-gray-500 mt-0.5">Messages are visible to all team members</p>
      </div>

      {/* Messages */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Input */}
      <MessageInput teamId={teamId} />
    </div>
  );
}
