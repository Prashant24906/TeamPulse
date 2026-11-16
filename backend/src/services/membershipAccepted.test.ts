import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before imports
// ---------------------------------------------------------------------------

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

vi.mock('../config/redis', () => ({
  createPubSubConnection: vi.fn().mockReturnValue({
    publish: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
  }),
  isRedisReady: vi.fn().mockReturnValue(true),
}));

vi.mock('../repositories/project.repository', () => ({
  findProjectById: vi.fn(),
  findMemberRole: vi.fn(),
  findJoinRequestById: vi.fn(),
  updateJoinRequest: vi.fn(),
  addMember: vi.fn(),
}));

vi.mock('../repositories/team.repository', () => ({
  findTeamById: vi.fn(),
  findMemberRole: vi.fn(),
  getMembers: vi.fn(),
}));

vi.mock('../repositories/teamJoinRequest.repository', () => ({
  findRequestById: vi.fn(),
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
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

import * as projectRepo from '../repositories/project.repository';
import * as teamRepo from '../repositories/team.repository';
import * as joinRepo from '../repositories/teamJoinRequest.repository';
import { emitToUser, emitToTeam } from '../websocket/emit';
import { WS_EVENTS } from '../websocket/events';
import * as projectService from './project.service';
import * as teamJoinService from './teamJoinRequest.service';

describe('Real-Time Membership Updates After Join Request Acceptance', () => {
  const projectId = 'proj-101';
  const projectName = 'Project Alpha';
  const teamId = 'team-202';
  const teamName = 'Core API Team';

  const callerOwnerId = 'user-owner';
  const callerAdminId = 'user-admin';
  const callerMemberId = 'user-member';
  const requesterId = 'user-requester';
  const unrelatedUserId = 'user-unrelated';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Project Join Request Acceptance', () => {
    it('emits project.membership.accepted to the requester when accepted by OWNER', async () => {
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(projectRepo.findJoinRequestById).mockResolvedValue({
        id: 'req-proj-1',
        project_id: projectId,
        user_id: requesterId,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      vi.mocked(projectRepo.updateJoinRequest).mockResolvedValue({
        id: 'req-proj-1',
        project_id: projectId,
        user_id: requesterId,
        status: 'APPROVED',
      } as any);
      vi.mocked(projectRepo.addMember).mockResolvedValue({
        project_id: projectId,
        user_id: requesterId,
        role: 'MEMBER',
      } as any);
      vi.mocked(projectRepo.findProjectById).mockResolvedValue({
        id: projectId,
        name: projectName,
      } as any);

      const result = await projectService.resolveJoinRequest(
        projectId,
        'req-proj-1',
        'APPROVED',
        callerOwnerId
      );

      expect(result.status).toBe('APPROVED');
      expect(projectRepo.addMember).toHaveBeenCalledWith(projectId, requesterId, 'MEMBER');

      // Verify emitToUser was called with the exact event and payload
      expect(emitToUser).toHaveBeenCalledWith(
        requesterId,
        WS_EVENTS.PROJECT_MEMBERSHIP_ACCEPTED,
        {
          projectId,
          projectName,
          userId: requesterId,
        }
      );

      // Verify no emission to unrelated user or caller
      expect(emitToUser).not.toHaveBeenCalledWith(unrelatedUserId, expect.anything(), expect.anything());
      expect(emitToUser).not.toHaveBeenCalledWith(callerOwnerId, WS_EVENTS.PROJECT_MEMBERSHIP_ACCEPTED, expect.anything());
    });

    it('emits project.membership.accepted to the requester when accepted by ADMIN', async () => {
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('ADMIN');
      vi.mocked(projectRepo.findJoinRequestById).mockResolvedValue({
        id: 'req-proj-2',
        project_id: projectId,
        user_id: requesterId,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      vi.mocked(projectRepo.updateJoinRequest).mockResolvedValue({
        id: 'req-proj-2',
        project_id: projectId,
        user_id: requesterId,
        status: 'APPROVED',
      } as any);
      vi.mocked(projectRepo.addMember).mockResolvedValue({
        project_id: projectId,
        user_id: requesterId,
        role: 'MEMBER',
      } as any);
      vi.mocked(projectRepo.findProjectById).mockResolvedValue({
        id: projectId,
        name: projectName,
      } as any);

      await projectService.resolveJoinRequest(
        projectId,
        'req-proj-2',
        'APPROVED',
        callerAdminId
      );

      expect(emitToUser).toHaveBeenCalledWith(
        requesterId,
        WS_EVENTS.PROJECT_MEMBERSHIP_ACCEPTED,
        {
          projectId,
          projectName,
          userId: requesterId,
        }
      );
    });

    it('does NOT emit project.membership.accepted when join request is REJECTED', async () => {
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(projectRepo.findJoinRequestById).mockResolvedValue({
        id: 'req-proj-3',
        project_id: projectId,
        user_id: requesterId,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      vi.mocked(projectRepo.updateJoinRequest).mockResolvedValue({
        id: 'req-proj-3',
        project_id: projectId,
        user_id: requesterId,
        status: 'REJECTED',
      } as any);

      const result = await projectService.resolveJoinRequest(
        projectId,
        'req-proj-3',
        'REJECTED',
        callerOwnerId
      );

      expect(result.status).toBe('REJECTED');
      expect(projectRepo.addMember).not.toHaveBeenCalled();
      expect(emitToUser).not.toHaveBeenCalledWith(
        expect.anything(),
        WS_EVENTS.PROJECT_MEMBERSHIP_ACCEPTED,
        expect.anything()
      );
    });

    it('does NOT emit project.membership.accepted if database persistence throws', async () => {
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(projectRepo.findJoinRequestById).mockResolvedValue({
        id: 'req-proj-4',
        project_id: projectId,
        user_id: requesterId,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      vi.mocked(projectRepo.updateJoinRequest).mockResolvedValue({
        id: 'req-proj-4',
        project_id: projectId,
        user_id: requesterId,
        status: 'APPROVED',
      } as any);
      // Simulate database failure during addMember
      vi.mocked(projectRepo.addMember).mockRejectedValue(new Error('DB connection lost'));

      await expect(
        projectService.resolveJoinRequest(projectId, 'req-proj-4', 'APPROVED', callerOwnerId)
      ).rejects.toThrow('DB connection lost');

      expect(emitToUser).not.toHaveBeenCalledWith(
        expect.anything(),
        WS_EVENTS.PROJECT_MEMBERSHIP_ACCEPTED,
        expect.anything()
      );
    });

    it('rejects with 403 if caller is regular MEMBER and does not emit event', async () => {
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');

      await expect(
        projectService.resolveJoinRequest(projectId, 'req-proj-5', 'APPROVED', callerMemberId)
      ).rejects.toThrow(/Only project OWNER or ADMIN/);

      expect(projectRepo.updateJoinRequest).not.toHaveBeenCalled();
      expect(emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('Team Join Request Acceptance', () => {
    it('emits team.membership.accepted to the requester when accepted by OWNER or ADMIN', async () => {
      vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(joinRepo.findRequestById).mockResolvedValue({
        id: 'req-team-1',
        team_id: teamId,
        user_id: requesterId,
        status: 'PENDING',
      } as any);
      vi.mocked(teamRepo.findTeamById).mockResolvedValue({
        id: teamId,
        name: teamName,
        project_id: projectId,
      } as any);
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
      vi.mocked(joinRepo.approveRequest).mockResolvedValue({
        request: { id: 'req-team-1', status: 'APPROVED' } as any,
        userId: requesterId,
      });

      const result = await teamJoinService.updateJoinRequest(
        callerOwnerId,
        teamId,
        'req-team-1',
        { status: 'APPROVED' }
      );

      expect(result.status).toBe('APPROVED');
      expect(joinRepo.approveRequest).toHaveBeenCalledWith('req-team-1', teamId);

      // Verify emitToUser was called for team.membership.accepted with complete payload
      expect(emitToUser).toHaveBeenCalledWith(
        requesterId,
        WS_EVENTS.TEAM_MEMBERSHIP_ACCEPTED,
        {
          teamId,
          projectId,
          teamName,
          userId: requesterId,
        }
      );

      // Verify no emission to unrelated user
      expect(emitToUser).not.toHaveBeenCalledWith(
        unrelatedUserId,
        WS_EVENTS.TEAM_MEMBERSHIP_ACCEPTED,
        expect.anything()
      );
    });

    it('does NOT emit team.membership.accepted when join request is REJECTED', async () => {
      vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(joinRepo.findRequestById).mockResolvedValue({
        id: 'req-team-2',
        team_id: teamId,
        user_id: requesterId,
        status: 'PENDING',
      } as any);
      vi.mocked(joinRepo.rejectRequest).mockResolvedValue({
        id: 'req-team-2',
        status: 'REJECTED',
      } as any);

      const result = await teamJoinService.updateJoinRequest(
        callerOwnerId,
        teamId,
        'req-team-2',
        { status: 'REJECTED' }
      );

      expect(result.status).toBe('REJECTED');
      expect(joinRepo.approveRequest).not.toHaveBeenCalled();
      expect(emitToUser).not.toHaveBeenCalledWith(
        expect.anything(),
        WS_EVENTS.TEAM_MEMBERSHIP_ACCEPTED,
        expect.anything()
      );
    });

    it('does NOT emit team.membership.accepted if database persistence throws', async () => {
      vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(joinRepo.findRequestById).mockResolvedValue({
        id: 'req-team-3',
        team_id: teamId,
        user_id: requesterId,
        status: 'PENDING',
      } as any);
      vi.mocked(teamRepo.findTeamById).mockResolvedValue({
        id: teamId,
        name: teamName,
        project_id: projectId,
      } as any);
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
      // Simulate DB error during approveRequest
      vi.mocked(joinRepo.approveRequest).mockRejectedValue(new Error('Transaction rolled back'));

      await expect(
        teamJoinService.updateJoinRequest(callerOwnerId, teamId, 'req-team-3', { status: 'APPROVED' })
      ).rejects.toThrow('Transaction rolled back');

      expect(emitToUser).not.toHaveBeenCalledWith(
        expect.anything(),
        WS_EVENTS.TEAM_MEMBERSHIP_ACCEPTED,
        expect.anything()
      );
    });

    it('rejects with 403 if requester is not a member of the parent project', async () => {
      vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
      vi.mocked(joinRepo.findRequestById).mockResolvedValue({
        id: 'req-team-4',
        team_id: teamId,
        user_id: requesterId,
        status: 'PENDING',
      } as any);
      vi.mocked(teamRepo.findTeamById).mockResolvedValue({
        id: teamId,
        name: teamName,
        project_id: projectId,
      } as any);
      // Requester is not in parent project
      vi.mocked(projectRepo.findMemberRole).mockResolvedValue(null);

      await expect(
        teamJoinService.updateJoinRequest(callerOwnerId, teamId, 'req-team-4', { status: 'APPROVED' })
      ).rejects.toThrow(/User is not a member of the project/);

      expect(joinRepo.approveRequest).not.toHaveBeenCalled();
      expect(emitToUser).not.toHaveBeenCalledWith(
        expect.anything(),
        WS_EVENTS.TEAM_MEMBERSHIP_ACCEPTED,
        expect.anything()
      );
    });
  });
});
