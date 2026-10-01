import sql from '../config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export type PublicUser = Omit<User, 'password_hash'>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Find a user by email (used during login). */
export async function findByEmail(email: string): Promise<User | null> {
  const rows = await sql<User[]>`
    SELECT id, name, username, email, password_hash, created_at
      FROM users
     WHERE email = ${email}
     LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Find a user by id — password_hash excluded (used for /me). */
export async function findById(id: string): Promise<PublicUser | null> {
  const rows = await sql<PublicUser[]>`
    SELECT id, name, username, email, created_at
      FROM users
     WHERE id = ${id}
     LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Find a user by username — used for "add member by username". */
export async function findByUsername(username: string): Promise<PublicUser | null> {
  const rows = await sql<PublicUser[]>`
    SELECT id, name, username, email, created_at
      FROM users
     WHERE username = ${username.toLowerCase()}
     LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Insert a new user and return the created row (without password_hash). */
export async function createUser(
  name: string,
  username: string,
  email: string,
  passwordHash: string
): Promise<PublicUser> {
  const rows = await sql<PublicUser[]>`
    INSERT INTO users (name, username, email, password_hash)
    VALUES (${name}, ${username.toLowerCase()}, ${email}, ${passwordHash})
    RETURNING id, name, username, email, created_at
  `;
  return rows[0];
}
