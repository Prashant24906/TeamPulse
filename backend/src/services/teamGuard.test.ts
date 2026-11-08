/**
 * teamGuard.test.ts
 *
 * Tests for assertTeamBelongsToProject and all 14 nested-route service functions
 * that use it.  No real DB; every repository function is mocked with vi.mock().
 *
 * Coverage:
 *  1.  Guard passes  – correct projectId/teamId
 *  2.  Guard fails   – mismatched projectId (team exists but in another project)
 *  3.  Guard fails   – team does not exist
 *  4.  Guard fails   – projectId exists but team belongs to different project
 *  5.  All 14 service entry-points reject mismatched IDs before any auth check
 *  6.  Standalone paths (no projectId) are unaffected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock every external dependency so tests run without a real DB / Redis
// ---------------------------------------------------------------------------

vi.mock('../repositories/team.repository', () => ({
  findTeamById:     vi.fn(),
  findMemberRole:   vi.fn(),
  getMemberCount:   vi.fn(),
  getMembers:       vi.fn(),
  updateTeam:       vi.fn(),
  deleteTeam:       vi.fn(),
  addMember:        vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember:     vi.fn(),
  transferOwnership: vi.fn(),
  findTeamIdsByUserAndProject: vi.fn(),
}));

vi.mock('../repositories/task.repository', () => ({
  findTaskById:       vi.fn(),
  findTasksByTeamId:  vi.fn(),
  createTask:         vi.fn(),
  updateTask:         vi.fn(),
  deleteTask:         vi.fn(),
}));

vi.mock('../repositories/teamJoinRequest.repository', () => ({
  searchTeams:       vi.fn(),
  findPendingRequest: vi.fn(),
  createJoinRequest: vi.fn(),
  getJoinRequests:   vi.fn(),
  findRequestById:   vi.fn(),
  approveRequest:    vi.fn(),
  rejectRequest:     vi.fn(),
}));

vi.mock('../repositories/teamMessage.repository', () => ({
  getMessages:   vi.fn(),
  createMessage: vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
  findProjectById: vi.fn(),
  findMemberRole:  vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
  findByUsername: vi.fn(),
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

vi.mock('../websocket/rooms', () => ({
  evictUserFromTeamRoom:  vi.fn(),
  evictUserFromTeamRooms: vi.fn(),
}));

vi.mock('../utils/cache', () => ({
  cacheGet:        vi.fn().mockResolvedValue(null),
  cacheSet:        vi.fn(),
  cacheInvalidate: vi.fn(),
  CacheKeys:       { team: (id: string) => `team:${id}` },
}));

vi.mock('../jobs/queues/notification.queue', () => ({
  scheduleTaskDeadlineJob: vi.fn(),
  removeTaskDeadlineJob:   vi.fn(),
}));

vi.mock('../config/redis', () => ({
  isRedisReady: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Import modules under test (after mocks are registered)
// ---------------------------------------------------------------------------

import * as teamRepo    from '../repositories/team.repository';
import * as taskRepo    from '../repositories/task.repository';
import * as joinRepo    from '../repositories/teamJoinRequest.repository';
import * as msgRepo     from '../repositories/teamMessage.repository';

import { assertTeamBelongsToProject } from './team.guard';
import * as teamService    from './team.service';
import * as taskService    from './task.service';
import * as joinService    from './teamJoinRequest.service';
import * as messageService from './teamMessage.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const PROJECT_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const TEAM_A    = 'cccccccc-0000-0000-0000-000000000000'; // belongs to PROJECT_A
const TEAM_B    = 'dddddddd-0000-0000-0000-000000000000'; // belongs to PROJECT_B
const USER_ID   = 'eeeeeeee-0000-0000-0000-000000000000';
const TARGET_ID = 'ffffffff-0000-0000-0000-000000000000';
const REQ_ID    = '11111111-0000-0000-0000-000000000000';

const teamARecord = { id: TEAM_A, project_id: PROJECT_A, name: 'Alpha', max_size: 10 };
const teamBRecord = { id: TEAM_B, project_id: PROJECT_B, name: 'Beta',  max_size: 10 };

// ---------------------------------------------------------------------------
// Helper: reset all mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. assertTeamBelongsToProject — guard unit tests
// ===========================================================================

describe('assertTeamBelongsToProject', () => {
  it('resolves when team exists and projectId matches', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
    await expect(assertTeamBelongsToProject(TEAM_A, PROJECT_A)).resolves.toBeUndefined();
  });

  it('throws 404 when team does not exist', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(null);
    await expect(assertTeamBelongsToProject(TEAM_A, PROJECT_A))
      .rejects.toMatchObject({ statusCode: 404, message: 'Team not found' });
  });

  it('throws 404 when team belongs to a different project', async () => {
    // Team-B is in Project-B; we supply Project-A → mismatch
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamBRecord as any);
    await expect(assertTeamBelongsToProject(TEAM_B, PROJECT_A))
      .rejects.toMatchObject({ statusCode: 404, message: 'Team not found' });
  });

  it('throws 404 for a nonexistent projectId (team maps to different project)', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
    const FAKE_PROJECT = '00000000-0000-0000-0000-000000000000';
    await expect(assertTeamBelongsToProject(TEAM_A, FAKE_PROJECT))
      .rejects.toMatchObject({ statusCode: 404, message: 'Team not found' });
  });
});

// ===========================================================================
// Shared helper: builds the "mismatch" setup
//   Team-B (project_id = PROJECT_B) is queried with PROJECT_A in the URL
// ===========================================================================

function setupMismatch() {
  vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamBRecord as any);
}

function setupMatch() {
  vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
  vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER');
  vi.mocked(teamRepo.getMemberCount).mockResolvedValue(1);
  vi.mocked(teamRepo.getMembers).mockResolvedValue([]);
}

// ===========================================================================
// 2. team.service — all 7 protected operations
// ===========================================================================

describe('team.service — projectId/teamId mismatch → 404', () => {
  const MISMATCH = { statusCode: 404, message: 'Team not found' };

  beforeEach(setupMismatch);

  it('getTeam rejects with 404', async () => {
    await expect(teamService.getTeam(USER_ID, TEAM_B, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('updateTeam rejects with 404', async () => {
    await expect(teamService.updateTeam(USER_ID, TEAM_B, { name: 'x' }, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('deleteTeam rejects with 404', async () => {
    await expect(teamService.deleteTeam(USER_ID, TEAM_B, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('getMembers rejects with 404', async () => {
    await expect(teamService.getMembers(USER_ID, TEAM_B, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('addMember rejects with 404', async () => {
    await expect(teamService.addMember(USER_ID, TEAM_B, { userId: TARGET_ID, role: 'MEMBER' }, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('updateMemberRole rejects with 404', async () => {
    await expect(teamService.updateMemberRole(USER_ID, TEAM_B, TARGET_ID, { role: 'ADMIN' }, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('removeMember rejects with 404', async () => {
    await expect(teamService.removeMember(USER_ID, TEAM_B, TARGET_ID, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('transferOwnership rejects with 404', async () => {
    await expect(teamService.transferOwnership(USER_ID, TEAM_B, { newOwnerId: TARGET_ID }, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });
});

// ===========================================================================
// 3. task.service — 2 operations
// ===========================================================================

describe('task.service — projectId/teamId mismatch → 404', () => {
  const MISMATCH = { statusCode: 404, message: 'Team not found' };

  beforeEach(setupMismatch);

  it('createTask rejects with 404', async () => {
    await expect(
      taskService.createTask(USER_ID, TEAM_B, { name: 't', status: 'TODO', priority: 'MEDIUM' }, PROJECT_A)
    ).rejects.toMatchObject(MISMATCH);
  });

  it('getTasksByTeam rejects with 404', async () => {
    await expect(taskService.getTasksByTeam(USER_ID, TEAM_B, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });
});

// ===========================================================================
// 4. teamJoinRequest.service — 3 operations
// ===========================================================================

describe('teamJoinRequest.service — projectId/teamId mismatch → 404', () => {
  const MISMATCH = { statusCode: 404, message: 'Team not found' };

  beforeEach(setupMismatch);

  it('createJoinRequest rejects with 404', async () => {
    await expect(joinService.createJoinRequest(USER_ID, TEAM_B, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('getJoinRequests rejects with 404', async () => {
    await expect(joinService.getJoinRequests(USER_ID, TEAM_B, PROJECT_A))
      .rejects.toMatchObject(MISMATCH);
  });

  it('updateJoinRequest rejects with 404', async () => {
    await expect(
      joinService.updateJoinRequest(USER_ID, TEAM_B, REQ_ID, { status: 'APPROVED' }, PROJECT_A)
    ).rejects.toMatchObject(MISMATCH);
  });
});

// ===========================================================================
// 5. teamMessage.service — 2 operations
// ===========================================================================

describe('teamMessage.service — projectId/teamId mismatch → 404', () => {
  const MISMATCH = { statusCode: 404, message: 'Team not found' };

  beforeEach(setupMismatch);

  it('getMessages rejects with 404', async () => {
    await expect(
      messageService.getMessages(USER_ID, TEAM_B, { limit: 50 }, PROJECT_A)
    ).rejects.toMatchObject(MISMATCH);
  });

  it('sendMessage rejects with 404', async () => {
    await expect(
      messageService.sendMessage(USER_ID, TEAM_B, { content: 'hi' }, PROJECT_A)
    ).rejects.toMatchObject(MISMATCH);
  });
});

// ===========================================================================
// 6. Standalone routes (no projectId) still work — guard is not invoked
// ===========================================================================

describe('team.service — standalone routes (no projectId) skip guard', () => {
  it('getMembers proceeds to membership check when projectId is absent', async () => {
    // Guard must NOT be called (findTeamById only called for cache/membership checks, not guard)
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(teamRepo.getMembers).mockResolvedValue([]);

    // Should resolve to [] without a 404
    await expect(teamService.getMembers(USER_ID, TEAM_A))
      .resolves.toEqual([]);
  });

  it('getTasksByTeam proceeds when projectId is absent', async () => {
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(taskRepo.findTasksByTeamId).mockResolvedValue([]);

    await expect(taskService.getTasksByTeam(USER_ID, TEAM_A))
      .resolves.toEqual([]);
  });

  it('createJoinRequest proceeds when projectId is absent', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue(null); // not already a member
    vi.mocked(joinRepo.findPendingRequest).mockResolvedValue(null);
    vi.mocked(teamRepo.getMemberCount).mockResolvedValue(1);
    vi.mocked(joinRepo.createJoinRequest).mockResolvedValue({ id: REQ_ID, team_id: TEAM_A, user_id: USER_ID, status: 'PENDING' } as any);

    await expect(joinService.createJoinRequest(USER_ID, TEAM_A))
      .resolves.toMatchObject({ id: REQ_ID });
  });
});

// ===========================================================================
// 7. Guard runs BEFORE auth checks (mismatch returns 404, not 403)
// ===========================================================================

describe('guard runs before auth checks', () => {
  it('mismatch with non-member caller returns 404 (not 403)', async () => {
    // Team-B belongs to PROJECT_B; caller is NOT even a member of Team-B
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamBRecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue(null); // not a member

    await expect(teamService.updateTeam(USER_ID, TEAM_B, { name: 'x' }, PROJECT_A))
      .rejects.toMatchObject({ statusCode: 404 }); // guard fires first → 404, not 403
  });

  it('mismatch with OWNER caller returns 404 (not 403 or 200)', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamBRecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('OWNER'); // would pass auth...

    // ...but guard fires first
    await expect(teamService.deleteTeam(USER_ID, TEAM_B, PROJECT_A))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

// ===========================================================================
// 8. Correct projectId/teamId pair — operations proceed past the guard
// ===========================================================================

describe('correct projectId/teamId — guard passes, operation proceeds', () => {
  it('getMembers returns member list', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(teamRepo.getMembers).mockResolvedValue([{ userId: USER_ID, role: 'MEMBER' }] as any);

    const result = await teamService.getMembers(USER_ID, TEAM_A, PROJECT_A);
    expect(result).toHaveLength(1);
  });

  it('getTasksByTeam returns tasks', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(taskRepo.findTasksByTeamId).mockResolvedValue([{ id: 't1' }] as any);

    const result = await taskService.getTasksByTeam(USER_ID, TEAM_A, PROJECT_A);
    expect(result).toHaveLength(1);
  });

  it('getMessages returns messages', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('MEMBER');
    vi.mocked(msgRepo.getMessages).mockResolvedValue([{ id: 'm1' }] as any);

    const result = await messageService.getMessages(USER_ID, TEAM_A, { limit: 50 }, PROJECT_A);
    expect(result).toHaveLength(1);
  });

  it('getJoinRequests returns request list', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamARecord as any);
    vi.mocked(teamRepo.findMemberRole).mockResolvedValue('ADMIN');
    vi.mocked(joinRepo.getJoinRequests).mockResolvedValue([{ id: REQ_ID }] as any);

    const result = await joinService.getJoinRequests(USER_ID, TEAM_A, PROJECT_A);
    expect(result).toHaveLength(1);
  });
});

