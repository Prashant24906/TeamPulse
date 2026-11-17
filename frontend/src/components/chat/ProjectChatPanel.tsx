'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Send, Loader2, Pencil, Trash2, Check, X, Users } from 'lucide-react';
import {
  useProjectMessages,
  useSendProjectMessage,
  useUpdateProjectMessage,
  useDeleteProjectMessage,
} from '@/hooks/useProjectMessages';
import { useAuth } from '@/hooks/useAuth';
import { useMarkConversationRead } from '@/hooks/useNotifications';
import api from '@/lib/api';
import type { ProjectMessage } from '@/types/message';

interface Props {
  projectId: string;
  projectName?: string;
  memberCount?: number;
}

export function ProjectChatPanel({ projectId, projectName, memberCount }: Props) {
  const qc = useQueryClient();
  const { data: messages = [], isLoading, isError, refetch } = useProjectMessages(projectId);
  const sendMessage = useSendProjectMessage(projectId);
  const updateMessage = useUpdateProjectMessage(projectId);
  const deleteMessage = useDeleteProjectMessage(projectId);
  const markConversationRead = useMarkConversationRead();
  const { data: me } = useAuth();

  useEffect(() => {
    if (projectId) {
      markConversationRead.mutate({ conversationType: 'PROJECT', conversationId: projectId });
    }
  }, [projectId]);

  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Composer state
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Scroll to bottom when new messages arrive if user was at bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    shouldAutoScrollRef.current = isNearBottom;
  };

  // Load older messages (pagination)
  const handleLoadMore = async () => {
    if (messages.length === 0 || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    const oldestId = messages[0].id;
    const container = scrollContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;

    try {
      const res = await api.get<{ status: string; data: { messages: ProjectMessage[] } }>(
        `/projects/${projectId}/messages`,
        { params: { limit: 50, before: oldestId } }
      );
      const older = res.data.data.messages;

      if (older.length < 50) {
        setHasMore(false);
      }

      if (older.length > 0) {
        // Prepend older messages directly into React Query cache (single source of truth)
        qc.setQueryData<ProjectMessage[]>(['project-messages', projectId], (prev = []) => {
          const map = new Map<string, ProjectMessage>();
          older.forEach((m) => map.set(m.id, m));
          prev.forEach((m) => map.set(m.id, m));
          const merged = Array.from(map.values());
          merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          return merged;
        });

        requestAnimationFrame(() => {
          if (container) {
            const heightDiff = container.scrollHeight - previousScrollHeight;
            container.scrollTop = previousScrollTop + heightDiff;
          }
        });
      }
    } catch (err) {
      console.error('[project-chat] Failed to load older messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const canSend = text.trim().length > 0 && !sendMessage.isPending;

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content) return;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    shouldAutoScrollRef.current = true;

    try {
      await sendMessage.mutateAsync(content);
    } catch {
      // Restore input on failure
      setText(content);
    }
  }, [text, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleStartEdit = (msg: ProjectMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const handleSaveEdit = async (msgId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await updateMessage.mutateAsync({ messageId: msgId, content: trimmed });
      setEditingId(null);
    } catch (err) {
      console.error('[project-chat] Failed to update message:', err);
    }
  };

  const handleDelete = async (msgId: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      await deleteMessage.mutateAsync(msgId);
    } catch (err) {
      console.error('[project-chat] Failed to delete message:', err);
    }
  };

  if (isError) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center gap-3 text-gray-500 bg-gray-900">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-sm">Unable to load project messages.</p>
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
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-semibold text-white">
              {projectName ? `${projectName} — Project Chat` : 'Project Chat'}
            </h3>
          </div>
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
            <span>Visible to all project members</span>
            {memberCount !== undefined && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Users size={11} /> {memberCount} member{memberCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-emerald-400 font-medium hidden sm:inline">Live</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live connection" />
        </div>
      </div>

      {/* Message List */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 md:px-8 py-4 space-y-4"
      >
        {/* Load older button */}
        {hasMore && messages.length >= 50 && (
          <div className="flex justify-center pb-2">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50 py-1.5 px-3 rounded-lg bg-gray-800/60 border border-gray-700/60 transition"
            >
              {isLoadingMore ? 'Loading older messages…' : 'Load older messages'}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`h-10 bg-gray-800 rounded-2xl animate-pulse ${
                    i % 2 === 0 ? 'w-56 self-start' : 'w-40 self-end'
                  }`}
                />
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-gray-400 text-sm font-medium">No project messages yet.</p>
              <p className="text-gray-600 text-xs mt-1">
                Start the conversation with everyone in {projectName || 'this project'}!
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = me?.id === msg.sender_id;
            const isEditing = editingId === msg.id;
            const time = new Date(msg.created_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 group ${isOwn ? 'items-end' : 'items-start'}`}
              >
                {/* Sender info */}
                <div className="flex items-center gap-1.5 px-1">
                  <span className="text-[11px] text-gray-400 font-medium">
                    {isOwn ? 'You' : msg.sender_name}
                  </span>
                </div>

                {/* Bubble & actions container */}
                <div
                  className={`flex items-end gap-1.5 sm:gap-2 max-w-[88%] sm:max-w-[75%] ${
                    isOwn ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Avatar for other members */}
                  {!isOwn && (
                    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs flex-shrink-0 mb-1">
                      {msg.sender_name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words whitespace-pre-wrap relative ${
                      isOwn
                        ? 'bg-emerald-600 text-white rounded-br-sm shadow-sm'
                        : 'bg-gray-800 border border-gray-700/60 text-gray-200 rounded-bl-sm'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-gray-900 text-white text-xs sm:text-sm rounded-lg p-2 border border-gray-600 focus:outline-none focus:border-emerald-400 resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded hover:bg-gray-700/60 text-gray-300"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                          <button
                            onClick={() => handleSaveEdit(msg.id)}
                            className="p-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                            title="Save"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.content}
                        {msg.updated_at !== msg.created_at && (
                          <span className="text-[10px] text-gray-300/70 ml-1.5 italic">(edited)</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions for own messages */}
                  {isOwn && !isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                      <button
                        onClick={() => handleStartEdit(msg)}
                        className="text-gray-500 hover:text-gray-300 p-1 rounded"
                        title="Edit message"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="text-gray-500 hover:text-red-400 p-1 rounded"
                        title="Delete message"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}

                  {/* Timestamp */}
                  <span className="text-[10px] text-gray-500 flex-shrink-0 mb-1">{time}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Message Composer */}
      <div className="px-4 sm:px-6 md:px-8 py-3.5 border-t border-gray-800 bg-gray-950/80 flex-shrink-0">
        <div className="flex items-end gap-3">
          <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition">
            <textarea
              ref={textareaRef}
              id="project-chat-input"
              rows={1}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message the whole project… (Enter to send, Shift+Enter for newline)"
              maxLength={2000}
              className="w-full bg-transparent text-white placeholder-gray-500 text-sm resize-none outline-none leading-relaxed"
              style={{ height: 'auto', minHeight: '24px' }}
            />
          </div>
          <button
            id="project-chat-send-btn"
            onClick={handleSend}
            disabled={!canSend}
            className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 transition shadow-sm"
          >
            {sendMessage.isPending ? (
              <Loader2 size={16} className="animate-spin text-white" />
            ) : (
              <Send size={16} className="text-white" />
            )}
          </button>
        </div>
        {text.length > 1800 && (
          <p className="text-xs text-amber-500 mt-1 pl-1">{2000 - text.length} characters remaining</p>
        )}
      </div>
    </div>
  );
}
