import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, BASE, createRoom } from './helpers';

describe('rooms API', () => {
  it('POST /api/rooms creates an online room with a 4-digit key and auth token', async () => {
    const response = await api('/rooms', { method: 'POST' });
    const room = await response.json<Record<string, unknown>>();

    expect(response.status).toBe(201);
    expect(room.key).toMatch(/^\d{4}$/);
    expect(room.online).toBe(true);
    expect(room.auth_token).toMatch(/^[1-9A-HJ-NP-Za-km-z]{24}$/);
    expect(room.auth_token_sent_at).toBeTypeOf('string');
    expect(room.url).toBe(`${BASE}/api/rooms/${room.key as string}`);
    expect(response.headers.get('Location')).toBe(room.url);
  });

  it('GET /api/rooms lists online rooms, newest first, without auth tokens', async () => {
    const first = await createRoom();
    const second = await createRoom();
    await env.DB.prepare('UPDATE rooms SET online = 0 WHERE id = ?').bind(first.id).run();
    const third = await createRoom();

    const response = await api('/rooms');
    const body = await response.json<{
      rooms: Record<string, unknown>[];
      room_counts: number;
      url: string;
    }>();

    expect(body.rooms.map((room) => room.key)).toEqual([third.key, second.key]);
    expect(body.room_counts).toBe(2);
    expect(body.url).toBe(`${BASE}/api/rooms`);
    expect(body.rooms.every((room) => !('auth_token' in room))).toBe(true);
  });

  it('GET /api/rooms/:key shows a room without its auth token', async () => {
    const room = await createRoom();

    const body = await (await api(`/rooms/${room.key}`)).json<Record<string, unknown>>();

    expect(Object.keys(body).sort()).toEqual(['id', 'key', 'online', 'url']);
    expect(body.key).toBe(room.key);
  });

  it('GET /api/rooms/:key returns 404 for an unknown key', async () => {
    const response = await api('/rooms/0000');

    expect(response.status).toBe(404);
  });

  it('never gives two online rooms the same key', async () => {
    const rooms = await Promise.all(Array.from({ length: 30 }, () => createRoom()));

    expect(new Set(rooms.map((room) => room.key)).size).toBe(30);
  });

  it('reuses a key once the room that had it is offline', async () => {
    const room = await createRoom();
    await env.DB.prepare('UPDATE rooms SET online = 0 WHERE id = ?').bind(room.id).run();
    await env.DB.prepare(
      `INSERT INTO rooms (key, auth_token, auth_token_sent_at) VALUES (?, 'another-token', 'now')`,
    )
      .bind(room.key)
      .run();

    const body = await (await api(`/rooms/${room.key}`)).json<{ id: number; online: boolean }>();

    expect(body.id).not.toBe(room.id);
    expect(body.online).toBe(true);
  });
});
