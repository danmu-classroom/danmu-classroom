import { env, runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { connectScreen, createRoom, popDanmus, postDanmu, waitFor } from './helpers';

describe('screen WebSocket', () => {
  it('pushes danmus to the connected screen instead of queueing them', async () => {
    const room = await createRoom();
    const { response, messages } = await connectScreen(room);
    expect(response.status).toBe(101);

    await postDanmu(room.key, '即時彈幕');

    await waitFor(() => messages.length === 1);
    expect(messages[0]).toMatchObject({ type: 'danmu', danmu: { content: '即時彈幕' } });
    expect(await popDanmus(room)).toEqual([]);
  });

  it('flushes danmus queued before the screen connected, oldest first', async () => {
    const room = await createRoom();
    await postDanmu(room.key, 'first');
    await postDanmu(room.key, 'second');

    const { messages } = await connectScreen(room);

    await waitFor(() => messages.length === 2);
    expect(messages.map((message) => message.type === 'danmu' && message.danmu.content)).toEqual([
      'first',
      'second',
    ]);
  });

  it('rejects a wrong auth token and non-WebSocket requests', async () => {
    const room = await createRoom();

    const { response } = await connectScreen(room, 'wrong');
    expect(response.status).toBe(401);

    const plain = await (await import('./helpers')).api(`/rooms/${room.key}/ws`);
    expect(plain.status).toBe(426);
  });

  it('closes the room when its alarm fires: screen is told, DB is updated, danmus rejected', async () => {
    const room = await createRoom();
    const { messages, closed } = await connectScreen(room);

    const stub = env.ROOM.get(env.ROOM.idFromName(String(room.id)));
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    await waitFor(() => messages.length === 1);
    expect(messages[0]).toEqual({ type: 'room_closed' });
    expect((await closed)?.code).toBe(4000);
    const row = await env.DB.prepare('SELECT online FROM rooms WHERE id = ?')
      .bind(room.id)
      .first<{ online: number }>();
    expect(row?.online).toBe(0);
    expect((await postDanmu(room.key, 'too late')).status).toBe(422);
  });
});
