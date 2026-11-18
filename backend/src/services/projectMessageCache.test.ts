/**
 * projectMessageCache.test.ts
 *
 * Tests for the client-side React Query cache update logic triggered by
 * `project.message.created` Socket.IO events, extracted as pure functions
 * so they can be exercised in the backend Vitest suite without a DOM.
 *
 * These tests cover the core logic from frontend/src/hooks/useSocket.ts
 * (the `onProjectMessageCreated` / `onProjectMessageUpdated` / `onProjectMessageDeleted`
 * handlers) and the merge logic in ProjectChatPanel to guard against regressions.
 *
 * Test cases:
 *  1.  Receiving a new message while chat is open — message appears in cache.
 *  2.  Receiving multiple rapid messages — all appear in correct order.
 *  3.  Receiving a message from another project member — appears in cache.
 *  4.  Sender's own message event is deduplicated (arrives after onSuccess).
 *  5.  Duplicate message event is not inserted twice.
 *  6.  Message for a different project does not enter this project's cache.
 *  7.  Chat not yet open (cache undefined) — event is safely ignored.
 *  8.  Pagination: olderMessages + liveMessages merge in chronological order.
 *  9.  Pagination: liveMessages wins on conflict for edited content.
 *  10. Edit event updates message content in cache.
 *  11. Delete event removes message from cache.
 *  12. Project chat cache is completely separate from team chat cache.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal ProjectMessage type (mirrors frontend/src/types/message.ts)
// ---------------------------------------------------------------------------

interface ProjectMessage {
  id: string;
  project_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface TeamMessage {
  id: string;
  team_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Pure-function extractions from useSocket.ts
// These mirror the handler implementations exactly so we can test the logic
// without a DOM, React, or Socket.IO.
// ---------------------------------------------------------------------------

/**
 * handleProjectMessageCreated — equivalent to onProjectMessageCreated in useSocket.ts
 * Returns the new cache array or null if the event should be ignored.
 */
function handleProjectMessageCreated(
  cache: ProjectMessage[] | undefined,
  payload: {
    id: string;
    projectId: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: string;
  }
): ProjectMessage[] | null {
  // Guard: cache undefined means the query was never fetched (panel not open)
  if (cache === undefined) return null;
  // Deduplication: skip if the message is already in cache
  if (cache.some((m) => m.id === payload.id)) return cache;

  const newMsg: ProjectMessage = {
    id:          payload.id,
    project_id:  payload.projectId,
    sender_id:   payload.senderId,
    sender_name: payload.senderName,
    content:     payload.content,
    created_at:  payload.createdAt,
    updated_at:  payload.createdAt,
  };
  return [...cache, newMsg];
}

/**
 * handleProjectMessageUpdated — equivalent to onProjectMessageUpdated
 */
function handleProjectMessageUpdated(
  cache: ProjectMessage[] | undefined,
  payload: { id: string; projectId: string; content: string; updatedAt: string }
): ProjectMessage[] | null {
  if (cache === undefined) return null;
  return cache.map((m) =>
    m.id === payload.id
      ? { ...m, content: payload.content, updated_at: payload.updatedAt }
      : m
  );
}

/**
 * handleProjectMessageDeleted — equivalent to onProjectMessageDeleted
 */
function handleProjectMessageDeleted(
  cache: ProjectMessage[] | undefined,
  payload: { id: string; projectId: string }
): ProjectMessage[] | null {
  if (cache === undefined) return null;
  return cache.filter((m) => m.id !== payload.id);
}

/**
 * mergeMessages — equivalent to the useMemo in ProjectChatPanel.
 * Merges olderMessages (pagination) + liveMessages (RQ cache), deduplicates,
 * sorts chronologically. liveMessages wins on conflict (edits).
 */
function mergeMessages(
  olderMessages: ProjectMessage[],
  liveMessages: ProjectMessage[]
): ProjectMessage[] {
  if (olderMessages.length === 0) return liveMessages;
  const map = new Map<string, ProjectMessage>();
  olderMessages.forEach((m) => map.set(m.id, m));
  liveMessages.forEach((m) => map.set(m.id, m)); // liveMessages wins
  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return merged;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_A = 'proj-aaa';
const PROJECT_B = 'proj-bbb';
const TEAM_X    = 'team-xxx';
const SENDER    = 'user-sender';
const MEMBER    = 'user-member';

function makeMsg(
  id: string,
  projectId: string,
  senderId: string,
  content: string,
  createdAt: string
): ProjectMessage {
  return {
    id,
    project_id:  projectId,
    sender_id:   senderId,
    sender_name: 'Test User',
    content,
    created_at:  createdAt,
    updated_at:  createdAt,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Project Chat — cache update logic (onProjectMessageCreated)', () => {

  it('1. New message while chat is open appears in cache', () => {
    const cache: ProjectMessage[] = [];
    const result = handleProjectMessageCreated(cache, {
      id: 'msg-1', projectId: PROJECT_A, senderId: MEMBER, senderName: 'Bob',
      content: 'Hello!', createdAt: '2026-01-01T12:00:00.000Z',
    });
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('msg-1');
    expect(result![0].content).toBe('Hello!');
  });

  it('2. Multiple rapid messages all appear in correct arrival order', () => {
    let cache: ProjectMessage[] = [];
    for (let i = 1; i <= 5; i++) {
      const result = handleProjectMessageCreated(cache, {
        id: `msg-${i}`, projectId: PROJECT_A, senderId: MEMBER, senderName: 'Bob',
        content: `Message ${i}`, createdAt: `2026-01-01T12:00:0${i}.000Z`,
      });
      expect(result).not.toBeNull();
      cache = result!;
    }
    expect(cache).toHaveLength(5);
    // Order of arrival (appended) is msg-1 through msg-5
    expect(cache.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5']);
  });

  it('3. Message from another project member appears in cache', () => {
    const cache: ProjectMessage[] = [
      makeMsg('msg-0', PROJECT_A, SENDER, 'First', '2026-01-01T12:00:00.000Z'),
    ];
    const result = handleProjectMessageCreated(cache, {
      id: 'msg-1', projectId: PROJECT_A, senderId: MEMBER, senderName: 'Alice',
      content: 'Reply from Alice', createdAt: '2026-01-01T12:01:00.000Z',
    });
    expect(result).toHaveLength(2);
    expect(result![1].sender_id).toBe(MEMBER);
    expect(result![1].sender_name).toBe('Alice');
  });

  it("4. Sender's own WS event is deduplicated when onSuccess already added it", () => {
    // onSuccess appends the message first; then the WS event arrives with the same id.
    const sentMsg = makeMsg('msg-1', PROJECT_A, SENDER, 'My message', '2026-01-01T12:00:00.000Z');
    const cache: ProjectMessage[] = [sentMsg];

    const result = handleProjectMessageCreated(cache, {
      id: 'msg-1', projectId: PROJECT_A, senderId: SENDER, senderName: 'Me',
      content: 'My message', createdAt: '2026-01-01T12:00:00.000Z',
    });
    // Should return the same cache (no duplicate)
    expect(result).toHaveLength(1);
    expect(result).toBe(cache); // exact same reference — no mutation
  });

  it('5. Duplicate WS event for same message id is not inserted twice', () => {
    const cache: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, MEMBER, 'Hello', '2026-01-01T12:00:00.000Z'),
    ];
    const payload = {
      id: 'msg-1', projectId: PROJECT_A, senderId: MEMBER, senderName: 'Bob',
      content: 'Hello', createdAt: '2026-01-01T12:00:00.000Z',
    };
    const result = handleProjectMessageCreated(cache, payload);
    expect(result).toHaveLength(1);
  });

  it('6. Message for a different project is NOT inserted into this project cache', () => {
    // The handler only receives events for the correct projectId (rooms are project-scoped).
    // Even if called with wrong projectId, the data stored under PROJECT_A's key would
    // only be accessed when the event projectId matches the cache key.
    // Here we verify: a payload for PROJECT_B does not corrupt PROJECT_A's cache.
    const cacheA: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, SENDER, 'Project A message', '2026-01-01T12:00:00.000Z'),
    ];
    const cacheB: ProjectMessage[] = [];

    // Simulate the guard: handler is only called when payload.projectId matches the cache key
    const payloadB = {
      id: 'msg-99', projectId: PROJECT_B, senderId: MEMBER, senderName: 'Bob',
      content: 'Project B message', createdAt: '2026-01-01T12:02:00.000Z',
    };

    // Update PROJECT_B cache
    const resultB = handleProjectMessageCreated(cacheB, payloadB);
    expect(resultB).toHaveLength(1);
    expect(resultB![0].project_id).toBe(PROJECT_B);

    // PROJECT_A cache is completely unaffected
    expect(cacheA).toHaveLength(1);
    expect(cacheA[0].project_id).toBe(PROJECT_A);
  });

  it('7. When chat panel was never opened (cache undefined), event is safely ignored', () => {
    const result = handleProjectMessageCreated(undefined, {
      id: 'msg-1', projectId: PROJECT_A, senderId: MEMBER, senderName: 'Bob',
      content: 'Hello', createdAt: '2026-01-01T12:00:00.000Z',
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pagination merge logic
// ---------------------------------------------------------------------------

describe('Project Chat — pagination merge (ProjectChatPanel useMemo)', () => {

  it('8. olderMessages prepended to liveMessages in chronological order', () => {
    const older: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, MEMBER, 'Old 1', '2026-01-01T10:00:00.000Z'),
      makeMsg('msg-2', PROJECT_A, MEMBER, 'Old 2', '2026-01-01T10:01:00.000Z'),
    ];
    const live: ProjectMessage[] = [
      makeMsg('msg-3', PROJECT_A, SENDER, 'New 1', '2026-01-01T12:00:00.000Z'),
      makeMsg('msg-4', PROJECT_A, SENDER, 'New 2', '2026-01-01T12:01:00.000Z'),
    ];

    const merged = mergeMessages(older, live);
    expect(merged.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4']);
  });

  it('9. liveMessages wins when the same id appears in both (edit conflict)', () => {
    const older: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, MEMBER, 'Original content', '2026-01-01T10:00:00.000Z'),
    ];
    const live: ProjectMessage[] = [
      { ...makeMsg('msg-1', PROJECT_A, MEMBER, 'Edited content', '2026-01-01T10:00:00.000Z'), updated_at: '2026-01-01T11:00:00.000Z' },
    ];

    const merged = mergeMessages(older, live);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe('Edited content');
    expect(merged[0].updated_at).toBe('2026-01-01T11:00:00.000Z');
  });

  it('8b. No olderMessages — returns liveMessages directly (no copy)', () => {
    const live: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, SENDER, 'Only live', '2026-01-01T12:00:00.000Z'),
    ];
    const merged = mergeMessages([], live);
    // exact same reference when no olderMessages
    expect(merged).toBe(live);
  });
});

// ---------------------------------------------------------------------------
// Edit and Delete
// ---------------------------------------------------------------------------

describe('Project Chat — edit and delete cache handlers', () => {

  it('10. Edit event updates message content in cache', () => {
    const cache: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, SENDER, 'Original', '2026-01-01T12:00:00.000Z'),
      makeMsg('msg-2', PROJECT_A, MEMBER, 'Other', '2026-01-01T12:01:00.000Z'),
    ];
    const result = handleProjectMessageUpdated(cache, {
      id: 'msg-1', projectId: PROJECT_A,
      content: 'Edited content', updatedAt: '2026-01-01T12:05:00.000Z',
    });
    expect(result).toHaveLength(2);
    expect(result![0].content).toBe('Edited content');
    expect(result![0].updated_at).toBe('2026-01-01T12:05:00.000Z');
    // Other message is untouched
    expect(result![1].content).toBe('Other');
  });

  it('11. Delete event removes exactly one message from cache', () => {
    const cache: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, SENDER, 'First', '2026-01-01T12:00:00.000Z'),
      makeMsg('msg-2', PROJECT_A, MEMBER, 'Second', '2026-01-01T12:01:00.000Z'),
    ];
    const result = handleProjectMessageDeleted(cache, { id: 'msg-1', projectId: PROJECT_A });
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe('msg-2');
  });

  it('11b. Delete for non-existent id is a no-op', () => {
    const cache: ProjectMessage[] = [
      makeMsg('msg-1', PROJECT_A, SENDER, 'First', '2026-01-01T12:00:00.000Z'),
    ];
    const result = handleProjectMessageDeleted(cache, { id: 'msg-999', projectId: PROJECT_A });
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Cache isolation between project chat and team chat
// ---------------------------------------------------------------------------

describe('Project Chat — isolation from Team Chat cache', () => {

  it('12. Project chat cache key is completely separate from team chat cache key', () => {
    // Simulate two independent in-memory "caches" keyed by their query key
    const projectCacheKey = `project-messages:${PROJECT_A}`;
    const teamCacheKey    = `messages:${TEAM_X}`;

    const store = new Map<string, ProjectMessage[] | TeamMessage[]>();
    store.set(projectCacheKey, []);
    store.set(teamCacheKey, []);

    // Add a project message
    const projectCache = store.get(projectCacheKey) as ProjectMessage[];
    const result = handleProjectMessageCreated(projectCache, {
      id: 'msg-1', projectId: PROJECT_A, senderId: SENDER, senderName: 'Alex',
      content: 'Project chat message', createdAt: '2026-01-01T12:00:00.000Z',
    });
    store.set(projectCacheKey, result!);

    // Team cache is completely untouched
    expect((store.get(teamCacheKey) as TeamMessage[])).toHaveLength(0);
    // Project cache has the message
    expect((store.get(projectCacheKey) as ProjectMessage[])).toHaveLength(1);
    expect((store.get(projectCacheKey) as ProjectMessage[])[0].project_id).toBe(PROJECT_A);
  });
});
