import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectMessage {
  id: string;
  project_id: string;
  sender_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

/** Enriched row returned to clients — includes sender's display name */
export interface ProjectMessageWithSender extends ProjectMessage {
  sender_name: string;
}

// ---------------------------------------------------------------------------
// getMessages — cursor-based, descending fetch then reversed for display
//
// Query pattern:
//   No cursor  → latest <limit> messages
//   before=id  → messages older than that message's created_at
//
// We query DESC (newest-first) so the index (project_id, created_at DESC)
// is used efficiently. The result is reversed to chronological order
// before returning.
// ---------------------------------------------------------------------------

export async function getMessages(
  projectId: string,
  limit: number,
  beforeId?: string
): Promise<ProjectMessageWithSender[]> {
  let rows: ProjectMessageWithSender[];

  if (beforeId) {
    // Resolve the cursor message's created_at timestamp
    const cursor = await sql<{ created_at: Date }[]>`
      SELECT created_at FROM project_messages
       WHERE id = ${beforeId} AND project_id = ${projectId}
       LIMIT 1
    `;
    if (!cursor[0]) {
      // Cursor not found — return empty (safe fallback)
      return [];
    }
    const cursorTime = cursor[0].created_at;

    rows = await sql<ProjectMessageWithSender[]>`
      SELECT
        m.id,
        m.project_id,
        m.sender_id,
        m.content,
        m.created_at,
        m.updated_at,
        u.name AS sender_name
      FROM project_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.project_id  = ${projectId}
        AND m.created_at  < ${cursorTime}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await sql<ProjectMessageWithSender[]>`
      SELECT
        m.id,
        m.project_id,
        m.sender_id,
        m.content,
        m.created_at,
        m.updated_at,
        u.name AS sender_name
      FROM project_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.project_id = ${projectId}
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
  projectId: string,
  senderId: string,
  content: string
): Promise<ProjectMessageWithSender> {
  const rows = await sql<ProjectMessageWithSender[]>`
    WITH inserted AS (
      INSERT INTO project_messages (project_id, sender_id, content)
      VALUES (${projectId}, ${senderId}, ${content})
      RETURNING *
    )
    SELECT
      i.id,
      i.project_id,
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

// ---------------------------------------------------------------------------
// findMessageById — used for edit/delete ownership checks
// ---------------------------------------------------------------------------

export async function findMessageById(
  messageId: string,
  projectId: string
): Promise<ProjectMessageWithSender | null> {
  const rows = await sql<ProjectMessageWithSender[]>`
    SELECT
      m.id,
      m.project_id,
      m.sender_id,
      m.content,
      m.created_at,
      m.updated_at,
      u.name AS sender_name
    FROM project_messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.id = ${messageId} AND m.project_id = ${projectId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// updateMessage
// ---------------------------------------------------------------------------

export async function updateMessage(
  messageId: string,
  projectId: string,
  content: string
): Promise<ProjectMessageWithSender | null> {
  const rows = await sql<ProjectMessageWithSender[]>`
    WITH updated AS (
      UPDATE project_messages
         SET content    = ${content},
             updated_at = NOW()
       WHERE id = ${messageId} AND project_id = ${projectId}
      RETURNING *
    )
    SELECT
      u.id,
      u.project_id,
      u.sender_id,
      u.content,
      u.created_at,
      u.updated_at,
      usr.name AS sender_name
    FROM updated u
    JOIN users usr ON usr.id = u.sender_id
  `;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// deleteMessage
// ---------------------------------------------------------------------------

export async function deleteMessage(
  messageId: string,
  projectId: string
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM project_messages
     WHERE id = ${messageId} AND project_id = ${projectId}
    RETURNING id
  `;
  return rows.length > 0;
}
