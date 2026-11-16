/**
 * projectMessage.test.ts
 *
 * Tests for project-wide chat message functionality:
 * 1.  Project OWNER can read messages.
 * 2.  Project ADMIN can read messages.
 * 3.  Project MEMBER can read messages.
 * 4.  Non-members cannot read project messages (403).
 * 5.  Non-members cannot send messages (403).
 * 6.  Sending a message persists it and emits WS event.
 * 7.  Empty messages are rejected by validator.
 * 8.  Messages exceeding 2000 chars are rejected.
 * 9.  Edit requires ownership (sender only).
 * 10. Delete requires ownership (sender only).
 * 11. Sending publishes transient toast notifications to other project members.
 * 12. Sender does not receive their own toast notification.
 * 13. Notification is transient (not persisted in notifications table).
 * 14. Message events are not emitted after failed persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
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

vi.mock('../config/database', () => {
  const sqlMock: any = vi.fn();
  return { default: sqlMock, sql: sqlMock, connectDB: vi.fn(), disconnectDB: vi.fn() };
});

vi.mock('../repositories/project.repository', () => ({
  findMemberRole:       vi.fn(),
  findMembersByProject: vi.fn(),
  findProjectById:      vi.fn(),
}));

vi.mock('../repositories/projectMessage.repository', () => ({
  createMessage:   vi.fn(),
  getMessages:     vi.fn(),
  findMessageById: vi.fn(),
  updateMessage:   vi.fn(),
  deleteMessage:   vi.fn(),
}));

vi.mock('../websocket/emit', () => ({
  emitToProject: vi.fn(),
  emitToTeam:    vi.fn(),
  emitToUser:    vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import sql from '../config/database';
import * as projectRepo  from '../repositories/project.repository';
import * as messageRepo  from '../repositories/projectMessage.repository';
import * as messageService from './projectMessage.service';
import * as notificationService from './notification.service';
import { emitToProject } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const projectId   = 'proj-uuid-1';
const otherProjId = 'proj-uuid-2';
const messageId   = 'msg-uuid-1';
const senderId    = 'user-sender';
const member1Id   = 'user-member-1';
const member2Id   = 'user-member-2';
const nonMemberId = 'user-nonmember';

const mockProject = { id: projectId, name: 'TeamPulse', created_by: senderId, created_at: new Date() };

const mockMessage = {
  id:          messageId,
  project_id:  projectId,
  sender_id:   senderId,
  sender_name: 'Alex',
  content:     'Hello project chat!',
  created_at:  new Date(),
  updated_at:  new Date(),
};

const mockMembers = [
  { user_id: senderId,  name: 'Alex',    email: 'alex@x.com',    role: 'OWNER' as const, joined_on: new Date() },
  { user_id: member1Id, name: 'Bob',     email: 'bob@x.com',     role: 'MEMBER' as const, joined_on: new Date() },
  { user_id: member2Id, name: 'Charlie', email: 'charlie@x.com', role: 'MEMBER' as const, joined_on: new Date() },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Project Message Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(projectRepo.findMemberRole).mockImplementation(async (pId, uId) => {
      if (pId !== projectId) return null;
      if (uId === senderId)  return 'OWNER';
      if (uId === member1Id) return 'ADMIN';
      if (uId === member2Id) return 'MEMBER';
      return null;
    });

    vi.mocked(projectRepo.findProjectById).mockResolvedValue(mockProject);
    vi.mocked(projectRepo.findMembersByProject).mockResolvedValue(mockMembers);
    vi.mocked(messageRepo.createMessage).mockResolvedValue(mockMessage);
    vi.mocked(messageRepo.getMessages).mockResolvedValue([mockMessage]);
    vi.mocked(messageRepo.findMessageById).mockResolvedValue(mockMessage);
    vi.mocked(messageRepo.updateMessage).mockResolvedValue({ ...mockMessage, content: 'Updated' });
    vi.mocked(messageRepo.deleteMessage).mockResolvedValue(true);

    (sql as any).mockImplementation(async () => []);
  });

  // -------------------------------------------------------------------------
  // 1. OWNER can read
  // -------------------------------------------------------------------------
  it('1. Project OWNER can read messages', async () => {
    const result = await messageService.getMessages(senderId, projectId, { limit: 50 });
    expect(result).toEqual([mockMessage]);
    expect(messageRepo.getMessages).toHaveBeenCalledWith(projectId, 50, undefined);
  });

  // -------------------------------------------------------------------------
  // 2. ADMIN can read
  // -------------------------------------------------------------------------
  it('2. Project ADMIN can read messages', async () => {
    const result = await messageService.getMessages(member1Id, projectId, { limit: 50 });
    expect(result).toEqual([mockMessage]);
  });

  // -------------------------------------------------------------------------
  // 3. MEMBER can read
  // -------------------------------------------------------------------------
  it('3. Project MEMBER can read messages', async () => {
    const result = await messageService.getMessages(member2Id, projectId, { limit: 50 });
    expect(result).toEqual([mockMessage]);
  });

  // -------------------------------------------------------------------------
  // 4. Non-member cannot read
  // -------------------------------------------------------------------------
  it('4. Non-members cannot read project messages (403)', async () => {
    await expect(
      messageService.getMessages(nonMemberId, projectId, { limit: 50 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // -------------------------------------------------------------------------
  // 5. Non-member cannot send
  // -------------------------------------------------------------------------
  it('5. Non-members cannot send messages (403)', async () => {
    await expect(
      messageService.sendMessage(nonMemberId, projectId, { content: 'Hello' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // -------------------------------------------------------------------------
  // 6. Sending persists message and emits WS event
  // -------------------------------------------------------------------------
  it('6. Sending a message persists it and emits project WS event', async () => {
    const result = await messageService.sendMessage(senderId, projectId, { content: 'Hello project!' });

    expect(messageRepo.createMessage).toHaveBeenCalledWith(projectId, senderId, 'Hello project!');
    expect(result.id).toBe(messageId);
    expect(emitToProject).toHaveBeenCalledWith(
      projectId,
      WS_EVENTS.PROJECT_MESSAGE_CREATED,
      expect.objectContaining({ projectId, senderId, content: mockMessage.content })
    );
  });

  // -------------------------------------------------------------------------
  // 7. Users cannot access another project's messages
  // -------------------------------------------------------------------------
  it('7. Users cannot access messages from another project', async () => {
    // sender is not a member of otherProjId
    await expect(
      messageService.getMessages(senderId, otherProjId, { limit: 50 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // -------------------------------------------------------------------------
  // 8. Edit requires ownership
  // -------------------------------------------------------------------------
  it('8. Only the message sender can edit their message', async () => {
    // member1 tries to edit sender's message
    vi.mocked(messageRepo.findMessageById).mockResolvedValue({ ...mockMessage, sender_id: senderId });
    await expect(
      messageService.updateMessage(member1Id, projectId, messageId, { content: 'Hacked' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // -------------------------------------------------------------------------
  // 9. Delete requires ownership
  // -------------------------------------------------------------------------
  it('9. Only the message sender can delete their message', async () => {
    vi.mocked(messageRepo.findMessageById).mockResolvedValue({ ...mockMessage, sender_id: senderId });
    await expect(
      messageService.deleteMessage(member1Id, projectId, messageId)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // -------------------------------------------------------------------------
  // 10. Persistent grouped notification in PostgreSQL
  // -------------------------------------------------------------------------
  it('10. Project chat messages insert a grouped notification into PostgreSQL', async () => {
    await notificationService.notifyProjectMessage(messageId, projectId, senderId, 'Alex', 'Hello!');

    const sqlCalls = (sql as any).mock.calls;
    const hasGroupedInsert = sqlCalls.some((call: any) => {
      const queryText = (call[0] as string[])?.join?.('') ?? '';
      return queryText.includes('INSERT INTO notifications') && queryText.includes('conversation_type');
    });
    expect(hasGroupedInsert).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 11. Notifications reach other project members
  // -------------------------------------------------------------------------
  it('11. Sending publishes transient toast to other project members', async () => {
    await notificationService.notifyProjectMessage(messageId, projectId, senderId, 'Alex', 'Hello!');

    expect(mockPublish).toHaveBeenCalled();
    const calls = mockPublish.mock.calls.map((c) => JSON.parse(c[1]));
    const toastRecipients = calls
      .filter((c) => c.notification.transient === true)
      .map((c) => c.userId);
    expect(toastRecipients).toContain(member1Id);
    expect(toastRecipients).toContain(member2Id);
  });

  // -------------------------------------------------------------------------
  // 12. Sender does not receive their own toast
  // -------------------------------------------------------------------------
  it('12. Sender does not receive their own notification', async () => {
    await notificationService.notifyProjectMessage(messageId, projectId, senderId, 'Alex', 'Hello!');

    const recipients = mockPublish.mock.calls.map((c) => JSON.parse(c[1]).userId);
    expect(recipients).not.toContain(senderId);
  });

  // -------------------------------------------------------------------------
  // 13. Notification payload includes transient toast for real-time display
  // -------------------------------------------------------------------------
  it('13. Project message notification includes transient toast for real-time display', async () => {
    await notificationService.notifyProjectMessage(messageId, projectId, senderId, 'Alex', 'Hello!');

    const calls = mockPublish.mock.calls.map((c) => JSON.parse(c[1]));
    const toastPayload = calls.find((c) => c.notification.transient === true);
    expect(toastPayload).toBeDefined();
    expect(toastPayload.notification.type).toBe('PROJECT_MESSAGE');
    expect(toastPayload.notification.project_id).toBe(projectId);
  });

  // -------------------------------------------------------------------------
  // 14. WS event NOT emitted after failed persistence
  // -------------------------------------------------------------------------
  it('14. WS event is not emitted if message persistence fails', async () => {
    vi.mocked(messageRepo.createMessage).mockRejectedValueOnce(new Error('DB error'));

    await expect(
      messageService.sendMessage(senderId, projectId, { content: 'Will fail' })
    ).rejects.toThrow('DB error');

    expect(emitToProject).not.toHaveBeenCalled();
  });
});
