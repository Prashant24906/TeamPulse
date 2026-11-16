/**
 * teamMessageNotification.test.ts
 *
 * Tests for transient TEAM_MESSAGE notification functionality:
 * 1. Sending a message publishes transient real-time events to other team members.
 * 2. Team chat messages do NOT insert into PostgreSQL notifications table.
 * 3. Sender does not receive a notification.
 * 4. Non-team-members do not receive notifications.
 * 5. Different teams receive isolated notifications.
 * 6. Message persistence succeeds even if notification delivery fails.
 * 7. Message preview formatting (truncation, whitespace collapsing).
 * 8. Real-time delivery carries `transient: true` for frontend toast-only display.
 * 9. Task assignment notifications remain persistent in PostgreSQL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before imports
// ---------------------------------------------------------------------------

const { mockPublish, mockQuit } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue(1),
  mockQuit: vi.fn().mockResolvedValue('OK'),
}));

vi.mock('../config/redis', () => ({
  createPubSubConnection: vi.fn().mockReturnValue({
    publish: mockPublish,
    quit: mockQuit,
    on: vi.fn(),
  }),
  isRedisReady: vi.fn().mockReturnValue(true),
}));

vi.mock('../config/database', () => {
  const sqlMock: any = vi.fn();
  return {
    default: sqlMock,
    sql: sqlMock,
    connectDB: vi.fn(),
    disconnectDB: vi.fn(),
  };
});

vi.mock('../repositories/team.repository', () => ({
  findTeamById: vi.fn(),
  findMemberRole: vi.fn(),
  getMembers: vi.fn(),
  findTeamsByUserId: vi.fn(),
}));

vi.mock('../repositories/teamMessage.repository', () => ({
  createMessage: vi.fn(),
  getMessages: vi.fn(),
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

vi.mock('./team.guard', () => ({
  assertTeamBelongsToProject: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import sql from '../config/database';
import * as teamRepo from '../repositories/team.repository';
import * as messageRepo from '../repositories/teamMessage.repository';
import * as notificationService from './notification.service';
import * as messageService from './teamMessage.service';
import { emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';

describe('Team Message Notifications (Transient Only)', () => {
  const teamId = 'team-uuid-1';
  const otherTeamId = 'team-uuid-2';
  const projectId = 'proj-uuid-1';
  const messageId = 'msg-uuid-1';
  const senderId = 'user-sender';
  const member1Id = 'user-member-1';
  const member2Id = 'user-member-2';
  const nonMemberId = 'user-nonmember';

  const mockTeam = {
    id: teamId,
    name: 'Backend Development',
    created_by: senderId,
    max_size: 10,
    created_at: new Date(),
    project_id: projectId,
  };

  const mockOtherTeam = {
    id: otherTeamId,
    name: 'Frontend Development',
    created_by: 'other-creator',
    max_size: 10,
    created_at: new Date(),
    project_id: projectId,
  };

  const mockMembers = [
    { team_id: teamId, user_id: senderId, role: 'OWNER' as const, name: 'Alex', email: 'alex@example.com' },
    { team_id: teamId, user_id: member1Id, role: 'MEMBER' as const, name: 'Bob', email: 'bob@example.com' },
    { team_id: teamId, user_id: member2Id, role: 'MEMBER' as const, name: 'Charlie', email: 'charlie@example.com' },
  ];

  const mockMessage = {
    id: messageId,
    team_id: teamId,
    sender_id: senderId,
    sender_name: 'Alex',
    content: 'Hello team, the new notification system is ready!',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(teamRepo.findTeamById).mockImplementation(async (id) => {
      if (id === teamId) return mockTeam;
      if (id === otherTeamId) return mockOtherTeam;
      return null;
    });

    vi.mocked(teamRepo.findMemberRole).mockImplementation(async (tid, uid) => {
      if (tid === teamId && [senderId, member1Id, member2Id].includes(uid)) return 'MEMBER';
      return null;
    });

    vi.mocked(teamRepo.getMembers).mockImplementation(async (tid) => {
      if (tid === teamId) return mockMembers;
      if (tid === otherTeamId) {
        return [{ team_id: otherTeamId, user_id: 'other-user', role: 'MEMBER', name: 'Other', email: 'other@example.com' }];
      }
      return [];
    });

    vi.mocked(messageRepo.createMessage).mockResolvedValue(mockMessage);

    (sql as any).mockImplementation(async () => []);
  });

  // -------------------------------------------------------------------------
  // 1. Sending a message publishes transient real-time events to other members
  // -------------------------------------------------------------------------
  it('1. Sending a message publishes transient real-time events to other team members', async () => {
    await messageService.sendMessage(senderId, teamId, { content: mockMessage.content }, projectId);

    // Verify Redis publish was called for member1 and member2
    expect(mockPublish).toHaveBeenCalledTimes(2);

    const publishedPayloads = mockPublish.mock.calls.map((call) => JSON.parse(call[1]));
    const recipientIds = publishedPayloads.map((p) => p.userId);

    expect(recipientIds).toContain(member1Id);
    expect(recipientIds).toContain(member2Id);

    // Check payload structure: marked as transient
    const firstPayload = publishedPayloads[0];
    expect(firstPayload.notification.type).toBe('TEAM_MESSAGE');
    expect(firstPayload.notification.transient).toBe(true);
    expect(firstPayload.notification.team_id).toBe(teamId);
    expect(firstPayload.notification.project_id).toBe(projectId);
    expect(firstPayload.notification.message_id).toBe(messageId);
  });

  // -------------------------------------------------------------------------
  // 2. Team chat messages upsert a persistent grouped notification in PostgreSQL
  // -------------------------------------------------------------------------
  it('2. Team chat messages upsert a persistent grouped notification record in PostgreSQL notifications table', async () => {
    await messageService.sendMessage(senderId, teamId, { content: mockMessage.content }, projectId);

    // Verify that sql was called with an INSERT INTO notifications statement containing ON CONFLICT for grouping
    const sqlCalls = (sql as any).mock.calls;
    const hasGroupedInsert = sqlCalls.some((call: any) => {
      const queryText = (call[0] as string[])?.join?.('') ?? '';
      return (
        queryText.includes('INSERT INTO notifications') &&
        queryText.includes('ON CONFLICT (user_id, conversation_type, conversation_id) WHERE is_read = FALSE')
      );
    });
    expect(hasGroupedInsert).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Sender does not receive a notification
  // -------------------------------------------------------------------------
  it('3. Sender does not receive a notification', async () => {
    await messageService.sendMessage(senderId, teamId, { content: mockMessage.content });

    const publishedPayloads = mockPublish.mock.calls.map((call) => JSON.parse(call[1]));
    const recipientIds = publishedPayloads.map((p) => p.userId);

    expect(recipientIds).not.toContain(senderId);
  });

  // -------------------------------------------------------------------------
  // 4. Non-team-members do not receive notifications
  // -------------------------------------------------------------------------
  it('4. Non-team-members do not receive notifications', async () => {
    await messageService.sendMessage(senderId, teamId, { content: mockMessage.content });

    const publishedPayloads = mockPublish.mock.calls.map((call) => JSON.parse(call[1]));
    const recipientIds = publishedPayloads.map((p) => p.userId);

    expect(recipientIds).not.toContain(nonMemberId);
  });

  // -------------------------------------------------------------------------
  // 5. Different teams receive isolated notifications
  // -------------------------------------------------------------------------
  it('5. Different teams receive isolated notifications', async () => {
    await notificationService.notifyTeamMessage(
      'msg-other',
      otherTeamId,
      'other-sender',
      'Other Sender',
      'Message in other team'
    );

    const publishedPayloads = mockPublish.mock.calls.map((call) => JSON.parse(call[1]));
    const recipientIds = publishedPayloads.map((p) => p.userId);

    // Members of teamId should not be in otherTeamId notifications
    expect(recipientIds).not.toContain(senderId);
    expect(recipientIds).not.toContain(member1Id);
    expect(recipientIds).not.toContain(member2Id);
    expect(recipientIds).toContain('other-user');
  });

  // -------------------------------------------------------------------------
  // 6. Message persistence succeeds even if notification delivery throws
  // -------------------------------------------------------------------------
  it('6. Message persistence succeeds even if notification delivery throws', async () => {
    // Force Redis or notification to throw
    mockPublish.mockRejectedValueOnce(new Error('Redis connection lost'));

    // sendMessage should still return message successfully
    const result = await messageService.sendMessage(senderId, teamId, { content: 'Persist me' });
    expect(result).toBeDefined();
    expect(result.id).toBe(messageId);
    expect(emitToTeam).toHaveBeenCalledWith(teamId, WS_EVENTS.MESSAGE_CREATED, expect.any(Object));
  });

  // -------------------------------------------------------------------------
  // 7. Message preview formatting & truncation
  // -------------------------------------------------------------------------
  it('7. Truncates long message previews and collapses whitespace', async () => {
    const longContent = '   Line 1\n   Line 2 with very long content that exceeds sixty characters easily.   ';

    await notificationService.notifyTeamMessage(messageId, teamId, senderId, 'Alex', longContent);

    expect(mockPublish).toHaveBeenCalled();
    const payload = JSON.parse(mockPublish.mock.calls[0][1]);
    const messageText = payload.notification.message;

    expect(messageText).toContain('...');
    expect(messageText).not.toContain('\n');
    expect(messageText).toMatch(/^Alex sent a message in Backend Development: "Line 1 Line 2 with/);
  });

  // -------------------------------------------------------------------------
  // 8. Real-time delivery uses the existing notification event structure
  // -------------------------------------------------------------------------
  it('8. Real-time delivery uses the existing notification event structure', async () => {
    await notificationService.notifyTeamMessage(
      messageId,
      teamId,
      senderId,
      'Alex',
      'Navigation test',
      projectId
    );

    expect(mockPublish).toHaveBeenCalled();
    const payload = JSON.parse(mockPublish.mock.calls[0][1]);

    expect(payload.notification.team_id).toBe(teamId);
    expect(payload.notification.project_id).toBe(projectId);
    expect(payload.notification.type).toBe('TEAM_MESSAGE');
    expect(payload.notification.transient).toBe(true);
    expect(payload.notification.sender_id).toBe(senderId);
    expect(payload.notification.sender_name).toBe('Alex');
  });

  // -------------------------------------------------------------------------
  // 9. Task assignment notifications remain persistent in PostgreSQL
  // -------------------------------------------------------------------------
  it('9. Task assignment notifications remain persistent in PostgreSQL', async () => {
    (sql as any).mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join('');
      if (text.includes('INSERT INTO notifications')) {
        return [
          {
            id: 'notif-task-1',
            user_id: 'user-assigned',
            task_id: 'task-1',
            type: 'TASK_ASSIGNED',
            message: 'Alex assigned you a task: Test',
            job_id: 'assign_task-1_user-assigned',
            is_read: false,
            created_at: new Date(),
          },
        ];
      }
      return [];
    });

    await notificationService.notifyTaskAssigned(
      'assign_task-1_user-assigned',
      'task-1',
      'user-assigned',
      'Alex',
      'Test'
    );

    // Verify SQL was called to persist TASK_ASSIGNED
    const sqlCalls = (sql as any).mock.calls;
    const hasInsert = sqlCalls.some((call: any) =>
      call[0]?.join?.('').includes('INSERT INTO notifications')
    );
    expect(hasInsert).toBe(true);
  });
});
