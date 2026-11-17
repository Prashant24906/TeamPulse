import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '../../../frontend/node_modules/@tanstack/react-query';

// ---------------------------------------------------------------------------
// Project Message interface (mirrors frontend/src/types/message.ts)
// ---------------------------------------------------------------------------
export interface ProjectMessage {
  id: string;
  project_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Exact implementations matching useSocket.ts, useProjectMessages.ts, and ProjectChatPanel.tsx
// ---------------------------------------------------------------------------

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

/** Socket event listener: onProjectMessageCreated from useSocket.ts */
export function onProjectMessageCreated(
  qc: QueryClient,
  payload: {
    id: string;
    projectId: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: string;
  }
) {
  const newMsg: ProjectMessage = {
    id: payload.id,
    project_id: payload.projectId,
    sender_id: payload.senderId,
    sender_name: payload.senderName,
    content: payload.content,
    created_at: payload.createdAt,
    updated_at: payload.createdAt,
  };

  qc.setQueryData<ProjectMessage[]>(['project-messages', payload.projectId], (prev) => {
    if (!prev) {
      // If query hasn't populated yet, initialize cache so real-time event is not lost
      return [newMsg];
    }
    if (prev.some((m) => m.id === payload.id)) {
      return prev;
    }
    const merged = [...prev, newMsg];
    merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return merged;
  });
}

/** Socket event listener: onProjectMessageUpdated from useSocket.ts */
export function onProjectMessageUpdated(
  qc: QueryClient,
  payload: { id: string; projectId: string; content: string; updatedAt: string }
) {
  qc.setQueryData<ProjectMessage[]>(['project-messages', payload.projectId], (prev = []) =>
    prev.map((m) =>
      m.id === payload.id ? { ...m, content: payload.content, updated_at: payload.updatedAt } : m
    )
  );
}

/** Socket event listener: onProjectMessageDeleted from useSocket.ts */
export function onProjectMessageDeleted(
  qc: QueryClient,
  payload: { id: string; projectId: string }
) {
  qc.setQueryData<ProjectMessage[]>(['project-messages', payload.projectId], (prev = []) =>
    prev.filter((m) => m.id !== payload.id)
  );
}

/** REST mutation onSuccess: useSendProjectMessage from useProjectMessages.ts */
export function onSendMessageSuccess(
  qc: QueryClient,
  projectId: string,
  newMsg: ProjectMessage
) {
  qc.setQueryData<ProjectMessage[]>(['project-messages', projectId], (prev = []) => {
    if (prev.some((m) => m.id === newMsg.id)) return prev;
    const merged = [...prev, newMsg];
    merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return merged;
  });
}

/** Pagination: handleLoadMore from ProjectChatPanel.tsx */
export function onLoadMorePrepend(
  qc: QueryClient,
  projectId: string,
  olderMessages: ProjectMessage[]
) {
  qc.setQueryData<ProjectMessage[]>(['project-messages', projectId], (prev = []) => {
    const map = new Map<string, ProjectMessage>();
    olderMessages.forEach((m) => map.set(m.id, m));
    prev.forEach((m) => map.set(m.id, m));
    const merged = Array.from(map.values());
    merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return merged;
  });
}

describe('Project Chat Real-Time Cache Synchronization', () => {
  let qc: QueryClient;
  const projectA = 'proj-aaa-111';
  const projectB = 'proj-bbb-222';
  const user1 = 'user-111';
  const user2 = 'user-222';

  beforeEach(() => {
    qc = createTestQueryClient();
  });

  it('1. Receiving a new project message while Project Chat is open updates cache immediately', () => {
    const initial: ProjectMessage[] = [
      {
        id: 'msg-1',
        project_id: projectA,
        sender_id: user1,
        sender_name: 'Alice',
        content: 'Hello project',
        created_at: '2026-11-17T10:00:00.000Z',
        updated_at: '2026-11-17T10:00:00.000Z',
      },
    ];
    qc.setQueryData(['project-messages', projectA], initial);

    onProjectMessageCreated(qc, {
      id: 'msg-2',
      projectId: projectA,
      senderId: user2,
      senderName: 'Bob',
      content: 'Hey Alice!',
      createdAt: '2026-11-17T10:01:00.000Z',
    });

    const cached = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cached).toHaveLength(2);
    expect(cached?.[1].id).toBe('msg-2');
    expect(cached?.[1].content).toBe('Hey Alice!');
    expect(cached?.[1].sender_name).toBe('Bob');
  });

  it('2. Receiving multiple messages rapidly does not drop or overwrite messages', () => {
    qc.setQueryData(['project-messages', projectA], []);

    for (let i = 1; i <= 5; i++) {
      onProjectMessageCreated(qc, {
        id: `msg-${i}`,
        projectId: projectA,
        senderId: user2,
        senderName: 'Bob',
        content: `Rapid message ${i}`,
        createdAt: `2026-11-17T10:0${i}:00.000Z`,
      });
    }

    const cached = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cached).toHaveLength(5);
    expect(cached?.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5']);
  });

  it('3. Receiving a message from another project member while query is uninitialized preserves message', () => {
    expect(qc.getQueryData(['project-messages', projectA])).toBeUndefined();

    onProjectMessageCreated(qc, {
      id: 'msg-remote-1',
      projectId: projectA,
      senderId: user2,
      senderName: 'Bob',
      content: 'Message during load',
      createdAt: '2026-11-17T10:05:00.000Z',
    });

    const cached = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cached).toBeDefined();
    expect(cached).toHaveLength(1);
    expect(cached?.[0].id).toBe('msg-remote-1');
  });

  it('4. Sending a message and receiving its corresponding socket event prevents duplicates', () => {
    qc.setQueryData(['project-messages', projectA], []);

    const sentMessage: ProjectMessage = {
      id: 'msg-sender-1',
      project_id: projectA,
      sender_id: user1,
      sender_name: 'Alice',
      content: 'I sent this',
      created_at: '2026-11-17T10:10:00.000Z',
      updated_at: '2026-11-17T10:10:00.000Z',
    };

    // Case 1: Mutation onSuccess resolves first
    onSendMessageSuccess(qc, projectA, sentMessage);
    expect(qc.getQueryData<ProjectMessage[]>(['project-messages', projectA])).toHaveLength(1);

    // Then WebSocket event arrives for the same message
    onProjectMessageCreated(qc, {
      id: sentMessage.id,
      projectId: projectA,
      senderId: sentMessage.sender_id,
      senderName: sentMessage.sender_name,
      content: sentMessage.content,
      createdAt: sentMessage.created_at,
    });

    const cachedA = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cachedA).toHaveLength(1);
    expect(cachedA?.[0].id).toBe('msg-sender-1');

    // Case 2: WS event arrives before mutation onSuccess
    const sentMessageB: ProjectMessage = {
      id: 'msg-sender-2',
      project_id: projectA,
      sender_id: user1,
      sender_name: 'Alice',
      content: 'Another message',
      created_at: '2026-11-17T10:12:00.000Z',
      updated_at: '2026-11-17T10:12:00.000Z',
    };

    onProjectMessageCreated(qc, {
      id: sentMessageB.id,
      projectId: projectA,
      senderId: sentMessageB.sender_id,
      senderName: sentMessageB.sender_name,
      content: sentMessageB.content,
      createdAt: sentMessageB.created_at,
    });

    onSendMessageSuccess(qc, projectA, sentMessageB);

    const cachedB = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cachedB).toHaveLength(2);
    expect(cachedB?.map((m) => m.id)).toEqual(['msg-sender-1', 'msg-sender-2']);
  });

  it('5. Duplicate socket events are ignored', () => {
    qc.setQueryData(['project-messages', projectA], []);

    const payload = {
      id: 'msg-dup-1',
      projectId: projectA,
      senderId: user2,
      senderName: 'Bob',
      content: 'Testing duplicates',
      createdAt: '2026-11-17T10:15:00.000Z',
    };

    onProjectMessageCreated(qc, payload);
    onProjectMessageCreated(qc, payload);
    onProjectMessageCreated(qc, payload);

    const cached = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cached).toHaveLength(1);
  });

  it("6. Ensuring messages are not inserted into another project's cache", () => {
    qc.setQueryData(['project-messages', projectA], []);
    qc.setQueryData(['project-messages', projectB], []);

    onProjectMessageCreated(qc, {
      id: 'msg-proj-a',
      projectId: projectA,
      senderId: user1,
      senderName: 'Alice',
      content: 'Project A only',
      createdAt: '2026-11-17T10:20:00.000Z',
    });

    const cachedA = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    const cachedB = qc.getQueryData<ProjectMessage[]>(['project-messages', projectB]);

    expect(cachedA).toHaveLength(1);
    expect(cachedA?.[0].id).toBe('msg-proj-a');

    expect(cachedB).toHaveLength(0);
  });

  it('7. Preserving pagination and message ordering', () => {
    const initial: ProjectMessage[] = [
      {
        id: 'msg-10',
        project_id: projectA,
        sender_id: user1,
        sender_name: 'Alice',
        content: 'Middle message',
        created_at: '2026-11-17T10:10:00.000Z',
        updated_at: '2026-11-17T10:10:00.000Z',
      },
    ];
    qc.setQueryData(['project-messages', projectA], initial);

    const older: ProjectMessage[] = [
      {
        id: 'msg-01',
        project_id: projectA,
        sender_id: user2,
        sender_name: 'Bob',
        content: 'Oldest message',
        created_at: '2026-11-17T10:00:00.000Z',
        updated_at: '2026-11-17T10:00:00.000Z',
      },
    ];
    onLoadMorePrepend(qc, projectA, older);

    onProjectMessageCreated(qc, {
      id: 'msg-20',
      projectId: projectA,
      senderId: user1,
      senderName: 'Alice',
      content: 'Newest message',
      createdAt: '2026-11-17T10:20:00.000Z',
    });

    const cached = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cached).toHaveLength(3);
    expect(cached?.[0].id).toBe('msg-01');
    expect(cached?.[1].id).toBe('msg-10');
    expect(cached?.[2].id).toBe('msg-20');
  });

  it('8. Editing and deleting messages update cache immediately', () => {
    const initial: ProjectMessage[] = [
      {
        id: 'msg-edit-1',
        project_id: projectA,
        sender_id: user1,
        sender_name: 'Alice',
        content: 'Original content',
        created_at: '2026-11-17T10:00:00.000Z',
        updated_at: '2026-11-17T10:00:00.000Z',
      },
      {
        id: 'msg-del-2',
        project_id: projectA,
        sender_id: user2,
        sender_name: 'Bob',
        content: 'Will be deleted',
        created_at: '2026-11-17T10:01:00.000Z',
        updated_at: '2026-11-17T10:01:00.000Z',
      },
    ];
    qc.setQueryData(['project-messages', projectA], initial);

    // Edit msg-edit-1
    onProjectMessageUpdated(qc, {
      id: 'msg-edit-1',
      projectId: projectA,
      content: 'Updated content',
      updatedAt: '2026-11-17T10:02:00.000Z',
    });

    let cached = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cached?.[0].content).toBe('Updated content');
    expect(cached?.[0].updated_at).toBe('2026-11-17T10:02:00.000Z');

    // Delete msg-del-2
    onProjectMessageDeleted(qc, {
      id: 'msg-del-2',
      projectId: projectA,
    });

    cached = qc.getQueryData<ProjectMessage[]>(['project-messages', projectA]);
    expect(cached).toHaveLength(1);
    expect(cached?.[0].id).toBe('msg-edit-1');
  });
});
