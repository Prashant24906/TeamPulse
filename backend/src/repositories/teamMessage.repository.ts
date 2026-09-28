import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamMessage {
  id: string;
  team_id: string;
  sender_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

/** Enriched row returned to clients — includes sender's display name */
export interface TeamMessageWithSender extends TeamMessage {
  sender_name: string;
}

// ---------------------------------------------------------------------------
// getMessages — cursor-based, descending fetch then reversed for display
//
// Query pattern:
//   No cursor  → latest <limit> messages
//   before=id  → messages older than that message's created_at
//
// We query DESC (newest-first) so the index (team_id, created_at DESC)
// is used efficiently. The result is reversed to chronological order
// before returning.
// ---------------------------------------------------------------------------

export async function getMessages(
  teamId: string,
  limit: number,
  beforeId?: string
): Promise<TeamMessageWithSender[]> {
  let rows: TeamMessageWithSender[];

  if (beforeId) {
    // Resolve the cursor message's created_at timestamp
    const cursor = await sql<{ created_at: Date }[]>`
      SELECT created_at FROM team_messages
       WHERE id = ${beforeId} AND team_id = ${teamId}
       LIMIT 1
    `;
    if (!cursor[0]) {
      // Cursor not found — return empty (safe fallback)
      return [];
    }
    const cursorTime = cursor[0].created_at;

    rows = await sql<TeamMessageWithSender[]>`
      SELECT
        m.id,
        m.team_id,
        m.sender_id,
        m.content,
        m.created_at,
        m.updated_at,
        u.name AS sender_name
      FROM team_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.team_id   = ${teamId}
        AND m.created_at < ${cursorTime}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await sql<TeamMessageWithSender[]>`
      SELECT
        m.id,
        m.team_id,
        m.sender_id,
        m.content,
        m.created_at,
        m.updated_at,
        u.name AS sender_name
      FROM team_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.team_id = ${teamId}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
  }

  // Reverse to chronological order (oldest first) for frontend rendering
  return rows.reverse();
}

// ---------------------------------------------------------------------------
// createMessage
// ---------------------------------------------------------------------------

export async function createMessage(
  teamId: string,
  senderId: string,
  content: string
): Promise<TeamMessageWithSender> {
  const rows = await sql<TeamMessageWithSender[]>`
    WITH inserted AS (
      INSERT INTO team_messages (team_id, sender_id, content)
      VALUES (${teamId}, ${senderId}, ${content})
      RETURNING *
    )
    SELECT
      i.id,
      i.team_id,
      i.sender_id,
      i.content,
      i.created_at,
      i.updated_at,
      u.name AS sender_name
    FROM inserted i
    JOIN users u ON u.id = i.sender_id
  `;
  return rows[0];
}
