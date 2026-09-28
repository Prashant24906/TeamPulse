'use client';

import { useState, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useSendMessage } from '@/hooks/useMessages';

interface Props {
  teamId: string;
}

export function MessageInput({ teamId }: Props) {
  const [text, setText] = useState('');
  const sendMessage = useSendMessage(teamId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && !sendMessage.isPending;

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      await sendMessage.mutateAsync(content);
    } catch {
      // Restore text so user doesn't lose their message
      setText(content);
    }
  }, [text, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="px-4 py-3 border-t border-gray-800 bg-gray-950/60">
      <div className="flex items-end gap-3">
        <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition">
          <textarea
            ref={textareaRef}
            id="chat-input"
            rows={1}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message the team… (Enter to send)"
            maxLength={2000}
            className="w-full bg-transparent text-white placeholder-gray-500 text-sm resize-none outline-none leading-relaxed"
            style={{ height: 'auto', minHeight: '24px' }}
          />
        </div>
        <button
          id="chat-send-btn"
          onClick={handleSend}
          disabled={!canSend}
          className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 transition"
        >
          {sendMessage.isPending
            ? <Loader2 size={16} className="animate-spin text-white" />
            : <Send size={16} className="text-white" />
          }
        </button>
      </div>
      {text.length > 1800 && (
        <p className="text-xs text-amber-500 mt-1 pl-1">{2000 - text.length} characters remaining</p>
      )}
    </div>
  );
}
