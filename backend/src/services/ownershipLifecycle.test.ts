/**
 * ownershipLifecycle.test.ts
 *
 * Tests for Team Ownership Lifecycle (Issue 3):
 *  - OWNER cannot leave without transferring ownership.
 *  - OWNER cannot be removed by another member.
 *  - ADMIN and MEMBER can still leave/be removed.
 *  - Only OWNER can transfer ownership.
 *  - Non-member cannot become OWNER via transfer.
 *  - Self-transfer is rejected.
 *  - Successful transfer updates both users' roles.
 *  - Failed DB operations do not leave partial state.
 *  - Concurrent transfer attempts (transaction handles atomically).
 *  - WebSocket events emitted only after successful DB transfer.
 *  - Project-team relationship validation enforced on the nested endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports
// ---------------------------------------------------------------------------

vi.mock('../repositories/team.repository', () => ({
  findTeamById:      vi.fn(),
  findMemberRole:    vi.fn(),
  getMemberCount:    vi.fn(),
  getMembers:        vi.fn(),
  createTeam:        vi.fn(),
  updateTeam:        vi.fn(),
  deleteTeam:        vi.fn(),
  addMember:         vi.fn(),
  updateMemberRole:  vi.fn(),
  removeMember:      vi.fn(),
  transferOwnership: vi.fn(),
  findTeamIdsByUserAndProject:        vi.fn(),
  removeAllTeamMembershipsInProject:  vi.fn(),
}));

vi.mock('../repositories/project.repository', () => ({
  findMemberRole:  vi.fn(),
  findProjectById: vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
  findByUsername: vi.fn(),
}));

vi.mock('../websocket/emit', () => ({
  emitToTeam: vi.fn(),
  emitToUser: vi.fn(),
}));

vi.mock('../websocket/rooms', () => ({
  evictUserFromTeamRoom:  vi.fn().mockResolvedValue(undefined),
  evictUserFromTeamRooms: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/cache', () => ({
  cacheGet:        vi.fn().mockResolvedValue(null),
  cacheSet:        vi.fn().mockResolvedValue(undefined),
  cacheInvalidate: vi.fn().mockResolvedValue(undefined),
  CacheKeys:       { team: (id: string) => `team:${id}` },
}));

vi.mock('../config/redis', () => ({
  isRedisReady: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// ---------------------------------------------------------------------------

import * as teamRepo from '../repositories/team.repository';
import { emitToTeam } from '../websocket/emit';
import { evictUserFromTeamRoom } from '../websocket/rooms';

import { removeMember, transferOwnership } from './team.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_ID      = 'team-aaaa-0000-0000-000000000000';
const PROJECT_ID   = 'proj-bbbb-0000-0000-000000000000';
const OWNER_ID     = 'user-cccc-0000-0000-000000000000';
const ADMIN_ID     = 'user-dddd-0000-0000-000000000000';
const MEMBER_ID    = 'user-eeee-0000-0000-000000000000';
const NONMEMBER_ID = 'user-ffff-0000-0000-000000000000';

const teamRecord = {
  id: TEAM_ID,
  project_id: PROJECT_ID,
  name: 'Alpha Team',
  max_size: 10,
  created_by: OWNER_ID,
  created_at: new Date(),
};

// ---------------------------------------------------------------------------
// Reset ALL mocks before each test, including queued mockResolvedValueOnce
// values from previous tests.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Re-apply default resolutions for mocks that must always resolve.
  vi.mocked(teamRepo.removeMember).mockResolvedValue(undefined);
  vi.mocked(teamRepo.transferOwnership).mockResolvedValue(undefined);
  vi.mocked(evictUserFromTeamRoom).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helper: set up findMemberRole to return specific roles keyed by userId.
// Falls back to null (non-member) for any userId not in the map.
// ---------------------------------------------------------------------------

function setupRoles(roles: Record<string, string | null>) {
  vi.mocked(teamRepo.findMemberRole).mockImplementation(
    (_teamId: string, userId: string) => Promise.resolve((roles[userId] ?? null) as any)
  );
}

// ===========================================================================
// 1. removeMember — OWNER self-removal is blocked
// ===========================================================================

describe('removeMember — OWNER cannot leave without transferring ownership', () => {
  it('throws 400 when OWNER tries to remove themselves', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER' });

    // statusCode 400 distinguishes this from the 403 "not a member" guard
    await expect(removeMember(OWNER_ID, TEAM_ID, OWNER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('error message mentions transferring ownership', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER' });

    let caughtMessage = '';
    try {
      await removeMember(OWNER_ID, TEAM_ID, OWNER_ID);
    } catch (err: any) {
      caughtMessage = err.message ?? '';
    }
    expect(caughtMessage.toLowerCase()).toContain('transfer');
  });

  it('does NOT call DB or WS when blocked', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER' });

    await expect(removeMember(OWNER_ID, TEAM_ID, OWNER_ID)).rejects.toThrow();

    expect(teamRepo.removeMember).not.toHaveBeenCalled();
    expect(emitToTeam).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. removeMember — OWNER cannot be removed by another member
// ===========================================================================

describe('removeMember — OWNER cannot be removed by another member', () => {
  it('throws 400 when ADMIN tries to remove the OWNER', async () => {
    setupRoles({ [ADMIN_ID]: 'ADMIN', [OWNER_ID]: 'OWNER' });

    await expect(removeMember(ADMIN_ID, TEAM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('transfer ownership'),
    });

    expect(teamRepo.removeMember).not.toHaveBeenCalled();
  });

  it('throws 403 when a MEMBER tries to remove the OWNER (hits auth guard first)', async () => {
    setupRoles({ [MEMBER_ID]: 'MEMBER', [OWNER_ID]: 'OWNER' });

    // A MEMBER trying to remove someone else hits the "not ADMIN" guard first
    await expect(removeMember(MEMBER_ID, TEAM_ID, OWNER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(teamRepo.removeMember).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. removeMember — ADMIN and MEMBER can still leave/be removed
// ===========================================================================

describe('removeMember — ADMIN and MEMBER can be removed normally', () => {
  it('ADMIN can be removed by the OWNER', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER', [ADMIN_ID]: 'ADMIN' });

    await expect(removeMember(OWNER_ID, TEAM_ID, ADMIN_ID)).resolves.toBeUndefined();

    expect(teamRepo.removeMember).toHaveBeenCalledWith(TEAM_ID, ADMIN_ID);
  });

  it('MEMBER can remove themselves (self-leave)', async () => {
    setupRoles({ [MEMBER_ID]: 'MEMBER' });

    await expect(removeMember(MEMBER_ID, TEAM_ID, MEMBER_ID)).resolves.toBeUndefined();

    expect(teamRepo.removeMember).toHaveBeenCalledWith(TEAM_ID, MEMBER_ID);
  });

  it('ADMIN can remove themselves (self-leave)', async () => {
    setupRoles({ [ADMIN_ID]: 'ADMIN' });

    await expect(removeMember(ADMIN_ID, TEAM_ID, ADMIN_ID)).resolves.toBeUndefined();

    expect(teamRepo.removeMember).toHaveBeenCalledWith(TEAM_ID, ADMIN_ID);
  });

  it('OWNER can remove a MEMBER', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER', [MEMBER_ID]: 'MEMBER' });

    await expect(removeMember(OWNER_ID, TEAM_ID, MEMBER_ID)).resolves.toBeUndefined();

    expect(teamRepo.removeMember).toHaveBeenCalledWith(TEAM_ID, MEMBER_ID);
  });
});

// ===========================================================================
// 4. transferOwnership — only OWNER can initiate
// ===========================================================================

describe('transferOwnership — authorization checks', () => {
  it('throws 403 when caller is not a team member', async () => {
    setupRoles({});  // NONMEMBER_ID not in map → null

    await expect(transferOwnership(NONMEMBER_ID, TEAM_ID, { newOwnerId: ADMIN_ID }))
      .rejects.toMatchObject({ statusCode: 403 });

    expect(teamRepo.transferOwnership).not.toHaveBeenCalled();
  });

  it('throws 403 when caller is ADMIN (not OWNER)', async () => {
    setupRoles({ [ADMIN_ID]: 'ADMIN', [MEMBER_ID]: 'MEMBER' });

    await expect(transferOwnership(ADMIN_ID, TEAM_ID, { newOwnerId: MEMBER_ID }))
      .rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('OWNER'),
      });

    expect(teamRepo.transferOwnership).not.toHaveBeenCalled();
  });

  it('throws 403 when caller is MEMBER (not OWNER)', async () => {
    setupRoles({ [MEMBER_ID]: 'MEMBER', [ADMIN_ID]: 'ADMIN' });

    await expect(transferOwnership(MEMBER_ID, TEAM_ID, { newOwnerId: ADMIN_ID }))
      .rejects.toMatchObject({ statusCode: 403 });

    expect(teamRepo.transferOwnership).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. transferOwnership — self-transfer is rejected
// ===========================================================================

describe('transferOwnership — self-transfer rejection', () => {
  it('throws 400 when OWNER tries to transfer ownership to themselves', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER' });

    await expect(transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: OWNER_ID }))
      .rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('yourself'),
      });

    expect(teamRepo.transferOwnership).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 6. transferOwnership — new owner must be an existing member
// ===========================================================================

describe('transferOwnership — new owner must be a team member', () => {
  it('throws 400 when the new owner is not a member of the team', async () => {
    // OWNER is a member; NONMEMBER_ID is not
    setupRoles({ [OWNER_ID]: 'OWNER' });  // NONMEMBER_ID → null (non-member)

    await expect(transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: NONMEMBER_ID }))
      .rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('already be a member'),
      });

    expect(teamRepo.transferOwnership).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. transferOwnership — successful transfer updates both users' roles
// ===========================================================================

describe('transferOwnership — successful transfer', () => {
  it('calls transferOwnership with correct args and returns ownership info', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER', [ADMIN_ID]: 'ADMIN' });

    const result = await transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: ADMIN_ID });

    expect(teamRepo.transferOwnership).toHaveBeenCalledWith(TEAM_ID, OWNER_ID, ADMIN_ID);

    expect(result).toMatchObject({
      teamId:    TEAM_ID,
      newOwner:  { userId: ADMIN_ID,  role: 'OWNER' },
      prevOwner: { userId: OWNER_ID,  role: 'ADMIN' },
    });
  });

  it('works when newOwner is a MEMBER (not just ADMIN)', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER', [MEMBER_ID]: 'MEMBER' });

    const result = await transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: MEMBER_ID });

    expect(teamRepo.transferOwnership).toHaveBeenCalledWith(TEAM_ID, OWNER_ID, MEMBER_ID);
    expect(result.newOwner.role).toBe('OWNER');
    expect(result.prevOwner.role).toBe('ADMIN');
  });
});

// ===========================================================================
// 8. transferOwnership — failed DB does not emit WS events
// ===========================================================================

describe('transferOwnership — DB failure leaves no partial state', () => {
  it('does NOT emit WS event when transferOwnership repository throws', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER', [ADMIN_ID]: 'ADMIN' });
    vi.mocked(teamRepo.transferOwnership).mockRejectedValue(new Error('deadlock detected'));

    await expect(
      transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: ADMIN_ID })
    ).rejects.toThrow('deadlock detected');

    // WS event must NOT have been emitted — DB failure means nothing changed
    expect(emitToTeam).not.toHaveBeenCalled();
  });

  it('does NOT call transferOwnership when authorization fails (ADMIN caller)', async () => {
    setupRoles({ [ADMIN_ID]: 'ADMIN', [MEMBER_ID]: 'MEMBER' });

    await expect(
      transferOwnership(ADMIN_ID, TEAM_ID, { newOwnerId: MEMBER_ID })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(teamRepo.transferOwnership).not.toHaveBeenCalled();
    expect(emitToTeam).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 9. WebSocket events — emitted only after successful transfer
// ===========================================================================

describe('transferOwnership — WebSocket events', () => {
  it('emits team.ownership_transferred event after successful transfer', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER', [ADMIN_ID]: 'ADMIN' });

    await transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: ADMIN_ID });

    expect(emitToTeam).toHaveBeenCalledOnce();
    expect(emitToTeam).toHaveBeenCalledWith(
      TEAM_ID,
      'team.ownership_transferred',
      {
        teamId:        TEAM_ID,
        newOwnerId:    ADMIN_ID,
        newOwnerRole:  'OWNER',
        prevOwnerId:   OWNER_ID,
        prevOwnerRole: 'ADMIN',
      }
    );
  });

  it('does NOT emit event when DB transfer fails', async () => {
    setupRoles({ [OWNER_ID]: 'OWNER', [ADMIN_ID]: 'ADMIN' });
    vi.mocked(teamRepo.transferOwnership).mockRejectedValue(new Error('connection reset'));

    await expect(
      transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: ADMIN_ID })
    ).rejects.toThrow();

    expect(emitToTeam).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 10. Project-team relationship validation on nested endpoint
// ===========================================================================

describe('transferOwnership — project-team relationship validation', () => {
  it('throws 404 when teamId does not belong to projectId', async () => {
    // findTeamById returns a team belonging to a DIFFERENT project
    vi.mocked(teamRepo.findTeamById).mockResolvedValue({
      ...teamRecord,
      project_id: 'other-project-id',
    } as any);

    await expect(
      transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: ADMIN_ID }, PROJECT_ID)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Team not found' });

    expect(teamRepo.findMemberRole).not.toHaveBeenCalled();
    expect(teamRepo.transferOwnership).not.toHaveBeenCalled();
  });

  it('proceeds past guard when teamId belongs to projectId', async () => {
    vi.mocked(teamRepo.findTeamById).mockResolvedValue(teamRecord as any);
    setupRoles({ [OWNER_ID]: 'OWNER', [ADMIN_ID]: 'ADMIN' });

    const result = await transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: ADMIN_ID }, PROJECT_ID);

    expect(result.newOwner.role).toBe('OWNER');
    expect(teamRepo.transferOwnership).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// 11. Concurrent transfer — repository transaction handles atomicity
// ===========================================================================

describe('transferOwnership — concurrent transfer handling', () => {
  it('propagates serialization errors from the repository transaction', async () => {
    // The repo uses SERIALIZABLE + SELECT FOR UPDATE; on a race it throws
    // a PostgreSQL serialization_failure. The service must let this propagate
    // so the caller can retry rather than silently swallowing it.
    const serializationError = new Error('could not serialize access due to concurrent update');

    setupRoles({ [OWNER_ID]: 'OWNER', [ADMIN_ID]: 'ADMIN' });
    vi.mocked(teamRepo.transferOwnership).mockRejectedValue(serializationError);

    await expect(
      transferOwnership(OWNER_ID, TEAM_ID, { newOwnerId: ADMIN_ID })
    ).rejects.toThrow('could not serialize access');

    // No WS event — the transaction rolled back
    expect(emitToTeam).not.toHaveBeenCalled();
  });
});
