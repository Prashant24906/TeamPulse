import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/error.middleware';

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
  removeMember: vi.fn(),
  removeProjectMemberAtomic: vi.fn(),
}));

vi.mock('../repositories/team.repository', () => ({
  removeAllTeamMembershipsInProject: vi.fn(),
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

vi.mock('../websocket/rooms', () => ({
  evictUserFromTeamRooms: vi.fn().mockResolvedValue(undefined),
  evictUserFromProjectRoom: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import * as projectRepo from '../repositories/project.repository';
import * as teamRepo from '../repositories/team.repository';
import { emitToUser, emitToTeam } from '../websocket/emit';
import { evictUserFromTeamRooms } from '../websocket/rooms';
import { WS_EVENTS } from '../websocket/events';
import * as projectService from './project.service';

describe('Leave Project Functionality', () => {
  const projectId = 'proj-123';
  const ownerId = 'user-owner';
  const adminId = 'user-admin';
  const memberId = 'user-member';
  const nonMemberId = 'user-outsider';

  const mockProject = {
    id: projectId,
    name: 'TeamPulse Platform',
    created_by: ownerId,
    created_at: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. ADMIN can leave a project ──────────────────────────────────────────
  it('1. ADMIN can successfully leave a project', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('ADMIN');
    vi.mocked(projectRepo.removeProjectMemberAtomic).mockResolvedValue(['team-a', 'team-b']);

    const affectedTeams = await projectService.leaveProject(adminId, projectId);

    expect(affectedTeams).toEqual(['team-a', 'team-b']);
    expect(projectRepo.removeProjectMemberAtomic).toHaveBeenCalledWith(projectId, adminId);

    // Verifies events emitted to teams
    expect(emitToTeam).toHaveBeenCalledWith('team-a', WS_EVENTS.TEAM_MEMBER_REMOVED, {
      teamId: 'team-a',
      userId: adminId,
    });
    expect(emitToTeam).toHaveBeenCalledWith('team-b', WS_EVENTS.TEAM_MEMBER_REMOVED, {
      teamId: 'team-b',
      userId: adminId,
    });

    // Verifies socket room eviction
    expect(evictUserFromTeamRooms).toHaveBeenCalledWith(adminId, ['team-a', 'team-b']);

    // Verifies notification to user's other sessions
    expect(emitToUser).toHaveBeenCalledWith(adminId, WS_EVENTS.PROJECT_MEMBER_REMOVED, {
      projectId,
      userId: adminId,
    });
  });

  // ── 2. MEMBER can leave a project ─────────────────────────────────────────
  it('2. MEMBER can successfully leave a project', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(projectRepo.removeProjectMemberAtomic).mockResolvedValue(['team-c']);

    const affectedTeams = await projectService.leaveProject(memberId, projectId);

    expect(affectedTeams).toEqual(['team-c']);
    expect(projectRepo.removeProjectMemberAtomic).toHaveBeenCalledWith(projectId, memberId);
    expect(emitToTeam).toHaveBeenCalledWith('team-c', WS_EVENTS.TEAM_MEMBER_REMOVED, {
      teamId: 'team-c',
      userId: memberId,
    });
    expect(evictUserFromTeamRooms).toHaveBeenCalledWith(memberId, ['team-c']);
    expect(emitToUser).toHaveBeenCalledWith(memberId, WS_EVENTS.PROJECT_MEMBER_REMOVED, {
      projectId,
      userId: memberId,
    });
  });

  // ── 3. OWNER cannot leave without transferring ownership ──────────────────
  it('3. OWNER cannot leave without transferring ownership first', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('OWNER');

    await expect(projectService.leaveProject(ownerId, projectId)).rejects.toThrow(
      'Project OWNER cannot leave without transferring ownership first'
    );

    expect(projectRepo.removeProjectMemberAtomic).not.toHaveBeenCalled();
    expect(teamRepo.removeAllTeamMembershipsInProject).not.toHaveBeenCalled();
    expect(emitToTeam).not.toHaveBeenCalled();
    expect(evictUserFromTeamRooms).not.toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });

  // ── 4. Non-member cannot leave a project ──────────────────────────────────
  it('4. Non-member receives 403 when attempting to leave', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue(null);

    await expect(projectService.leaveProject(nonMemberId, projectId)).rejects.toThrow(
      'You are not a member of this project'
    );

    expect(projectRepo.removeProjectMemberAtomic).not.toHaveBeenCalled();
    expect(emitToTeam).not.toHaveBeenCalled();
  });

  // ── 5. Leaving removes all associated team memberships atomically ──────────
  it('5. Leaving removes all team memberships and project membership atomically', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
    const associatedTeams = ['team-1', 'team-2', 'team-3'];
    vi.mocked(projectRepo.removeProjectMemberAtomic).mockResolvedValue(associatedTeams);

    const result = await projectService.leaveProject(memberId, projectId);

    expect(result).toEqual(associatedTeams);
    expect(projectRepo.removeProjectMemberAtomic).toHaveBeenCalledOnce();
    expect(projectRepo.removeProjectMemberAtomic).toHaveBeenCalledWith(projectId, memberId);
  });

  // ── 6. Other project members remain unaffected ─────────────────────────────
  it('6. Only the leaving user is removed; other project members remain unaffected', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(projectRepo.removeProjectMemberAtomic).mockResolvedValue(['team-1']);

    await projectService.leaveProject(memberId, projectId);

    // Ensure removeProjectMemberAtomic was only called for the leaving user
    expect(projectRepo.removeProjectMemberAtomic).toHaveBeenCalledWith(projectId, memberId);
    expect(projectRepo.removeProjectMemberAtomic).not.toHaveBeenCalledWith(projectId, ownerId);
    expect(projectRepo.removeProjectMemberAtomic).not.toHaveBeenCalledWith(projectId, adminId);
  });

  // ── 7. Former member cannot access project resources ───────────────────────
  it('7. Former member cannot access project after leaving', async () => {
    // When the user has left, findMemberRole returns null
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue(null);

    await expect(projectService.getProject(memberId, projectId)).rejects.toThrow(
      'You are not a member of this project'
    );
  });

  // ── 8. Socket.IO room access is revoked ───────────────────────────────────
  it('8. Revokes user access from all team rooms in the project', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
    const teamIds = ['team-x', 'team-y'];
    vi.mocked(projectRepo.removeProjectMemberAtomic).mockResolvedValue(teamIds);

    await projectService.leaveProject(memberId, projectId);

    expect(evictUserFromTeamRooms).toHaveBeenCalledOnce();
    expect(evictUserFromTeamRooms).toHaveBeenCalledWith(memberId, teamIds);
  });

  // ── 9. Failed transactions do not partially remove memberships ────────────
  it('9. Database error during atomic deletion aborts without emitting events or evicting sockets', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(projectRepo.removeProjectMemberAtomic).mockRejectedValue(
      new Error('Transaction rolled back: deadlock detected')
    );

    await expect(projectService.leaveProject(memberId, projectId)).rejects.toThrow(
      'Transaction rolled back: deadlock detected'
    );

    expect(emitToTeam).not.toHaveBeenCalled();
    expect(evictUserFromTeamRooms).not.toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
  });

  // ── 10. Fallback support if removeProjectMemberAtomic is not directly defined
  it('10. Falls back to removeAllTeamMembershipsInProject and removeMember if repository method is separated', async () => {
    vi.mocked(projectRepo.findMemberRole).mockResolvedValue('ADMIN');
    // Temporarily unset removeProjectMemberAtomic
    const origAtomic = projectRepo.removeProjectMemberAtomic;
    (projectRepo as any).removeProjectMemberAtomic = undefined;

    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockResolvedValue(['team-fallback']);
    vi.mocked(projectRepo.removeMember).mockResolvedValue(undefined);

    const affected = await projectService.leaveProject(adminId, projectId);

    expect(affected).toEqual(['team-fallback']);
    expect(teamRepo.removeAllTeamMembershipsInProject).toHaveBeenCalledWith(projectId, adminId);
    expect(projectRepo.removeMember).toHaveBeenCalledWith(projectId, adminId);

    // Restore
    (projectRepo as any).removeProjectMemberAtomic = origAtomic;
  });

  describe('Controller Layer Integration', () => {
    it('removeProjectMember calls leaveProject when callerId === targetUserId', async () => {
      const { removeProjectMember } = await import('../controllers/project.controller');
      const req: any = {
        user: { userId: memberId },
        params: { projectId, userId: memberId },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };
      const next = vi.fn();

      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('MEMBER');
      vi.mocked(projectRepo.removeProjectMemberAtomic).mockResolvedValue(['team-1']);

      await removeProjectMember(req, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('leaveProject controller delegates to leaveProject service and returns 204', async () => {
      const { leaveProject: leaveProjectCtrl } = await import('../controllers/project.controller');
      const req: any = {
        user: { userId: adminId },
        params: { projectId },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };
      const next = vi.fn();

      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('ADMIN');
      vi.mocked(projectRepo.removeProjectMemberAtomic).mockResolvedValue(['team-2']);

      await leaveProjectCtrl(req, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('leaveProject controller forwards error to next() when OWNER attempts to leave', async () => {
      const { leaveProject: leaveProjectCtrl } = await import('../controllers/project.controller');
      const req: any = {
        user: { userId: ownerId },
        params: { projectId },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };
      const next = vi.fn();

      vi.mocked(projectRepo.findMemberRole).mockResolvedValue('OWNER');

      await leaveProjectCtrl(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].message).toContain('Project OWNER cannot leave without transferring ownership first');
    });
  });
});
