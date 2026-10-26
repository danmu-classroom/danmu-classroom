import { randomToken, sha256Hex } from './auth/tokens';

// One-time codes that let a screen without a browser session (Electron) hand a room over to the
// host's account: the screen proves it owns the room with its auth token, the host opens the
// link in a signed-in browser and confirms.

const CLAIM_TTL_MS = 10 * 60 * 1000;

export interface Claim {
  room_id: number;
  room_key: string;
  room_created_at: string;
  owner_id: number | null;
  expires_at: string;
  used_at: string | null;
}

export async function createClaimCode(db: D1Database, roomId: number) {
  const code = randomToken(24);
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS).toISOString();
  await db
    .prepare('INSERT INTO room_claims (code_hash, room_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(code), roomId, expiresAt)
    .run();
  return { code, expiresAt };
}

/** A claim that can still be used, or null. */
export async function findUsableClaim(db: D1Database, code: string): Promise<Claim | null> {
  const claim = await db
    .prepare(
      `SELECT room_claims.room_id, room_claims.expires_at, room_claims.used_at,
              rooms.key AS room_key, rooms.created_at AS room_created_at, rooms.owner_id
       FROM room_claims JOIN rooms ON rooms.id = room_claims.room_id
       WHERE room_claims.code_hash = ?`,
    )
    .bind(await sha256Hex(code))
    .first<Claim>();
  if (!claim || claim.used_at || Date.parse(claim.expires_at) <= Date.now()) return null;
  return claim;
}

/** Gives the room to the user unless someone else already owns it. Returns false if not allowed. */
export async function useClaim(
  db: D1Database,
  code: string,
  userId: number,
): Promise<number | null> {
  const claim = await findUsableClaim(db, code);
  if (!claim || (claim.owner_id !== null && claim.owner_id !== userId)) return null;

  const codeHash = await sha256Hex(code);
  await db.batch([
    db
      .prepare('UPDATE rooms SET owner_id = ? WHERE id = ? AND (owner_id IS NULL OR owner_id = ?)')
      .bind(userId, claim.room_id, userId),
    db
      .prepare(
        `UPDATE room_claims SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE code_hash = ?`,
      )
      .bind(codeHash),
  ]);
  return claim.room_id;
}
