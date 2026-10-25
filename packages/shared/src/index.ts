// API contract shared by the Worker, the web pages and the screen app.
// Field names stay snake_case to match the original Rails API.

/** A room as listed publicly (no secrets). */
export interface Room {
  id: number;
  key: string;
  online: boolean;
  url: string;
}

/** Returned once, to the screen that created the room. */
export interface CreatedRoom extends Room {
  auth_token: string;
  auth_token_sent_at: string;
}

export interface RoomList {
  rooms: Room[];
  room_counts: number;
  url: string;
}

export interface DanmuSender {
  provider: string;
  uid: string;
}

export interface CreateDanmuRequest {
  danmu: {
    content: string;
    sender: DanmuSender;
  };
}

/** A danmu as delivered to the screen. */
export interface Danmu {
  content: string;
  created_at: string;
}

/** Messages the Worker sends to a screen over `GET /api/rooms/:key/ws`. */
export type ScreenMessage = { type: 'danmu'; danmu: Danmu } | { type: 'room_closed' };

export const ROOM_KEY_LENGTH = 4;
export const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;
export const DANMU_MAX_LENGTH = 200;
