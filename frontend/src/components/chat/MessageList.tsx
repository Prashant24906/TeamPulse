'use client';

import { useEffect, useRef } from 'react';
import type { TeamMessage } from '@/types/message';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: TeamMessage[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`h-10 bg-gray-800 rounded-2xl animate-pulse ${i % 2 === 0 ? 'w-56 self-start' : 'w-40 self-end'}`} />
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-gray-500 text-sm">No messages yet.</p>
          <p className="text-gray-600 text-xs mt-1">Be the first to say something!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
