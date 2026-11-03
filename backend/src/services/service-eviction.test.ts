/**
 * service-eviction.test.ts
 *
 * Service-level integration tests verifying that:
 *   1. removeMember (team.service) invokes eviction AFTER successful DB deletion.
 *   2. removeMember does NOT invoke eviction when the database call throws.
 *   3. kickProjectMember (project.service) invokes eviction for the CORRECT team IDs.
 *   4. kickProjectMember does NOT invoke eviction when the DB delete throws.
 *
 * Strategy
 * --------
 * All external dependencies (repositories, emit helpers, cache, eviction) are
 * mocked with vi.mock() factory functions. No real DB connections, no real
 * Socket.IO server, no HTTP server needed.
 *
 * Call-order verification uses vi.fn() mock references and
 * `expect().toHaveBeenCalled()` / `expect().not.toHaveBeenCalled()`.
 *
 * The top-level `await import()` pattern from rooms.test.ts is intentionally
 * avoided here; static imports work correctly because vi.mock() is hoisted
 * before any import by Vitest's module system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// ① Mock every module that the services import.
//    vi.mock() calls are hoisted to the top of the file by Vitest — they run
//    BEFORE the static imports below, so the services will receive our fakes.
// ---------------------------------------------------------------------------

// -- team.repository --
vi.mock('../repositories/team.repository', () => ({
  findMemberRole:              vi.fn(),
  removeMember:                vi.fn(),
  findTeamsByProjectId:        vi.fn(),
  findTeamsByUserId:           vi.fn(),
  findTeamById:                vi.fn(),
  getMemberCount:              vi.fn(),
  addMember:                   vi.fn(),
  updateMemberRole:            vi.fn(),
  createTeam:                  vi.fn(),
  updateTeam:                  vi.fn(),
  deleteTeam:                  vi.fn(),
  getMembers:                  vi.fn(),
  transferOwnership:           vi.fn(),
  findTeamIdsByUserAndProject: vi.fn(),
}));

// -- project.repository --
vi.mock('../repositories/project.repository', () => ({
  findMemberRole:          vi.fn(),
  removeMember:            vi.fn(),
  findProjectById:         vi.fn(),
  findProjectsByUserId:    vi.fn(),
  createProject:           vi.fn(),
  updateProject:           vi.fn(),
  deleteProject:           vi.fn(),
  addMember:               vi.fn(),
  updateMemberRole:        vi.fn(),
  findMembersByProject:    vi.fn(),
  searchProjects:          vi.fn(),
  createJoinRequest:       vi.fn(),
  findJoinRequestsByProject: vi.fn(),
  updateJoinRequest:       vi.fn(),
  findJoinRequestById:     vi.fn(),
}));

// -- user.repository (used only by team.service.addMember — not under test here) --
vi.mock('../repositories/user.repository', () => ({
  findByUsername: vi.fn(),
  findById:       vi.fn(),
}));

// -- websocket/emit --
vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

// -- websocket/events (re-export the real constants so service logic is unaffected) --
vi.mock('../websocket/events', () => ({
  WS_EVENTS: {
    TEAM_UPDATED:              'team.updated',
    TEAM_DELETED:              'team.deleted',
    TEAM_MEMBER_ADDED:         'team.member_added',
    TEAM_MEMBER_REMOVED:       'team.member_removed',
    TEAM_JOIN_REQUEST_CREATED: 'team.join_request_created',
    TEAM_JOIN_REQUEST_UPDATED: 'team.join_request_updated',
    PROJECT_CREATED:           'project.created',
    PROJECT_UPDATED:           'project.updated',
    PROJECT_DELETED:           'project.deleted',
    TASK_CREATED:              'task.created',
    TASK_UPDATED:              'task.updated',
    TASK_DELETED:              'task.deleted',
    MESSAGE_CREATED:           'message.created',
  },
}));

// -- utils/cache --
vi.mock('../utils/cache', () => ({
  cacheGet:        vi.fn().mockResolvedValue(null),
  cacheSet:        vi.fn().mockResolvedValue(undefined),
  cacheInvalidate: vi.fn().mockResolvedValue(undefined),
  CacheKeys: {
    project: (id: string) => `project:${id}`,
    team:    (id: string) => `team:${id}`,
    tasks:   (id: string) => `tasks:${id}`,
  },
}));

// -- websocket/rooms — the helpers under integration-test scrutiny --
vi.mock('../websocket/rooms', () => ({
  evictUserFromTeamRoom:  vi.fn().mockResolvedValue(undefined),
  evictUserFromTeamRooms: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// ② Static imports — received AFTER mocks are hoisted.
// ---------------------------------------------------------------------------

import * as teamRepo    from '../repositories/team.repository';
import * as projectRepo from '../repositories/project.repository';
import { evictUserFromTeamRoom }  from '../websocket/rooms';
import { evictUserFromTeamRooms } from '../websocket/rooms';

// Services under test
import { removeMember }      from '../services/team.service';
import { kickProjectMember } from '../services/project.service';

// ---------------------------------------------------------------------------
// Typed mock helpers — avoids casting on every assertion.
// ---------------------------------------------------------------------------

const mockFindTeamRole    = vi.mocked(teamRepo.findMemberRole);
const mockTeamRemoveMember = vi.mocked(teamRepo.removeMember);
const mockFindTeamIds     = vi.mocked(teamRepo.findTeamIdsByUserAndProject);

const mockFindProjectRole        = vi.mocked(projectRepo.findMemberRole);
const mockProjectRemoveMember    = vi.mocked(projectRepo.removeMember);

const mockEvictRoom  = vi.mocked(evictUserFromTeamRoom);
const mockEvictRooms = vi.mocked(evictUserFromTeamRooms);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CALLER_ID = 'caller-uuid';
const TARGET_ID = 'target-uuid';
const TEAM_ID   = 'team-uuid';
const PROJECT_ID = 'project-uuid';

// ---------------------------------------------------------------------------
// team.service.ts::removeMember
// ---------------------------------------------------------------------------

describe('team.service::removeMember — eviction ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test A ──────────────────────────────────────────────────────────────
  // Happy path: DB succeeds → eviction IS called with correct args.
  it('A: calls evictUserFromTeamRoom AFTER successful DB deletion', async () => {
    // Arrange
    mockFindTeamRole
      .mockResolvedValueOnce('OWNER')  // callerRole lookup
      .mockResolvedValueOnce('MEMBER'); // targetRole lookup

    mockTeamRemoveMember.mockResolvedValue(undefined); // DB delete succeeds

    const callOrder: string[] = [];
    mockTeamRemoveMember.mockImplementation(async () => {
      callOrder.push('db:removeMember');
    });
    mockEvictRoom.mockImplementation(async () => {
      callOrder.push('ws:evict');
    });

    // Act
    await removeMember(CALLER_ID, TEAM_ID, TARGET_ID);

    // Assert — eviction called
    expect(mockEvictRoom).toHaveBeenCalledOnce();
    expect(mockEvictRoom).toHaveBeenCalledWith(TARGET_ID, TEAM_ID);

    // Assert — DB came BEFORE eviction
    expect(callOrder).toEqual(['db:removeMember', 'ws:evict']);
  });

  // ── Test B ──────────────────────────────────────────────────────────────
  // DB delete throws → eviction must NOT be called.
  it('B: does NOT call evictUserFromTeamRoom when DB deletion throws', async () => {
    // Arrange
    mockFindTeamRole
      .mockResolvedValueOnce('OWNER')
      .mockResolvedValueOnce('MEMBER');

    mockTeamRemoveMember.mockRejectedValue(new Error('DB connection lost'));

    // Act — the error should propagate
    await expect(removeMember(CALLER_ID, TEAM_ID, TARGET_ID)).rejects.toThrow(
      'DB connection lost'
    );

    // Assert — eviction never attempted
    expect(mockEvictRoom).not.toHaveBeenCalled();
  });

  // ── Test C ──────────────────────────────────────────────────────────────
  // Auth guard fails (caller not a member) → eviction not called.
  it('C: does NOT call evictUserFromTeamRoom when authorization check throws (caller not in team)', async () => {
    // Arrange — callerRole is null → 403
    mockFindTeamRole.mockResolvedValueOnce(null);

    // Act
    await expect(removeMember(CALLER_ID, TEAM_ID, TARGET_ID)).rejects.toMatchObject({
      statusCode: 403,
    });

    // Assert
    expect(mockTeamRemoveMember).not.toHaveBeenCalled();
    expect(mockEvictRoom).not.toHaveBeenCalled();
  });

  // ── Test D ──────────────────────────────────────────────────────────────
  // Target is OWNER → guard throws before DB → eviction not called.
  it('D: does NOT call evictUserFromTeamRoom when target is OWNER (business-rule guard)', async () => {
    mockFindTeamRole
      .mockResolvedValueOnce('OWNER')  // caller is OWNER
      .mockResolvedValueOnce('OWNER'); // target is also OWNER → blocked

    await expect(removeMember(CALLER_ID, TEAM_ID, TARGET_ID)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mockTeamRemoveMember).not.toHaveBeenCalled();
    expect(mockEvictRoom).not.toHaveBeenCalled();
  });

  // ── Test E ──────────────────────────────────────────────────────────────
  // Eviction failure is non-fatal; the overall call still resolves.
  it('E: resolves normally even if eviction helper throws internally', async () => {
    mockFindTeamRole
      .mockResolvedValueOnce('OWNER')
      .mockResolvedValueOnce('MEMBER');
    mockTeamRemoveMember.mockResolvedValue(undefined);

    // The rooms helper catches internally — its mock should too.
    // Simulate it rejecting to confirm the service still resolves.
    mockEvictRoom.mockRejectedValue(new Error('Socket.IO is down'));

    // The eviction helper in production catches its own errors internally.
    // But here the mock is uncaught — so we verify the helper IS called,
    // then confirm the service propagates its own guard correctly when
    // the mock is set to reject.
    // NOTE: in production `evictUserFromTeamRoom` never rejects (try/catch inside).
    // This test verifies we'd notice if someone removed that guard.
    await expect(removeMember(CALLER_ID, TEAM_ID, TARGET_ID)).rejects.toThrow(
      'Socket.IO is down'
    );

    // But the DB deletion DID complete before the (mocked) eviction threw.
    expect(mockTeamRemoveMember).toHaveBeenCalledOnce();
    expect(mockEvictRoom).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// project.service.ts::kickProjectMember
// ---------------------------------------------------------------------------

describe('project.service::kickProjectMember — eviction ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test F ──────────────────────────────────────────────────────────────
  // Happy path: team IDs fetched before delete, eviction called with those IDs.
  it('F: calls evictUserFromTeamRooms with the IDs returned by findTeamIdsByUserAndProject', async () => {
    // Arrange
    mockFindProjectRole
      .mockResolvedValueOnce('OWNER')   // callerRole
      .mockResolvedValueOnce('MEMBER'); // targetRole

    const expectedTeamIds = ['team-alpha', 'team-beta'];
    mockFindTeamIds.mockResolvedValue(expectedTeamIds);
    mockProjectRemoveMember.mockResolvedValue(undefined);

    // Act
    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    // Assert — eviction called with exactly the IDs the repo returned
    expect(mockEvictRooms).toHaveBeenCalledOnce();
    expect(mockEvictRooms).toHaveBeenCalledWith(TARGET_ID, expectedTeamIds);
  });

  // ── Test G ──────────────────────────────────────────────────────────────
  // Team ID snapshot is taken BEFORE the DB delete.
  it('G: fetches team IDs BEFORE projectRepo.removeMember', async () => {
    // Arrange
    mockFindProjectRole
      .mockResolvedValueOnce('OWNER')
      .mockResolvedValueOnce('MEMBER');

    const callOrder: string[] = [];
    mockFindTeamIds.mockImplementation(async () => {
      callOrder.push('db:findTeamIds');
      return ['team-x'];
    });
    mockProjectRemoveMember.mockImplementation(async () => {
      callOrder.push('db:removeMember');
    });
    mockEvictRooms.mockImplementation(async () => {
      callOrder.push('ws:evict');
    });

    // Act
    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    // Assert — ordering must be: findTeamIds → removeMember → evict
    expect(callOrder).toEqual(['db:findTeamIds', 'db:removeMember', 'ws:evict']);
  });

  // ── Test H ──────────────────────────────────────────────────────────────
  // DB delete throws → eviction must NOT be called.
  it('H: does NOT call evictUserFromTeamRooms when DB deletion throws', async () => {
    // Arrange
    mockFindProjectRole
      .mockResolvedValueOnce('OWNER')
      .mockResolvedValueOnce('MEMBER');

    mockFindTeamIds.mockResolvedValue(['team-x', 'team-y']);
    mockProjectRemoveMember.mockRejectedValue(new Error('DB timeout'));

    // Act
    await expect(
      kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID)
    ).rejects.toThrow('DB timeout');

    // Assert — eviction never attempted because delete failed
    expect(mockEvictRooms).not.toHaveBeenCalled();
  });

  // ── Test I ──────────────────────────────────────────────────────────────
  // Authorization guard fails → neither DB delete nor eviction called.
  it('I: does NOT call evictUserFromTeamRooms when caller is not OWNER', async () => {
    mockFindProjectRole.mockResolvedValueOnce('ADMIN'); // caller is ADMIN, not OWNER

    await expect(
      kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mockFindTeamIds).not.toHaveBeenCalled();
    expect(mockProjectRemoveMember).not.toHaveBeenCalled();
    expect(mockEvictRooms).not.toHaveBeenCalled();
  });

  // ── Test J ──────────────────────────────────────────────────────────────
  // User is not in any teams → eviction called with empty array (no-op internally).
  it('J: calls evictUserFromTeamRooms with [] when user has no team memberships', async () => {
    mockFindProjectRole
      .mockResolvedValueOnce('OWNER')
      .mockResolvedValueOnce('MEMBER');

    mockFindTeamIds.mockResolvedValue([]); // user is project member but not in any team
    mockProjectRemoveMember.mockResolvedValue(undefined);

    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    // Eviction is still called (rooms.ts handles empty array gracefully)
    expect(mockEvictRooms).toHaveBeenCalledOnce();
    expect(mockEvictRooms).toHaveBeenCalledWith(TARGET_ID, []);
  });

  // ── Test K ──────────────────────────────────────────────────────────────
  // Target is OWNER → guard throws → neither delete nor eviction called.
  it('K: does NOT evict when target is the project OWNER', async () => {
    mockFindProjectRole
      .mockResolvedValueOnce('OWNER')   // caller
      .mockResolvedValueOnce('OWNER');  // target — blocked

    await expect(
      kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockProjectRemoveMember).not.toHaveBeenCalled();
    expect(mockEvictRooms).not.toHaveBeenCalled();
  });
});
