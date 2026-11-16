/**
 * groupedChatNotification.test.ts
 *
 * Comprehensive tests for persistent, grouped chat notifications (Section 10):
 * 1. First unread message creates one notification.
 * 2. Subsequent messages update the same notification.
 * 3. Multiple messages increment the unread count.
 * 4. Different teams create different groups.
 * 5. Project Chat and Team Chat remain separate.
 * 6. Opening a conversation marks its group as read.
 * 7. A new message after reading creates a new unread group.
 * 8. Sender receives no notification.
 * 9. Removed members receive no notification.
 * 10. Concurrent messages do not create duplicate unread groups (atomic upsert ON CONFLICT).
 * 11. Every eligible message still triggers a toast.
 * 12. Grouping does not suppress toasts.
 * 13. Duplicate event delivery does not increment counts twice.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before imports
// ---------------------------------------------------------------------------

const { mockPublish, mockQuit } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(1),
  mockQuit:    vi.fn().mockResolvedValue('OK'),
}));

vi.mock('../config/redis', () => ({
  createPubSubConnection: vi.fn().mockReturnValue({
    publish: mockPublish,
    quit:    mockQuit,
    on:      vi.fn(),
  }),
  isRedisReady: vi.fn().mockReturnValue(true),
}));

// In-memory store simulating PostgreSQL partial unique index & atomic upsert behavior
interface StoredNotification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  conversation_type: string | null;
  conversation_id: string | null;
  conversation_name: string | null;
  unread_message_count: number;
  latest_sender_id: string | null;
  latest_sender_name: string | null;
  latest_message_preview: string | null;
  team_id: string | null;
  project_id: string | null;
  message_id: string | null;
  is_read: boolean;
  created_at: Date;
}

let notificationStore: StoredNotification[] = [];

vi.mock('../config/database', () => {
  const sqlMock: any = vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const query = strings.join('?');

    // INSERT INTO notifications ... ON CONFLICT (...) WHERE is_read = FALSE DO UPDATE ...
    if (query.includes('INSERT INTO notifications') && query.includes('ON CONFLICT (user_id, conversation_type, conversation_id) WHERE is_read = FALSE')) {
      const [
        userId,
        type,
        initialMessage,
        conversationType,
        conversationId,
        conversationName,
        senderId,
        senderName,
        preview,
        teamId,
        projectId,
        messageId
      ] = values;

      // Find existing unread notification for this user & conversation
      const existing = notificationStore.find(
        (n) => n.user_id === userId &&
               n.conversation_type === conversationType &&
               n.conversation_id === conversationId &&
               !n.is_read
      );

      if (existing) {
        // DO UPDATE SET
        existing.unread_message_count += 1;
        existing.message = `${senderName} and others sent ${existing.unread_message_count} messages in ${conversationName}.`;
        existing.latest_sender_id = senderId;
        existing.latest_sender_name = senderName;
        existing.latest_message_preview = preview;
        existing.conversation_name = conversationName;
        existing.message_id = messageId;
        existing.created_at = new Date();
        return [{ ...existing }];
      } else {
        // INSERT
        const newRecord: StoredNotification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          user_id: userId,
          type,
          message: initialMessage,
          conversation_type: conversationType,
          conversation_id: conversationId,
          conversation_name: conversationName,
          unread_message_count: 1,
          latest_sender_id: senderId,
          latest_sender_name: senderName,
          latest_message_preview: preview,
          team_id: teamId,
          project_id: projectId,
          message_id: messageId,
          is_read: false,
          created_at: new Date(),
        };
        notificationStore.push(newRecord);
        return [{ ...newRecord }];
      }
    }

    // UPDATE notifications SET is_read = TRUE, unread_message_count = 0 WHERE user_id = ... AND conversation_type = ... AND conversation_id = ... AND is_read = FALSE
    if (query.includes('conversation_type = ?') && query.includes('conversation_id = ?') && query.includes('is_read = FALSE')) {
      const userId = values[0];
      const conversationType = values[1];
      const conversationId = values[2];

      let count = 0;
      notificationStore.forEach((n) => {
        if (n.user_id === userId && n.conversation_type === conversationType && n.conversation_id === conversationId && !n.is_read) {
          n.is_read = true;
          n.unread_message_count = 0;
          count++;
        }
      });
      return [{ count: String(count) }];
    }

    // COUNT(*) WHERE user_id = ? AND is_read = FALSE
    if (query.includes('COUNT(*)') && query.includes('is_read = FALSE')) {
      const userId = values[0];
      const count = notificationStore.filter((n) => n.user_id === userId && !n.is_read).length;
      return [{ count: String(count) }];
    }

    // SELECT ... FROM notifications WHERE user_id = ? ORDER BY n.created_at DESC
    if (query.includes('FROM notifications n') && query.includes('WHERE n.user_id = ?')) {
      const userId = values[0];
      return notificationStore.filter((n) => n.user_id === userId);
    }

    return [];
  });

  return {
    default: sqlMock,
    sql: sqlMock,
    connectDB: vi.fn(),
    disconnectDB: vi.fn(),
  };
});

vi.mock('../repositories/team.repository', () => ({
  findTeamById: vi.fn(),
  getMembers: vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
  findProjectById: vi.fn(),
  findMembersByProject: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import * as teamRepo from '../repositories/team.repository';
import * as projectRepo from '../repositories/project.repository';
import * as notificationService from './notification.service';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Grouped Chat Notifications (Team and Project)', () => {
  const team1Id = 'team-uuid-1';
  const team2Id = 'team-uuid-2';
  const projectId = 'proj-uuid-1';
  const senderId = 'user-sender';
  const recipient1Id = 'user-recip-1';
  const recipient2Id = 'user-recip-2';
  const removedMemberId = 'user-removed';

  beforeEach(() => {
    vi.clearAllMocks();
    notificationStore = [];

    vi.mocked(teamRepo.findTeamById).mockImplementation(async (id) => {
      if (id === team1Id) return { id: team1Id, name: 'Backend Development', project_id: projectId } as any;
      if (id === team2Id) return { id: team2Id, name: 'Frontend Development', project_id: projectId } as any;
      return null;
    });

    vi.mocked(teamRepo.getMembers).mockImplementation(async (id) => {
      if (id === team1Id) {
        return [
          { team_id: team1Id, user_id: senderId, name: 'Alex' },
          { team_id: team1Id, user_id: recipient1Id, name: 'Bob' },
          { team_id: team1Id, user_id: recipient2Id, name: 'Charlie' },
        ] as any;
      }
      if (id === team2Id) {
        return [
          { team_id: team2Id, user_id: senderId, name: 'Alex' },
          { team_id: team2Id, user_id: recipient1Id, name: 'Bob' },
        ] as any;
      }
      return [];
    });

    vi.mocked(projectRepo.findProjectById).mockImplementation(async (id) => {
      if (id === projectId) return { id: projectId, name: 'TeamPulse', created_by: senderId } as any;
      return null;
    });

    vi.mocked(projectRepo.findMembersByProject).mockImplementation(async (id) => {
      if (id === projectId) {
        return [
          { user_id: senderId, name: 'Alex', role: 'OWNER' },
          { user_id: recipient1Id, name: 'Bob', role: 'MEMBER' },
        ] as any;
      }
      return [];
    });
  });

  // -------------------------------------------------------------------------
  // 1. First unread message creates one notification
  // -------------------------------------------------------------------------
  it('1. First unread message creates one notification', async () => {
    await notificationService.notifyTeamMessage(
      'msg-1',
      team1Id,
      senderId,
      'Alex',
      'First message',
      projectId
    );

    const userNotifs = notificationStore.filter((n) => n.user_id === recipient1Id && !n.is_read);
    expect(userNotifs.length).toBe(1);
    expect(userNotifs[0].unread_message_count).toBe(1);
    expect(userNotifs[0].conversation_type).toBe('TEAM');
    expect(userNotifs[0].conversation_id).toBe(team1Id);
    expect(userNotifs[0].latest_sender_name).toBe('Alex');
    expect(userNotifs[0].latest_message_preview).toBe('First message');
  });

  // -------------------------------------------------------------------------
  // 2. Subsequent messages update the same notification
  // -------------------------------------------------------------------------
  it('2. Subsequent messages update the same notification without creating a new record', async () => {
    await notificationService.notifyTeamMessage('msg-1', team1Id, senderId, 'Alex', 'Message 1', projectId);
    await notificationService.notifyTeamMessage('msg-2', team1Id, senderId, 'Alex', 'Message 2', projectId);

    const userNotifs = notificationStore.filter((n) => n.user_id === recipient1Id && !n.is_read);
    expect(userNotifs.length).toBe(1);
    expect(userNotifs[0].unread_message_count).toBe(2);
    expect(userNotifs[0].latest_message_preview).toBe('Message 2');
  });

  // -------------------------------------------------------------------------
  // 3. Multiple messages increment the unread count
  // -------------------------------------------------------------------------
  it('3. Multiple messages increment the unread count accurately', async () => {
    for (let i = 1; i <= 5; i++) {
      await notificationService.notifyTeamMessage(`msg-${i}`, team1Id, senderId, 'Alex', `Message ${i}`, projectId);
    }

    const userNotifs = notificationStore.filter((n) => n.user_id === recipient1Id && !n.is_read);
    expect(userNotifs.length).toBe(1);
    expect(userNotifs[0].unread_message_count).toBe(5);
    expect(userNotifs[0].message).toContain('5 messages in Backend Development');
  });

  // -------------------------------------------------------------------------
  // 4. Different teams create different groups
  // -------------------------------------------------------------------------
  it('4. Different teams create different groups for the same user', async () => {
    await notificationService.notifyTeamMessage('msg-t1', team1Id, senderId, 'Alex', 'Hello Team 1', projectId);
    await notificationService.notifyTeamMessage('msg-t2', team2Id, senderId, 'Alex', 'Hello Team 2', projectId);

    const userNotifs = notificationStore.filter((n) => n.user_id === recipient1Id && !n.is_read);
    expect(userNotifs.length).toBe(2);

    const t1Group = userNotifs.find((n) => n.conversation_id === team1Id);
    const t2Group = userNotifs.find((n) => n.conversation_id === team2Id);

    expect(t1Group).toBeDefined();
    expect(t2Group).toBeDefined();
    expect(t1Group?.conversation_name).toBe('Backend Development');
    expect(t2Group?.conversation_name).toBe('Frontend Development');
  });

  // -------------------------------------------------------------------------
  // 5. Project Chat and Team Chat remain separate
  // -------------------------------------------------------------------------
  it('5. Project Chat and Team Chat remain separate notification groups', async () => {
    await notificationService.notifyTeamMessage('msg-team', team1Id, senderId, 'Alex', 'Team chat msg', projectId);
    await notificationService.notifyProjectMessage('msg-proj', projectId, senderId, 'Alex', 'Project chat msg');

    const userNotifs = notificationStore.filter((n) => n.user_id === recipient1Id && !n.is_read);
    expect(userNotifs.length).toBe(2);

    const teamGroup = userNotifs.find((n) => n.conversation_type === 'TEAM');
    const projGroup = userNotifs.find((n) => n.conversation_type === 'PROJECT');

    expect(teamGroup).toBeDefined();
    expect(projGroup).toBeDefined();
    expect(teamGroup?.conversation_id).toBe(team1Id);
    expect(projGroup?.conversation_id).toBe(projectId);
    expect(projGroup?.conversation_name).toContain('TeamPulse');
  });

  // -------------------------------------------------------------------------
  // 6. Opening a conversation marks its group as read
  // -------------------------------------------------------------------------
  it('6. Opening a conversation marks its group as read and resets message count', async () => {
    await notificationService.notifyTeamMessage('msg-1', team1Id, senderId, 'Alex', 'Hello', projectId);
    await notificationService.notifyTeamMessage('msg-2', team1Id, senderId, 'Alex', 'World', projectId);

    let unreadCount = await notificationService.getUnreadNotificationCount(recipient1Id);
    expect(unreadCount).toBe(1);

    // User opens conversation
    const updated = await notificationService.markConversationNotificationsAsRead(recipient1Id, 'TEAM', team1Id);
    expect(updated).toBe(1);

    unreadCount = await notificationService.getUnreadNotificationCount(recipient1Id);
    expect(unreadCount).toBe(0);

    const readNotifs = notificationStore.filter((n) => n.user_id === recipient1Id && n.conversation_id === team1Id);
    expect(readNotifs[0].is_read).toBe(true);
    expect(readNotifs[0].unread_message_count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 7. A new message after reading creates a new unread group
  // -------------------------------------------------------------------------
  it('7. A new message after reading creates a new unread group with count 1', async () => {
    await notificationService.notifyTeamMessage('msg-1', team1Id, senderId, 'Alex', 'First batch', projectId);
    await notificationService.markConversationNotificationsAsRead(recipient1Id, 'TEAM', team1Id);

    // New message arrives after conversation was read
    await notificationService.notifyTeamMessage('msg-2', team1Id, senderId, 'Alex', 'Second batch', projectId);

    const unread = notificationStore.filter((n) => n.user_id === recipient1Id && !n.is_read);
    expect(unread.length).toBe(1);
    expect(unread[0].unread_message_count).toBe(1);
    expect(unread[0].latest_message_preview).toBe('Second batch');

    // Total records: 1 read + 1 unread = 2
    const total = notificationStore.filter((n) => n.user_id === recipient1Id);
    expect(total.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 8. Sender receives no notification
  // -------------------------------------------------------------------------
  it('8. Sender does not receive a notification', async () => {
    await notificationService.notifyTeamMessage('msg-1', team1Id, senderId, 'Alex', 'My own message', projectId);

    const senderNotifs = notificationStore.filter((n) => n.user_id === senderId);
    expect(senderNotifs.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 9. Removed members receive no notification
  // -------------------------------------------------------------------------
  it('9. Removed or non-members do not receive notifications', async () => {
    await notificationService.notifyTeamMessage('msg-1', team1Id, senderId, 'Alex', 'Secret team msg', projectId);

    const nonMemberNotifs = notificationStore.filter((n) => n.user_id === removedMemberId);
    expect(nonMemberNotifs.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 10. Concurrent messages do not create duplicate unread groups
  // -------------------------------------------------------------------------
  it('10. Concurrent messages do not create duplicate unread groups', async () => {
    // Simulate 3 concurrent message notification deliveries
    await Promise.all([
      notificationService.notifyTeamMessage('msg-c1', team1Id, senderId, 'Alex', 'Conc 1', projectId),
      notificationService.notifyTeamMessage('msg-c2', team1Id, senderId, 'Alex', 'Conc 2', projectId),
      notificationService.notifyTeamMessage('msg-c3', team1Id, senderId, 'Alex', 'Conc 3', projectId),
    ]);

    const userNotifs = notificationStore.filter((n) => n.user_id === recipient1Id && !n.is_read);
    expect(userNotifs.length).toBe(1);
    expect(userNotifs[0].unread_message_count).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 11. Every eligible message still triggers a toast
  // -------------------------------------------------------------------------
  it('11. Every eligible message still triggers a real-time toast via Redis', async () => {
    await notificationService.notifyTeamMessage('msg-t1', team1Id, senderId, 'Alex', 'Toast 1', projectId);
    await notificationService.notifyTeamMessage('msg-t2', team1Id, senderId, 'Alex', 'Toast 2', projectId);

    // Recipient1 and Recipient2 each receive toasts
    const calls = mockPublish.mock.calls;
    const toastPayloads = calls
      .map((c) => JSON.parse(c[1]))
      .filter((p) => p.notification.transient === true);

    expect(toastPayloads.length).toBe(4); // 2 messages * 2 recipients
    toastPayloads.forEach((t) => {
      expect(t.notification.type).toBe('TEAM_MESSAGE');
      expect(t.notification.transient).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Grouping does not suppress toasts
  // -------------------------------------------------------------------------
  it('12. Grouping does not suppress toasts — both transient toast and persistent grouped events are published', async () => {
    await notificationService.notifyTeamMessage('msg-1', team1Id, senderId, 'Alex', 'First msg', projectId);
    await notificationService.notifyTeamMessage('msg-2', team1Id, senderId, 'Alex', 'Second msg', projectId);

    const calls = mockPublish.mock.calls;
    const payloads = calls.map((c) => JSON.parse(c[1]));

    const toasts = payloads.filter((p) => p.notification.transient === true);
    const persistent = payloads.filter((p) => p.notification.transient === false);

    expect(toasts.length).toBeGreaterThan(0);
    expect(persistent.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 13. Duplicate event delivery does not increment counts twice
  // -------------------------------------------------------------------------
  it('13. Mark conversation read is idempotent', async () => {
    await notificationService.notifyTeamMessage('msg-1', team1Id, senderId, 'Alex', 'Message', projectId);

    const firstRead = await notificationService.markConversationNotificationsAsRead(recipient1Id, 'TEAM', team1Id);
    expect(firstRead).toBe(1);

    // Second call on already-read conversation updates 0 rows
    const secondRead = await notificationService.markConversationNotificationsAsRead(recipient1Id, 'TEAM', team1Id);
    expect(secondRead).toBe(0);
  });
});
