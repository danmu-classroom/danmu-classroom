import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createRoom } from './helpers';

const get = (path: string) =>
  exports.default.fetch(new Request(`http://danmu.test${path}`, { redirect: 'manual' }));

describe('audience pages', () => {
  it('/ asks for the room key with a form that works without JavaScript', async () => {
    const response = await get('/');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<form class="card" action="/join" method="get">');
    expect(body).toContain('inputmode="numeric"');
  });

  it('/join redirects to the room page, or back for an invalid key', async () => {
    const joined = await get('/join?key=%201234%20');
    expect(joined.status).toBe(302);
    expect(joined.headers.get('Location')).toBe('/r/1234');

    const invalid = await get('/join?key=12ab');
    expect(invalid.headers.get('Location')).toBe('/');
  });

  it('/r/:key shows the send form for an online room', async () => {
    const room = await createRoom();

    const response = await get(`/r/${room.key}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(`房號 ${room.key}`);
    expect(body).toContain(`data-room-key="${room.key}"`);
    expect(body).toContain('maxlength="200"');
    expect(body).toContain('<script type="module" src="/assets/send.js"></script>');
  });

  it('/r/:key explains when the room is closed or unknown', async () => {
    const room = await createRoom();
    await env.DB.prepare('UPDATE rooms SET online = 0 WHERE id = ?').bind(room.id).run();

    for (const key of [room.key, '0000']) {
      const response = await get(`/r/${key}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toContain(`找不到房間 ${key}`);
    }
  });

  it('/r/:key sends malformed keys back to /', async () => {
    const response = await get('/r/not-a-key');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
  });
});
