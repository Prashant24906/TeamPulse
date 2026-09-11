import { getIO, teamRoom } from './socket';
import type { WsEvent } from './events';

// ---------------------------------------------------------------------------
// emitToTeam — emit a typed event to all sockets in a team room.
//
// Called from services AFTER the DB mutation succeeds.
// PostgreSQL is the source of truth; this is purely the notification layer.
// ---------------------------------------------------------------------------

export function emitToTeam(
  teamId: string,
  event: WsEvent,
  payload: Record<string, unknown>
): void {
  try {
    getIO().to(teamRoom(teamId)).emit(event, payload);
    console.log(`[ws] emit  event=${event} room=${teamRoom(teamId)}`);
  } catch (err) {
    // Never let a WebSocket failure break the HTTP response.
    // The DB mutation already committed — the event is best-effort.
    console.error('[ws] emitToTeam failed (non-fatal):', err);
  }
}
