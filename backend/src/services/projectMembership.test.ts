/**
 * projectMembership.test.ts
 *
 * Tests for Issue 4 — Enforce Project Membership for Team Members.
 *
 * Coverage:
 *  A. team.service::addMember
 *     1. Succeeds when target IS a project member
 *     2. Rejects 403 when target is NOT a project member
 *     3. Project membership check uses team's project_id from DB (not client-supplied)
 *     4. Existing-member check (409) still fires after project-membership check
 *     5. max_size check (400) still fires after project-membership check
 *
 *  B. teamJoinRequest.service::updateJoinRequest — APPROVED path
 *     6. Succeeds when requester IS a project member
 *     7. Rejects 403 when requester is NOT a project member
 *     8. REJECTED path does NOT perform the project membership check
 *
 *  C. project.service::kickProjectMember — cascade team membership cleanup
 *     9.  Removes team memberships in the kicked project
 *     10. Does NOT remove team memberships in other projects
 *     11. Emits TEAM_MEMBER_REMOVED for each team affected
 *     12. Calls evictUserFromTeamRooms with the correct team IDs
 *     13. Project membership not removed when team-cleanup step throws
 *     14. User with no team memberships still has project membership removed
 *     15. OWNER cannot be kicked (existing guard preserved)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports so Vitest can hoist them
// ---------------------------------------------------------------------------

vi.mock('../repositories/team.repository', () => ({
  findTeamById:                      vi.fn(),
  findMemberRole:                    vi.fn(),
  getMemberCount:                    vi.fn(),
  getMembers:                        vi.fn(),
  createTeam:                        vi.fn(),
  updateTeam:                        vi.fn(),
  deleteTeam:                        vi.fn(),
  addMember:                         vi.fn(),
  updateMemberRole:                  vi.fn(),
  removeMember:                      vi.fn(),
  transferOwnership:                 vi.fn(),
  findTeamIdsByUserAndProject:       vi.fn(),
  removeAllTeamMembershipsInProject: vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
  findMemberRole:            vi.fn(),
  findProjectById:           vi.fn(),
  findProjectsByUserId:      vi.fn(),
  createProject:             vi.fn(),
  updateProject:             vi.fn(),
  deleteProject:             vi.fn(),
  addMember:                 vi.fn(),
  removeMember:              vi.fn(),
  updateMemberRole:          vi.fn(),
  findMembersByProject:      vi.fn(),
  searchProjects:            vi.fn(),
  createJoinRequest:         vi.fn(),
  findJoinRequestsByProject: vi.fn(),
  updateJoinRequest:         vi.fn(),
  findJoinRequestById:       vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
  findByUsername: vi.fn(),
  findById:       vi.fn(),
}));

vi.mock('../repositories/teamJoinRequest.repository', () => ({
  searchTeams:        vi.fn(),
  findPendingRequest: vi.fn(),
  createJoinRequest:  vi.fn(),
  getJoinRequests:    vi.fn(),
  findRequestById:    vi.fn(),
  approveRequest:     vi.fn(),
  rejectRequest:      vi.fn(),
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

vi.mock('../websocket/events', () => ({
  WS_EVENTS: {
    TEAM_UPDATED:               'team.updated',
    TEAM_DELETED:               'team.deleted',
    TEAM_MEMBER_ADDED:          'team.member_added',
    TEAM_MEMBER_REMOVED:        'team.member_removed',
    TEAM_JOIN_REQUEST_CREATED:  'team.join_request_created',
    TEAM_JOIN_REQUEST_UPDATED:  'team.join_request_updated',
    TEAM_OWNERSHIP_TRANSFERRED: 'team.ownership_transferred',
    PROJECT_CREATED:            'project.created',
    PROJECT_UPDATED:            'project.updated',
    PROJECT_DELETED:            'project.deleted',
    TASK_CREATED:               'task.created',
    TASK_UPDATED:               'task.updated',
    TASK_DELETED:               'task.deleted',
    MESSAGE_CREATED:            'message.created',
  },
}));

vi.mock('../websocket/rooms', () => ({
  evictUserFromTeamRoom:  vi.fn().mockResolvedValue(undefined),
  evictUserFromTeamRooms: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/cache', () => ({
  cacheGet:        vi.fn().mockResolvedValue(null),
  cacheSet:        vi.fn().mockResolvedValue(undefined),
  cacheInvalidate: vi.fn().mockResolvedValue(undefined),
  CacheKeys: {
    project: (id: string) => `project:${id}`,
    team:    (id: string) => `team:${id}`,
  },
}));

vi.mock('../config/redis', () => ({
  isRedisReady: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// ---------------------------------------------------------------------------

import * as teamRepo    from '../repositories/team.repository';
import * as projectRepo from '../repositories/project.repository';
import * as joinRepo    from '../repositories/teamJoinRequest.repository';
import { emitToTeam }              from '../websocket/emit';
import { evictUserFromTeamRooms }  from '../websocket/rooms';

import { addMember }                        from './team.service';
import { updateJoinRequest }               from './teamJoinRequest.service';
import { kickProjectMember }               from './project.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID   = 'proj-aaaa-0000-0000-000000000000';
const OTHER_PRJ_ID = 'proj-bbbb-0000-0000-000000000000';
const TEAM_ID      = 'team-cccc-0000-0000-000000000000';
const CALLER_ID    = 'user-dddd-0000-0000-000000000000'; // OWNER of team / project
const TARGET_ID    = 'user-eeee-0000-0000-000000000000'; // user being operated on
const REQUEST_ID   = 'req-ffff-0000-0000-000000000000';

const teamRecord = {
  id:         TEAM_ID,
  project_id: PROJECT_ID,
  name:       'Alpha Team',
  max_size:   10,
  created_by: CALLER_ID,
  created_at: new Date(),
};

const pendingRequest = {
  id:         REQUEST_ID,
  team_id:    TEAM_ID,
  user_id:    TARGET_ID,
  status:     'PENDING' as const,
  created_at: new Date(),
  updated_at: new Date(),
};

// ---------------------------------------------------------------------------
// Reset ALL mocks before each test to avoid state leakage
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Re-apply always-needed defaults
  vi.mocked(evictUserFromTeamRooms).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helper: sets up team.repository.findMemberRole keyed by userId
// ---------------------------------------------------------------------------

function setupTeamRoles(roles: Record<string, string | null>) {
  vi.mocked(teamRepo.findMemberRole).mockImplementation(
    (_teamId: string, userId: string) => Promise.resolve((roles[userId] ?? null) as any)
  );
}

// ---------------------------------------------------------------------------
// Helper: sets up project.repository.findMemberRole keyed by userId
// ---------------------------------------------------------------------------

function setupProjectRoles(roles: Record<string, string | null>) {
  vi.mocked(projectRepo.findMemberRole).mockImplementation(
    (_projectId: string, userId: string) => Promise.resolve((roles[userId] ?? null) as any)
  );
}

// ===========================================================================
// A. team.service::addMember — project membership enforcement
// ===========================================================================

describe('team.service::addMember — project membership enforcement', () => {

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it('1: succeeds when target IS a member of the team\'s parent project', async () => {
    // Caller is OWNER of team, TARGET is a project member
    setupTeamRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: null }); // TARGET not yet in team
    setupProjectRoles({ [TARGET_ID]: 'MEMBER' });

    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord);
    vi.mocked(teamRepo.getMemberCount).mockResolvedValue(2);
    const added = { team_id: TEAM_ID, user_id: TARGET_ID, role: 'MEMBER' as const };
    vi.mocked(teamRepo.addMember).mockResolvedValue(added);

    const result = await addMember(CALLER_ID, TEAM_ID, { userId: TARGET_ID, role: 'MEMBER' });

    expect(result).toEqual(added);
    expect(teamRepo.addMember).toHaveBeenCalledWith(TEAM_ID, TARGET_ID, 'MEMBER');
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it('2: rejects 403 when target is NOT a member of the team\'s parent project', async () => {
    setupTeamRoles({ [CALLER_ID]: 'OWNER' });
    setupProjectRoles({ [TARGET_ID]: null }); // NOT a project member

    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord);

    await expect(
      addMember(CALLER_ID, TEAM_ID, { userId: TARGET_ID, role: 'MEMBER' })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(teamRepo.addMember).not.toHaveBeenCalled();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('3: derives project_id from DB (findTeamById), not from client-supplied projectId', async () => {
    // We supply PROJECT_ID as the route param but the team actually belongs
    // to a DIFFERENT project. The guard should use team.project_id from DB.
    const teamInOtherProject = { ...teamRecord, project_id: OTHER_PRJ_ID };
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamInOtherProject);

    // Caller is OWNER of team
    setupTeamRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: null });

    // TARGET is a member of PROJECT_ID (the client-supplied one) but NOT of OTHER_PRJ_ID
    vi.mocked(projectRepo.findMemberRole).mockImplementation(
      (projectId: string, userId: string) => {
        if (projectId === OTHER_PRJ_ID && userId === TARGET_ID) return Promise.resolve(null);
        if (projectId === PROJECT_ID   && userId === TARGET_ID) return Promise.resolve('MEMBER' as any);
        return Promise.resolve(null);
      }
    );

    // Even though caller passes PROJECT_ID as the projectId param (guard already passed since
    // we're not using the nested route here), project membership is checked against team.project_id
    await expect(
      addMember(CALLER_ID, TEAM_ID, { userId: TARGET_ID, role: 'MEMBER' })
    ).rejects.toMatchObject({ statusCode: 403 });

    // Confirm we looked up against OTHER_PRJ_ID (team's real project), not PROJECT_ID
    expect(projectRepo.findMemberRole).toHaveBeenCalledWith(OTHER_PRJ_ID, TARGET_ID);
    expect(teamRepo.addMember).not.toHaveBeenCalled();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it('4: rejects 409 when target is already a team member (after project check)', async () => {
    setupTeamRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'MEMBER' }); // already in team
    setupProjectRoles({ [TARGET_ID]: 'MEMBER' }); // IS a project member

    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord);

    await expect(
      addMember(CALLER_ID, TEAM_ID, { userId: TARGET_ID, role: 'MEMBER' })
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(teamRepo.addMember).not.toHaveBeenCalled();
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  it('5: rejects 400 when team is full (after project check)', async () => {
    setupTeamRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: null });
    setupProjectRoles({ [TARGET_ID]: 'MEMBER' });

    const fullTeam = { ...teamRecord, max_size: 3 };
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(fullTeam);
    vi.mocked(teamRepo.getMemberCount).mockResolvedValue(3); // at capacity

    await expect(
      addMember(CALLER_ID, TEAM_ID, { userId: TARGET_ID, role: 'MEMBER' })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(teamRepo.addMember).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. teamJoinRequest.service::updateJoinRequest — project membership check
// ===========================================================================

describe('teamJoinRequest.service::updateJoinRequest — project membership enforcement', () => {

  // ── Test 6 ──────────────────────────────────────────────────────────────
  it('6: APPROVED succeeds when requester IS a project member', async () => {
    setupTeamRoles({ [CALLER_ID]: 'ADMIN' });
    vi.mocked(joinRepo.findRequestById).mockResolvedValue(pendingRequest);
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord);
    setupProjectRoles({ [TARGET_ID]: 'MEMBER' }); // requester IS project member

    const approvedReq = { ...pendingRequest, status: 'APPROVED' as const };
    vi.mocked(joinRepo.approveRequest).mockResolvedValue({
      request: approvedReq,
      userId:  TARGET_ID,
    });

    const result = await updateJoinRequest(
      CALLER_ID, TEAM_ID, REQUEST_ID, { status: 'APPROVED' }
    );

    expect(result).toEqual(approvedReq);
    expect(joinRepo.approveRequest).toHaveBeenCalledWith(REQUEST_ID, TEAM_ID);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  it('7: APPROVED rejects 403 when requester is NOT a project member', async () => {
    setupTeamRoles({ [CALLER_ID]: 'ADMIN' });
    vi.mocked(joinRepo.findRequestById).mockResolvedValue(pendingRequest);
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord);
    setupProjectRoles({ [TARGET_ID]: null }); // NOT a project member

    await expect(
      updateJoinRequest(CALLER_ID, TEAM_ID, REQUEST_ID, { status: 'APPROVED' })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(joinRepo.approveRequest).not.toHaveBeenCalled();
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────
  it('8: REJECTED path does NOT check project membership', async () => {
    setupTeamRoles({ [CALLER_ID]: 'ADMIN' });
    vi.mocked(joinRepo.findRequestById).mockResolvedValue(pendingRequest);

    const rejectedReq = { ...pendingRequest, status: 'REJECTED' as const };
    vi.mocked(joinRepo.rejectRequest).mockResolvedValue(rejectedReq);

    const result = await updateJoinRequest(
      CALLER_ID, TEAM_ID, REQUEST_ID, { status: 'REJECTED' }
    );

    expect(result).toEqual(rejectedReq);
    // teamRepo.findTeamById and projectRepo.findMemberRole must NOT be called
    // in the REJECTED path (no team member is created)
    expect(teamRepo.findTeamById).not.toHaveBeenCalled();
    expect(projectRepo.findMemberRole).not.toHaveBeenCalled();
    expect(joinRepo.approveRequest).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// C. project.service::kickProjectMember — cascade team membership cleanup
// ===========================================================================

describe('project.service::kickProjectMember — cascade team membership cleanup', () => {

  // ── Test 9 ──────────────────────────────────────────────────────────────
  it('9: removes team memberships before removing project membership', async () => {
    setupProjectRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'MEMBER' });

    const teamIds = ['team-x', 'team-y'];
    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockResolvedValue(teamIds);
    vi.mocked(projectRepo.removeMember).mockResolvedValue(undefined);

    const callOrder: string[] = [];
    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockImplementation(async () => {
      callOrder.push('removeTeamMemberships');
      return teamIds;
    });
    vi.mocked(projectRepo.removeMember).mockImplementation(async () => {
      callOrder.push('removeProjectMembership');
    });

    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    expect(callOrder).toEqual(['removeTeamMemberships', 'removeProjectMembership']);
    expect(teamRepo.removeAllTeamMembershipsInProject).toHaveBeenCalledWith(
      PROJECT_ID, TARGET_ID
    );
  });

  // ── Test 10 ──────────────────────────────────────────────────────────────
  it('10: removeAllTeamMembershipsInProject is called with the KICKED project only', async () => {
    setupProjectRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'MEMBER' });

    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockResolvedValue([]);
    vi.mocked(projectRepo.removeMember).mockResolvedValue(undefined);

    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    // Must be called exactly once with PROJECT_ID, not OTHER_PRJ_ID
    expect(teamRepo.removeAllTeamMembershipsInProject).toHaveBeenCalledOnce();
    expect(teamRepo.removeAllTeamMembershipsInProject).toHaveBeenCalledWith(
      PROJECT_ID, TARGET_ID
    );
    expect(teamRepo.removeAllTeamMembershipsInProject).not.toHaveBeenCalledWith(
      OTHER_PRJ_ID, TARGET_ID
    );
  });

  // ── Test 11 ──────────────────────────────────────────────────────────────
  it('11: emits TEAM_MEMBER_REMOVED for each team after DB operations succeed', async () => {
    setupProjectRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'MEMBER' });

    const teamIds = ['team-alpha', 'team-beta', 'team-gamma'];
    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockResolvedValue(teamIds);
    vi.mocked(projectRepo.removeMember).mockResolvedValue(undefined);

    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    expect(emitToTeam).toHaveBeenCalledTimes(teamIds.length);
    for (const teamId of teamIds) {
      expect(emitToTeam).toHaveBeenCalledWith(
        teamId,
        'team.member_removed',
        { teamId, userId: TARGET_ID }
      );
    }
  });

  // ── Test 12 ──────────────────────────────────────────────────────────────
  it('12: calls evictUserFromTeamRooms with the affected team IDs', async () => {
    setupProjectRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'MEMBER' });

    const teamIds = ['team-x', 'team-y'];
    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockResolvedValue(teamIds);
    vi.mocked(projectRepo.removeMember).mockResolvedValue(undefined);

    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    expect(evictUserFromTeamRooms).toHaveBeenCalledOnce();
    expect(evictUserFromTeamRooms).toHaveBeenCalledWith(TARGET_ID, teamIds);
  });

  // ── Test 13 ──────────────────────────────────────────────────────────────
  it('13: does NOT remove project membership when team-cleanup step throws', async () => {
    setupProjectRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'MEMBER' });

    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockRejectedValue(
      new Error('DB error in team cleanup')
    );

    await expect(
      kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID)
    ).rejects.toThrow('DB error in team cleanup');

    expect(projectRepo.removeMember).not.toHaveBeenCalled();
    expect(emitToTeam).not.toHaveBeenCalled();
    expect(evictUserFromTeamRooms).not.toHaveBeenCalled();
  });

  // ── Test 14 ──────────────────────────────────────────────────────────────
  it('14: still removes project membership when user has no team memberships', async () => {
    setupProjectRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'MEMBER' });

    vi.mocked(teamRepo.removeAllTeamMembershipsInProject).mockResolvedValue([]); // no teams
    vi.mocked(projectRepo.removeMember).mockResolvedValue(undefined);

    await kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID);

    expect(projectRepo.removeMember).toHaveBeenCalledOnce();
    expect(projectRepo.removeMember).toHaveBeenCalledWith(PROJECT_ID, TARGET_ID);
    expect(emitToTeam).not.toHaveBeenCalled(); // no teams → no WS events
    expect(evictUserFromTeamRooms).toHaveBeenCalledWith(TARGET_ID, []);
  });

  // ── Test 15 ──────────────────────────────────────────────────────────────
  it('15: cannot kick the project OWNER (existing guard preserved)', async () => {
    // Both caller and target are OWNER — target guard fires first
    setupProjectRoles({ [CALLER_ID]: 'OWNER', [TARGET_ID]: 'OWNER' });

    await expect(
      kickProjectMember(CALLER_ID, PROJECT_ID, TARGET_ID)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(teamRepo.removeAllTeamMembershipsInProject).not.toHaveBeenCalled();
    expect(projectRepo.removeMember).not.toHaveBeenCalled();
  });
});

