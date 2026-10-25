import type { DanmuSender } from '@danmu/shared';
import { generateAuthToken, generateRoomKey } from './tokens';

export interface RoomRow {
  id: number;
  key: string;
  online: number;
  auth_token: string;
  auth_token_sent_at: string;
  created_at: string;
}

const MAX_KEY_ATTEMPTS = 20;

/**
 * Inserts an online room with a key no other online room uses. Uniqueness is enforced by the
 * partial unique index on (key) WHERE online = 1, so concurrent requests cannot collide.
 */
export async function createRoom(db: D1Database, creatorIp: string | null): Promise<RoomRow> {
  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
    try {
      const row = await db
        .prepare(
          `INSERT INTO rooms (key, auth_token, auth_token_sent_at, creator_ip)
           VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
           RETURNING id, key, online, auth_token, auth_token_sent_at, created_at`,
        )
        .bind(generateRoomKey(), generateAuthToken(), creatorIp)
        .first<RoomRow>();
      if (row) return row;
    } catch (error) {
      if (!String(error).includes('UNIQUE constraint failed')) throw error;
    }
  }
  throw new Error('could not allocate a free room key');
}

/** The online room with this key, or else the latest closed one (so callers can tell "closed" from "unknown"). */
export function findRoomByKey(db: D1Database, key: string) {
  return db
    .prepare(
      `SELECT id, key, online, auth_token, auth_token_sent_at, created_at FROM rooms
       WHERE key = ? ORDER BY online DESC, id DESC LIMIT 1`,
    )
    .bind(key)
    .first<RoomRow>();
}

export async function listOnlineRooms(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT id, key, online, auth_token, auth_token_sent_at, created_at FROM rooms
       WHERE online = 1 ORDER BY id DESC`,
    )
    .all<RoomRow>();
  return results;
}

export async function findOrCreateSender(db: D1Database, sender: DanmuSender): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO senders (provider, uid) VALUES (?, ?)
       ON CONFLICT (provider, uid) DO UPDATE SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING id`,
    )
    .bind(sender.provider, sender.uid)
    .first<{ id: number }>();
  if (!row) throw new Error('could not save sender');
  return row.id;
}

export function insertDanmu(db: D1Database, roomId: number, senderId: number, content: string) {
  return db
    .prepare(
      `INSERT INTO danmus (room_id, sender_id, content) VALUES (?, ?, ?)
       RETURNING id, room_id, sender_id, content, created_at`,
    )
    .bind(roomId, senderId, content)
    .first<{
      id: number;
      room_id: number;
      sender_id: number;
      content: string;
      created_at: string;
    }>();
}

export interface SenderState {
  id: number;
  uid: string;
  room_key: string | null;
  last_action: string | null;
}

export async function findOrCreateSenderState(
  db: D1Database,
  provider: string,
  uid: string,
): Promise<SenderState> {
  const row = await db
    .prepare(
      `INSERT INTO senders (provider, uid) VALUES (?, ?)
       ON CONFLICT (provider, uid) DO UPDATE SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING id, uid, room_key, last_action`,
    )
    .bind(provider, uid)
    .first<SenderState>();
  if (!row) throw new Error('could not save sender');
  return row;
}

export async function updateSenderState(
  db: D1Database,
  id: number,
  changes: Partial<Pick<SenderState, 'room_key' | 'last_action'>>,
) {
  const columns = Object.keys(changes) as (keyof typeof changes)[];
  if (columns.length === 0) return;
  await db
    .prepare(
      `UPDATE senders SET ${columns.map((column) => `${column} = ?`).join(', ')},
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
    .bind(...columns.map((column) => changes[column] ?? null), id)
    .run();
}
