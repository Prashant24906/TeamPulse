/**
 * rooms.test.ts — Unit tests for WebSocket room-eviction helpers
 *
 * We mock `./socket` so the tests never need a real Socket.IO server or HTTP
 * server. Each fake socket has a `leave` spy and belongs to a specific user's
 * personal room, exactly as the real server sets up.
 *
 * Test coverage:
 *  1.  evictUserFromTeamRoom: user with one active socket is removed from team room
 *  2.  evictUserFromTeamRoom: user with multiple active sockets, all removed
 *  3.  evictUserFromTeamRoom: removed user stops receiving events (leave called)
 *  4.  evictUserFromTeamRoom: other users' sockets are NOT touched
 *  5.  evictUserFromTeamRoom: user's personal room is preserved (leave not called for it)
 *  6.  evictUserFromTeamRoom: user with no active connections → no-op (no error)
 *  7.  evictUserFromTeamRoom: user remains in another team room (other team not evicted)
 *  8.  evictUserFromTeamRooms: project removal evicts from all relevant team rooms
 *  9.  evictUserFromTeamRooms: empty teamIds array → no-op
 *  10. evictUserFromTeamRooms: preserves access to teams NOT in the list
 *  11. evictUserFromTeamRoom: repeated removal calls do not throw
 *  12. evictUserFromTeamRoom: getIO() failure is handled gracefully (non-fatal)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers to build fake sockets / fake IO
// ---------------------------------------------------------------------------

/** Create a mock socket whose `leave` method is a spy. */
function makeFakeSocket(id: string) {
  return {
    id,
    leave: vi.fn().mockResolvedValue(undefined),
  };
}

/** Build a fake io.in(room).fetchSockets() chain. */
function makeFakeIO(socketsInUserRoom: ReturnType<typeof makeFakeSocket>[]) {
  return {
    in: vi.fn().mockReturnValue({
      fetchSockets: vi.fn().mockResolvedValue(socketsInUserRoom),
    }),
  };
}

const teamRoom = (teamId: string) => `team:${teamId}`;
const userRoom = (userId: string) => `user:${userId}`;

// ---------------------------------------------------------------------------
// Mock the `./socket` module before importing the module under test.
// ---------------------------------------------------------------------------

let fakeIO: ReturnType<typeof makeFakeIO>;

vi.mock('../websocket/socket', () => ({
  getIO: () => fakeIO,
  teamRoom: (id: string) => `team:${id}`,
  userRoom: (id: string) => `user:${id}`,
}));

// Static import — safe because vi.mock() above is hoisted before all imports.
import { evictUserFromTeamRoom, evictUserFromTeamRooms } from '../websocket/rooms';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evictUserFromTeamRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('test 1 — user with one active socket is removed from the team room', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await evictUserFromTeamRoom('user-A', 'team-1');

    expect(fakeIO.in).toHaveBeenCalledWith(userRoom('user-A'));
    expect(socket.leave).toHaveBeenCalledOnce();
    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-1'));
  });

  it('test 2 — user with multiple active sockets, all sockets are evicted', async () => {
    const s1 = makeFakeSocket('s1');
    const s2 = makeFakeSocket('s2');
    const s3 = makeFakeSocket('s3');
    fakeIO = makeFakeIO([s1, s2, s3]);

    await evictUserFromTeamRoom('user-A', 'team-1');

    for (const socket of [s1, s2, s3]) {
      expect(socket.leave).toHaveBeenCalledOnce();
      expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-1'));
    }
  });

  it('test 3 — leave is called, proving the removed user stops receiving team events', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await evictUserFromTeamRoom('user-A', 'team-1');

    // After eviction, the socket has called leave — it is no longer in the room.
    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-1'));
  });

  it('test 4 — only sockets in the user room are touched; other users\' sockets are not fetched', async () => {
    const userSocket = makeFakeSocket('s-user-A');
    fakeIO = makeFakeIO([userSocket]); // only user-A sockets returned for user-A's room

    const otherSocket = makeFakeSocket('s-user-B');

    await evictUserFromTeamRoom('user-A', 'team-1');

    // The other user's socket was never touched.
    expect(otherSocket.leave).not.toHaveBeenCalled();
    // io.in was queried only with user-A's personal room.
    expect(fakeIO.in).toHaveBeenCalledWith(userRoom('user-A'));
    expect(fakeIO.in).not.toHaveBeenCalledWith(userRoom('user-B'));
  });

  it('test 5 — only the team room is left; personal room leave is NOT called', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await evictUserFromTeamRoom('user-A', 'team-1');

    // leave called exactly once and only for the team room
    expect(socket.leave).toHaveBeenCalledTimes(1);
    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-1'));
    expect(socket.leave).not.toHaveBeenCalledWith(userRoom('user-A'));
  });

  it('test 6 — user with no active sockets is a no-op (no error thrown)', async () => {
    fakeIO = makeFakeIO([]); // empty — user is offline

    await expect(evictUserFromTeamRoom('user-A', 'team-1')).resolves.toBeUndefined();
  });

  it('test 7 — user retains access to another team (leave called only for the specified team)', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await evictUserFromTeamRoom('user-A', 'team-1');

    // leave was called only for team-1, not team-2
    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-1'));
    expect(socket.leave).not.toHaveBeenCalledWith(teamRoom('team-2'));
    expect(socket.leave).toHaveBeenCalledTimes(1);
  });

  it('test 11 — repeated eviction calls do not throw', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await expect(evictUserFromTeamRoom('user-A', 'team-1')).resolves.toBeUndefined();
    await expect(evictUserFromTeamRoom('user-A', 'team-1')).resolves.toBeUndefined();
  });

  it('test 12 — getIO() throwing is caught and does not propagate (non-fatal)', async () => {
    // Simulate Socket.IO not initialized yet
    fakeIO = { in: vi.fn().mockImplementation(() => { throw new Error('not initialized'); }) } as unknown as ReturnType<typeof makeFakeIO>;

    await expect(evictUserFromTeamRoom('user-A', 'team-1')).resolves.toBeUndefined();
  });
});

describe('evictUserFromTeamRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('test 8 — project removal: user evicted from all relevant team rooms', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await evictUserFromTeamRooms('user-A', ['team-1', 'team-2', 'team-3']);

    expect(socket.leave).toHaveBeenCalledTimes(3);
    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-1'));
    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-2'));
    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-3'));
  });

  it('test 8b — multiple sockets, all evicted from all relevant rooms', async () => {
    const s1 = makeFakeSocket('s1');
    const s2 = makeFakeSocket('s2');
    fakeIO = makeFakeIO([s1, s2]);

    await evictUserFromTeamRooms('user-A', ['team-1', 'team-2']);

    // Each of 2 sockets leaves each of 2 rooms → 4 calls total
    expect(s1.leave).toHaveBeenCalledTimes(2);
    expect(s2.leave).toHaveBeenCalledTimes(2);
    expect(s1.leave).toHaveBeenCalledWith(teamRoom('team-1'));
    expect(s1.leave).toHaveBeenCalledWith(teamRoom('team-2'));
  });

  it('test 9 — empty teamIds array is a no-op (io.in never called)', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await evictUserFromTeamRooms('user-A', []);

    expect(socket.leave).not.toHaveBeenCalled();
    expect(fakeIO.in).not.toHaveBeenCalled();
  });

  it('test 10 — only specified teams are left; unrelated teams are preserved', async () => {
    const socket = makeFakeSocket('s1');
    fakeIO = makeFakeIO([socket]);

    await evictUserFromTeamRooms('user-A', ['team-1']);

    expect(socket.leave).toHaveBeenCalledWith(teamRoom('team-1'));
    expect(socket.leave).not.toHaveBeenCalledWith(teamRoom('team-99'));
    expect(socket.leave).toHaveBeenCalledTimes(1);
  });
});
