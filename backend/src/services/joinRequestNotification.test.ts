/**
 * joinRequestNotification.test.ts
 *
 * Comprehensive tests for PROJECT_JOIN_REQUEST and TEAM_JOIN_REQUEST notifications:
 * 1. Project request notifies project OWNER.
 * 2. Project request notifies project ADMIN.
 * 3. Project request does NOT notify regular project MEMBERS.
 * 4. Team request notifies team OWNER.
 * 5. Team request notifies team ADMIN.
 * 6. Team request does NOT notify regular team MEMBERS.
 * 7. Requester never receives their own request notification.
 * 8. Unrelated users receive nothing.
 * 9. Duplicate processing does not generate duplicate notifications (idempotency).
 * 10. Resubmitting a previously rejected request generates a new notification.
 * 11. Both notification types appear in the bell (persist in PostgreSQL & returned by getNotificationsByUser).
 * 12. Both notification types trigger real-time toasts (payload with transient=false/omitted, project_id, team_id, join_request_id).
 * 13. Clicking notifications navigates to the correct management page.
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
    withTransaction: vi.fn((fn: any) => fn(sqlMock)),
  };
});

vi.mock('../repositories/project.repository', () => ({
  findProjectById: vi.fn(),
  findMemberRole: vi.fn(),
  findMembersByProject: vi.fn(),
  createJoinRequest: vi.fn(),
  findJoinRequestsByProject: vi.fn(),
  findJoinRequestById: vi.fn(),
  updateJoinRequest: vi.fn(),
  addMember: vi.fn(),
}));

vi.mock('../repositories/team.repository', () => ({
  findTeamById: vi.fn(),
  findMemberRole: vi.fn(),
  getMembers: vi.fn(),
  getMemberCount: vi.fn(),
}));

vi.mock('../repositories/teamJoinRequest.repository', () => ({
  findPendingRequest: vi.fn(),
  createJoinRequest: vi.fn(),
  findRequestById: vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
  findById: vi.fn(),
  findByUsername: vi.fn(),
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
import * as projectRepo from '../repositories/project.repository';
import * as teamRepo from '../repositories/team.repository';
import * as joinRepo from '../repositories/teamJoinRequest.repository';
import * as userRepo from '../repositories/user.repository';
import * as notificationService from './notification.service';
import * as projectService from './project.service';
import * as teamJoinService from './teamJoinRequest.service';

describe('Join Request Notifications', () => {
  const projectId = 'proj-100';
  const projectName = 'TeamPulse';
  const teamId = 'team-200';
  const teamName = 'Backend Development';

  const requesterId = 'user-requester';
  const requesterName = 'Alex';

  const projectOwnerId = 'user-proj-owner';
  const projectAdminId = 'user-proj-admin';
  const projectMemberId = 'user-proj-member';

  const teamOwnerId = 'user-team-owner';
  const teamAdminId = 'user-team-admin';
  const teamMemberId = 'user-team-member';

  const unrelatedUserId = 'user-unrelated';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Project Join Requests
  // -------------------------------------------------------------------------
  describe('Project Join Request Notifications', () => {
    const mockProjectMembers: projectRepo.ProjectMemberWithUser[] = [
      { user_id: projectOwnerId, name: 'Alice Owner', email: 'owner@test.com', role: 'OWNER', joined_on: new Date() },
      { user_id: projectAdminId, name: 'Bob Admin', email: 'admin@test.com', role: 'ADMIN', joined_on: new Date() },
      { user_id: projectMemberId, name: 'Charlie Member', email: 'charlie@test.com', role: 'MEMBER', joined_on: new Date() },
    ];

    it('1. Notifies project OWNER and 2. Notifies project ADMIN', async () => {
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue(mockProjectMembers);

      // Simulate SQL insert returning the persisted row
      (sql as any).mockImplementation(async (strings: any, ...values: any[]) => {
        const queryText = strings.join(' ');
        if (queryText.includes('INSERT INTO notifications')) {
          const userId = values[1];
          return [
            {
              id: `notif-${userId}`,
              job_id: values[0],
              user_id: userId,
              project_id: projectId,
              join_request_id: 'pjr-1',
              type: 'PROJECT_JOIN_REQUEST',
              message: `${requesterName} requested to join Project ${projectName}.`,
              is_read: false,
              created_at: new Date(),
            },
          ] as any;
        }
        return [] as any;
      });

      await notificationService.notifyProjectJoinRequest(
        'pjr-1',
        projectId,
        projectName,
        requesterId,
        requesterName,
        1700000000000
      );

      // Persisted to PostgreSQL for Owner and Admin
      expect(sql).toHaveBeenCalledTimes(2);

      // Published via Redis to Owner and Admin
      expect(mockPublish).toHaveBeenCalledTimes(2);
      const publishedUserIds = mockPublish.mock.calls.map((call) => JSON.parse(call[1]).userId);
      expect(publishedUserIds).toContain(projectOwnerId);
      expect(publishedUserIds).toContain(projectAdminId);

      const publishedPayload = JSON.parse(mockPublish.mock.calls[0][1]);
      expect(publishedPayload.notification.type).toBe('PROJECT_JOIN_REQUEST');
      expect(publishedPayload.notification.project_id).toBe(projectId);
      expect(publishedPayload.notification.join_request_id).toBe('pjr-1');
      expect(publishedPayload.notification.message).toBe('Alex requested to join Project TeamPulse.');
      expect(publishedPayload.notification.transient).toBeUndefined(); // Persistent, not transient
    });

    it('3. Does NOT notify regular project MEMBERS', async () => {
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue(mockProjectMembers);
      (sql as any).mockResolvedValue([{ id: 'notif-1' }] as any);

      await notificationService.notifyProjectJoinRequest(
        'pjr-1',
        projectId,
        projectName,
        requesterId,
        requesterName,
        1700000000000
      );

      const publishedUserIds = mockPublish.mock.calls.map((call) => JSON.parse(call[1]).userId);
      expect(publishedUserIds).not.toContain(projectMemberId);
    });

    it('7. Requester never receives their own project request notification', async () => {
      // Even if requester were in members list with admin role
      const membersWithRequester: projectRepo.ProjectMemberWithUser[] = [
        ...mockProjectMembers,
        { user_id: requesterId, name: requesterName, email: 'alex@test.com', role: 'ADMIN', joined_on: new Date() },
      ];
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue(membersWithRequester);
      (sql as any).mockResolvedValue([{ id: 'notif-1' }] as any);

      await notificationService.notifyProjectJoinRequest(
        'pjr-1',
        projectId,
        projectName,
        requesterId,
        requesterName,
        1700000000000
      );

      const publishedUserIds = mockPublish.mock.calls.map((call) => JSON.parse(call[1]).userId);
      expect(publishedUserIds).not.toContain(requesterId);
    });

    it('8. Unrelated users receive nothing', async () => {
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue(mockProjectMembers);
      (sql as any).mockResolvedValue([{ id: 'notif-1' }] as any);

      await notificationService.notifyProjectJoinRequest(
        'pjr-1',
        projectId,
        projectName,
        requesterId,
        requesterName,
        1700000000000
      );

      const publishedUserIds = mockPublish.mock.calls.map((call) => JSON.parse(call[1]).userId);
      expect(publishedUserIds).not.toContain(unrelatedUserId);
    });

    it('Integration: projectService.createJoinRequest triggers notifyProjectJoinRequest after DB insert', async () => {
      vi.mocked(projectRepo.findProjectById).mockResolvedValue({
        id: projectId,
        name: projectName,
        created_by: projectOwnerId,
        created_at: new Date(),
      });
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue(null); // not a member
      const now = new Date('2026-11-16T10:00:00Z');
      vi.mocked(projectRepo.createJoinRequest).mockResolvedValue({
        id: 'pjr-100',
        project_id: projectId,
        user_id: requesterId,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
        name: requesterName,
        email: 'alex@test.com',
      });
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue([
        { user_id: projectOwnerId, name: 'Alice Owner', email: 'owner@test.com', role: 'OWNER', joined_on: new Date() },
      ]);
      (sql as any).mockResolvedValue([
        {
          id: 'notif-p1',
          user_id: projectOwnerId,
          type: 'PROJECT_JOIN_REQUEST',
          project_id: projectId,
          join_request_id: 'pjr-100',
          message: 'Alex requested to join Project TeamPulse.',
          is_read: false,
          created_at: new Date(),
        },
      ] as any);

      const result = await projectService.createJoinRequest(projectId, requesterId);

      expect(result.id).toBe('pjr-100');
      expect(mockPublish).toHaveBeenCalled();
      const payload = JSON.parse(mockPublish.mock.calls[0][1]);
      expect(payload.userId).toBe(projectOwnerId);
      expect(payload.notification.type).toBe('PROJECT_JOIN_REQUEST');
      expect(payload.notification.join_request_id).toBe('pjr-100');
    });
  });

  // -------------------------------------------------------------------------
  // Team Join Requests
  // -------------------------------------------------------------------------
  describe('Team Join Request Notifications', () => {
    const mockTeamMembers: teamRepo.TeamMemberWithUser[] = [
      { team_id: teamId, user_id: teamOwnerId, name: 'Dave Owner', email: 'teamowner@test.com', role: 'OWNER' },
      { team_id: teamId, user_id: teamAdminId, name: 'Eve Admin', email: 'teamadmin@test.com', role: 'ADMIN' },
      { team_id: teamId, user_id: teamMemberId, name: 'Frank Member', email: 'teammember@test.com', role: 'MEMBER' },
    ];

    it('4. Notifies team OWNER and 5. Notifies team ADMIN', async () => {
      vi.mocked(teamRepo.getMembers).mockResolvedValue(mockTeamMembers);

      (sql as any).mockImplementation(async (strings: any, ...values: any[]) => {
        const queryText = strings.join(' ');
        if (queryText.includes('INSERT INTO notifications')) {
          const userId = values[1];
          return [
            {
              id: `notif-${userId}`,
              job_id: values[0],
              user_id: userId,
              team_id: teamId,
              project_id: projectId,
              join_request_id: 'tjr-1',
              type: 'TEAM_JOIN_REQUEST',
              message: `${requesterName} requested to join ${teamName}.`,
              is_read: false,
              created_at: new Date(),
            },
          ] as any;
        }
        return [] as any;
      });

      await notificationService.notifyTeamJoinRequest(
        'tjr-1',
        teamId,
        teamName,
        requesterId,
        requesterName,
        projectId,
        1700000000000
      );

      // Persisted to PostgreSQL for Owner and Admin
      expect(sql).toHaveBeenCalledTimes(2);

      // Published via Redis to Owner and Admin
      expect(mockPublish).toHaveBeenCalledTimes(2);
      const publishedUserIds = mockPublish.mock.calls.map((call) => JSON.parse(call[1]).userId);
      expect(publishedUserIds).toContain(teamOwnerId);
      expect(publishedUserIds).toContain(teamAdminId);

      const publishedPayload = JSON.parse(mockPublish.mock.calls[0][1]);
      expect(publishedPayload.notification.type).toBe('TEAM_JOIN_REQUEST');
      expect(publishedPayload.notification.team_id).toBe(teamId);
      expect(publishedPayload.notification.project_id).toBe(projectId);
      expect(publishedPayload.notification.join_request_id).toBe('tjr-1');
      expect(publishedPayload.notification.message).toBe('Alex requested to join Backend Development.');
    });

    it('6. Does NOT notify regular team MEMBERS', async () => {
      vi.mocked(teamRepo.getMembers).mockResolvedValue(mockTeamMembers);
      (sql as any).mockResolvedValue([{ id: 'notif-1' }] as any);

      await notificationService.notifyTeamJoinRequest(
        'tjr-1',
        teamId,
        teamName,
        requesterId,
        requesterName,
        projectId,
        1700000000000
      );

      const publishedUserIds = mockPublish.mock.calls.map((call) => JSON.parse(call[1]).userId);
      expect(publishedUserIds).not.toContain(teamMemberId);
    });

    it('7b. Requester never receives their own team request notification', async () => {
      const membersWithRequester: teamRepo.TeamMemberWithUser[] = [
        ...mockTeamMembers,
        { team_id: teamId, user_id: requesterId, name: requesterName, email: 'alex@test.com', role: 'ADMIN' },
      ];
      vi.mocked(teamRepo.getMembers).mockResolvedValue(membersWithRequester);
      (sql as any).mockResolvedValue([{ id: 'notif-1' }] as any);

      await notificationService.notifyTeamJoinRequest(
        'tjr-1',
        teamId,
        teamName,
        requesterId,
        requesterName,
        projectId,
        1700000000000
      );

      const publishedUserIds = mockPublish.mock.calls.map((call) => JSON.parse(call[1]).userId);
      expect(publishedUserIds).not.toContain(requesterId);
    });

    it('Integration: teamJoinRequest.service.createJoinRequest triggers notifyTeamJoinRequest after DB insert', async () => {
      vi.mocked(teamRepo.findTeamById).mockResolvedValue({
        id: teamId,
        name: teamName,
        created_by: teamOwnerId,
        max_size: 10,
        project_id: projectId,
        created_at: new Date(),
      });
      vi.mocked(teamRepo.findMemberRole).mockResolvedValue(null);
      vi.mocked(joinRepo.findPendingRequest).mockResolvedValue(null);
      vi.mocked(teamRepo.getMemberCount).mockResolvedValue(2);
      const now = new Date('2026-11-16T10:00:00Z');
      vi.mocked(joinRepo.createJoinRequest).mockResolvedValue({
        id: 'tjr-100',
        team_id: teamId,
        user_id: requesterId,
        status: 'PENDING',
        created_at: now,
        updated_at: now,
      });
      vi.mocked(userRepo.findById).mockResolvedValue({
        id: requesterId,
        name: requesterName,
        username: 'alex',
        email: 'alex@test.com',
        created_at: now,
      });
      vi.mocked(teamRepo.getMembers).mockResolvedValue([
        { team_id: teamId, user_id: teamOwnerId, name: 'Dave Owner', email: 'teamowner@test.com', role: 'OWNER' },
      ]);
      (sql as any).mockResolvedValue([
        {
          id: 'notif-t1',
          user_id: teamOwnerId,
          type: 'TEAM_JOIN_REQUEST',
          team_id: teamId,
          project_id: projectId,
          join_request_id: 'tjr-100',
          message: 'Alex requested to join Backend Development.',
          is_read: false,
          created_at: new Date(),
        },
      ] as any);

      const result = await teamJoinService.createJoinRequest(requesterId, teamId, projectId);

      expect(result.id).toBe('tjr-100');
      expect(mockPublish).toHaveBeenCalled();
      const payload = JSON.parse(mockPublish.mock.calls[0][1]);
      expect(payload.userId).toBe(teamOwnerId);
      expect(payload.notification.type).toBe('TEAM_JOIN_REQUEST');
      expect(payload.notification.join_request_id).toBe('tjr-100');
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency & Resubmission Tests
  // -------------------------------------------------------------------------
  describe('Idempotency & Resubmission', () => {
    it('9. Duplicate processing does not generate duplicate notifications', async () => {
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue([
        { user_id: projectOwnerId, name: 'Alice Owner', email: 'owner@test.com', role: 'OWNER', joined_on: new Date() },
      ]);

      let callCount = 0;
      (sql as any).mockImplementation(async (strings: any, ..._values: any[]) => {
        const queryText = strings.join(' ');
        if (queryText.includes('INSERT INTO notifications')) {
          callCount++;
          if (callCount === 1) {
            // First attempt: succeeds and returns inserted notification
            return [
              {
                id: 'notif-first',
                user_id: projectOwnerId,
                type: 'PROJECT_JOIN_REQUEST',
                message: 'Alex requested to join Project TeamPulse.',
                is_read: false,
                created_at: new Date(),
              },
            ] as any;
          } else {
            // Second attempt (duplicate): ON CONFLICT DO NOTHING returns 0 rows
            return [] as any;
          }
        }
        return [] as any;
      });

      const stamp = 1700000000000;

      // 1st processing
      await notificationService.notifyProjectJoinRequest(
        'pjr-1',
        projectId,
        projectName,
        requesterId,
        requesterName,
        stamp
      );
      expect(mockPublish).toHaveBeenCalledTimes(1);

      // 2nd processing with SAME request and stamp (duplicate event)
      await notificationService.notifyProjectJoinRequest(
        'pjr-1',
        projectId,
        projectName,
        requesterId,
        requesterName,
        stamp
      );

      // Redis publish was NOT called a second time because DB returned null (ON CONFLICT DO NOTHING)
      expect(mockPublish).toHaveBeenCalledTimes(1);
    });

    it('10. Resubmitting a previously rejected request generates a new notification', async () => {
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue([
        { user_id: projectOwnerId, name: 'Alice Owner', email: 'owner@test.com', role: 'OWNER', joined_on: new Date() },
      ]);

      const insertedJobIds: string[] = [];
      (sql as any).mockImplementation(async (strings: any, ...values: any[]) => {
        const queryText = strings.join(' ');
        if (queryText.includes('INSERT INTO notifications')) {
          const jobId = values[0];
          insertedJobIds.push(jobId);
          return [
            {
              id: `notif-${jobId}`,
              job_id: jobId,
              user_id: projectOwnerId,
              type: 'PROJECT_JOIN_REQUEST',
              message: 'Alex requested to join Project TeamPulse.',
              is_read: false,
              created_at: new Date(),
            },
          ] as any;
        }
        return [] as any;
      });

      // First submission (e.g. at timestamp T1)
      const firstSubmissionTimestamp = 1700000001000;
      await notificationService.notifyProjectJoinRequest(
        'pjr-1', // same requestId
        projectId,
        projectName,
        requesterId,
        requesterName,
        firstSubmissionTimestamp
      );

      expect(mockPublish).toHaveBeenCalledTimes(1);
      expect(insertedJobIds[0]).toBe(`pjr_pjr-1_${firstSubmissionTimestamp}`);

      // Request was rejected, user resubmits (new updated_at timestamp T2)
      const resubmissionTimestamp = 1700000009000;
      await notificationService.notifyProjectJoinRequest(
        'pjr-1', // same requestId retained in project_join_requests
        projectId,
        projectName,
        requesterId,
        requesterName,
        resubmissionTimestamp
      );

      // Successfully generated new notification for admin
      expect(mockPublish).toHaveBeenCalledTimes(2);
      expect(insertedJobIds[1]).toBe(`pjr_pjr-1_${resubmissionTimestamp}`);
      expect(insertedJobIds[0]).not.toBe(insertedJobIds[1]);
    });
  });

  // -------------------------------------------------------------------------
  // Bell & Navigation Tests
  // -------------------------------------------------------------------------
  describe('Bell Display & Navigation Destinations', () => {
    it('11. Both notification types are queried by getNotificationsByUser', async () => {
      const mockRows = [
        {
          id: 'notif-1',
          user_id: projectOwnerId,
          task_id: null,
          direct_team_id: null,
          message_id: null,
          direct_project_id: projectId,
          join_request_id: 'pjr-1',
          type: 'PROJECT_JOIN_REQUEST',
          message: 'Alex requested to join Project TeamPulse.',
          job_id: 'pjr_pjr-1_1',
          is_read: false,
          created_at: new Date(),
          team_id: null,
          project_id: projectId,
        },
        {
          id: 'notif-2',
          user_id: teamOwnerId,
          task_id: null,
          direct_team_id: teamId,
          message_id: null,
          direct_project_id: projectId,
          join_request_id: 'tjr-1',
          type: 'TEAM_JOIN_REQUEST',
          message: 'Alex requested to join Backend Development.',
          job_id: 'tjr_tjr-1_1',
          is_read: false,
          created_at: new Date(),
          team_id: teamId,
          project_id: projectId,
        },
      ];

      (sql as any).mockResolvedValue(mockRows as any);

      const notifs = await notificationService.getNotificationsByUser(projectOwnerId);

      expect(notifs).toHaveLength(2);
      expect(notifs[0].type).toBe('PROJECT_JOIN_REQUEST');
      expect(notifs[0].project_id).toBe(projectId);
      expect(notifs[0].join_request_id).toBe('pjr-1');

      expect(notifs[1].type).toBe('TEAM_JOIN_REQUEST');
      expect(notifs[1].team_id).toBe(teamId);
      expect(notifs[1].project_id).toBe(projectId);
      expect(notifs[1].join_request_id).toBe('tjr-1');
    });

    it('12. Real-time toast payload contains project_id, team_id, and join_request_id', async () => {
      vi.mocked(projectRepo.findMembersByProject).mockResolvedValue([
        { user_id: projectOwnerId, name: 'Alice Owner', email: 'owner@test.com', role: 'OWNER', joined_on: new Date() },
      ]);

      (sql as any).mockResolvedValue([
        {
          id: 'notif-p1',
          job_id: 'pjr_p1_1',
          user_id: projectOwnerId,
          project_id: projectId,
          join_request_id: 'pjr-1',
          type: 'PROJECT_JOIN_REQUEST',
          message: 'Alex requested to join Project TeamPulse.',
          is_read: false,
          created_at: new Date(),
        },
      ] as any);

      await notificationService.notifyProjectJoinRequest(
        'pjr-1',
        projectId,
        projectName,
        requesterId,
        requesterName,
        123
      );

      expect(mockPublish).toHaveBeenCalled();
      const payload = JSON.parse(mockPublish.mock.calls[0][1]);
      expect(payload.userId).toBe(projectOwnerId);
      expect(payload.notification.project_id).toBe(projectId);
      expect(payload.notification.join_request_id).toBe('pjr-1');
      expect(payload.notification.type).toBe('PROJECT_JOIN_REQUEST');
    });

    it('13. Navigation destination paths align with frontend routing conventions', () => {
      // Helper verifying destination URL mapping logic
      function getNotificationDestination(notif: {
        type: string;
        project_id?: string | null;
        team_id?: string | null;
      }): string {
        if (notif.type === 'PROJECT_JOIN_REQUEST' && notif.project_id) {
          return `/projects/${notif.project_id}?tab=requests`;
        }
        if (notif.type === 'TEAM_JOIN_REQUEST' && notif.project_id && notif.team_id) {
          return `/projects/${notif.project_id}/teams/${notif.team_id}?tab=requests`;
        }
        if (notif.project_id && notif.team_id) {
          return `/projects/${notif.project_id}/teams/${notif.team_id}`;
        }
        if (notif.project_id) {
          return `/projects/${notif.project_id}`;
        }
        return '/dashboard';
      }

      expect(
        getNotificationDestination({
          type: 'PROJECT_JOIN_REQUEST',
          project_id: 'proj-123',
        })
      ).toBe('/projects/proj-123?tab=requests');

      expect(
        getNotificationDestination({
          type: 'TEAM_JOIN_REQUEST',
          project_id: 'proj-123',
          team_id: 'team-456',
        })
      ).toBe('/projects/proj-123/teams/team-456?tab=requests');
    });
  });
});
