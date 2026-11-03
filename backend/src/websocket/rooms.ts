// ---------------------------------------------------------------------------
// rooms.ts — WebSocket room-management helpers
//
// Pattern: REST is source of truth. These helpers are called AFTER a DB
// mutation (membership removal) to keep Socket.IO room state consistent.
//
// Socket.IO 4.x API used:
//   io.in(room).fetchSockets()  — returns all RemoteSocket objects in a room
//   socket.leave(room)          — removes one socket from one room
//
// Design notes:
//   - Only touches the specified room; all other rooms are preserved.
//   - If Socket.IO is not yet initialized (e.g., tests without HTTP server),
//     the call is silently ignored to avoid crashing the service layer.
//   - Never disconnects the user's socket — only evicts from the team room.
//   - All errors are non-fatal: a WebSocket eviction failure must never
//     roll back an already-committed DB deletion.
// ---------------------------------------------------------------------------

import { getIO, userRoom, teamRoom } from './socket';

/**
 * Evict every active socket that belongs to `userId` from `team:<teamId>`.
 *
 * Algorithm:
 *  1. Fetch all sockets currently in the user's personal room
 *     (`user:<userId>`). These are exactly the sockets owned by this user
 *     because only that user's connections are auto-joined to their personal
 *     room on connect (see socket.ts:108).
 *  2. For each socket, call `socket.leave(teamRoom(teamId))`.
 *     Sockets that are not in that room are silently unaffected.
 *
 * Why use the personal room rather than scanning all sockets?
 *  - Scanning all sockets (io.fetchSockets()) is O(N) over the entire server.
 *  - Targeting `user:<userId>` is O(connections for that user) — always small.
 */
export async function evictUserFromTeamRoom(
  userId: string,
  teamId: string
): Promise<void> {
  try {
    const io = getIO();
    const room = userRoom(userId);
    const sockets = await io.in(room).fetchSockets();

    if (sockets.length === 0) {
      // User has no active connections — nothing to evict.
      return;
    }

    await Promise.all(
      sockets.map((socket) => socket.leave(teamRoom(teamId)))
    );

    console.log(
      `[ws] evicted userId=${userId} from room=${teamRoom(teamId)} ` +
      `(${sockets.length} socket(s) affected)`
    );
  } catch (err) {
    // Non-fatal: log and continue. DB mutation already committed.
    console.error(
      `[ws] evictUserFromTeamRoom failed — userId=${userId} teamId=${teamId}:`,
      err
    );
  }
}

/**
 * Evict every active socket belonging to `userId` from multiple team rooms
 * simultaneously.
 *
 * Used by project-member removal, where the user may be a member of several
 * teams inside the project that is revoking their access.
 *
 * @param userId   The user being removed.
 * @param teamIds  Array of team IDs to evict the user from (may be empty).
 */
export async function evictUserFromTeamRooms(
  userId: string,
  teamIds: string[]
): Promise<void> {
  if (teamIds.length === 0) return;

  try {
    const io = getIO();
    const sockets = await io.in(userRoom(userId)).fetchSockets();

    if (sockets.length === 0) return;

    // Leave all specified team rooms for every socket owned by this user.
    await Promise.all(
      sockets.flatMap((socket) =>
        teamIds.map((teamId) => socket.leave(teamRoom(teamId)))
      )
    );

    console.log(
      `[ws] evicted userId=${userId} from ${teamIds.length} team room(s) ` +
      `(${sockets.length} socket(s) affected): ${teamIds.join(', ')}`
    );
  } catch (err) {
    console.error(
      `[ws] evictUserFromTeamRooms failed — userId=${userId}:`,
      err
    );
  }
}
