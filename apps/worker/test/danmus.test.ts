import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, createRoom, popDanmus, postDanmu } from './helpers';

describe('danmus API', () => {
  it('queues danmus while no screen is connected; polling pops them once, newest first', async () => {
    const room = await createRoom();

    const response = await postDanmu(room.key, 'hello');
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ content: 'hello', room_id: room.id });
    expect((await postDanmu(room.key, '彈幕', 'u2')).status).toBe(201);

    const danmus = await popDanmus(room);
    expect(danmus.map((danmu) => danmu.content)).toEqual(['彈幕', 'hello']);
    expect(danmus.every((danmu) => typeof danmu.created_at === 'string')).toBe(true);
    expect(await popDanmus(room)).toEqual([]);
  });

  it('stores danmu history and reuses the sender', async () => {
    const room = await createRoom();

    await postDanmu(room.key, 'one');
    await postDanmu(room.key, 'two');

    const senders = await env.DB.prepare('SELECT COUNT(*) AS n FROM senders').first<{
      n: number;
    }>();
    const danmus = await env.DB.prepare('SELECT content FROM danmus WHERE room_id = ? ORDER BY id')
      .bind(room.id)
      .all<{ content: string }>();
    expect(senders?.n).toBe(1);
    expect(danmus.results.map((row) => row.content)).toEqual(['one', 'two']);
  });

  it('polling needs the room auth token', async () => {
    const room = await createRoom();

    const response = await api(`/rooms/${room.key}/danmus?auth_token=wrong`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'wrong auth_token' });
  });

  it('offline rooms reject new danmus', async () => {
    const room = await createRoom();
    await env.DB.prepare('UPDATE rooms SET online = 0 WHERE id = ?').bind(room.id).run();

    const response = await postDanmu(room.key, 'late');

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ base: ['Room is offline, can not add new danmu.'] });
  });

  it('rejects empty, too long or sender-less danmus', async () => {
    const room = await createRoom();

    expect((await postDanmu(room.key, '   ')).status).toBe(422);
    expect((await postDanmu(room.key, 'x'.repeat(201))).status).toBe(422);
    const noSender = await api(`/rooms/${room.key}/danmus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ danmu: { content: 'hi' } }),
    });
    expect(noSender.status).toBe(422);
  });

  it('returns 404 for danmus to an unknown room', async () => {
    expect((await postDanmu('0000', 'hi')).status).toBe(404);
  });
});
