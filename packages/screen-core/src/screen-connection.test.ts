import type { CreatedRoom } from '@danmu/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenConnection } from './screen-connection';

class FakeSocket extends EventTarget {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  closed: { code?: number } | null = null;

  constructor(public url: string) {
    super();
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number) {
    this.closed = { code };
  }

  serverOpen() {
    this.dispatchEvent(new Event('open'));
  }

  serverMessage(data: string) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  serverClose(code: number) {
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
}

const room = (key: string): CreatedRoom => ({
  id: Number(key),
  key,
  online: true,
  url: `http://localhost:8787/api/rooms/${key}`,
  auth_token: `token-${key}`,
  auth_token_sent_at: '2026-10-25T00:00:00.000Z',
});

function setup(rooms: (CreatedRoom | Response)[]) {
  const fetchMock = vi.fn<typeof fetch>(() => {
    const next = rooms.shift();
    return Promise.resolve(next instanceof Response ? next : Response.json(next, { status: 201 }));
  });
  const events = { rooms: [] as string[], danmus: [] as string[], errors: [] as unknown[] };
  const connection = new ScreenConnection({
    upstream: 'http://localhost:8787',
    fetch: fetchMock,
    WebSocket: FakeSocket as unknown as typeof WebSocket,
    pingIntervalMs: 1000,
    onRoom: (r) => events.rooms.push(r.key),
    onDanmu: (d) => events.danmus.push(d.content),
    onError: (e) => events.errors.push(e),
  });
  return { connection, fetchMock, events };
}

const lastSocket = () => FakeSocket.instances.at(-1)!;
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('ScreenConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  it('opens a room, connects its WebSocket and forwards danmus', async () => {
    const { connection, fetchMock, events } = setup([room('1234')]);

    connection.start();
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(new URL('http://localhost:8787/api/rooms'), {
      method: 'POST',
    });
    expect(events.rooms).toEqual(['1234']);
    expect(lastSocket().url).toBe('ws://localhost:8787/api/rooms/1234/ws?auth_token=token-1234');

    lastSocket().serverOpen();
    lastSocket().serverMessage(
      JSON.stringify({ type: 'danmu', danmu: { content: 'hi', created_at: 'x' } }),
    );
    lastSocket().serverMessage('pong');
    expect(events.danmus).toEqual(['hi']);
  });

  it('sends keep-alive pings while connected', async () => {
    const { connection } = setup([room('1234')]);
    connection.start();
    await flush();
    lastSocket().serverOpen();

    await vi.advanceTimersByTimeAsync(2500);

    expect(lastSocket().sent).toEqual(['ping', 'ping']);
  });

  it('reconnects to the same room with backoff when the connection drops', async () => {
    const { connection, events } = setup([room('1234')]);
    connection.start();
    await flush();

    lastSocket().serverClose(1006);
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(lastSocket().url).toContain('/api/rooms/1234/ws');

    lastSocket().serverClose(1006);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.instances).toHaveLength(3);
    expect(events.errors).toHaveLength(2);
  });

  it('opens a new room when the server closes the room', async () => {
    const { connection, events } = setup([room('1234'), room('5678')]);
    connection.start();
    await flush();

    lastSocket().serverClose(4000);
    await flush();

    expect(events.rooms).toEqual(['1234', '5678']);
    expect(connection.currentRoom?.key).toBe('5678');
    expect(lastSocket().url).toContain('/api/rooms/5678/ws');
  });

  it('keeps retrying when the server is not reachable yet', async () => {
    const { connection, events } = setup([new Response('down', { status: 503 }), room('1234')]);

    connection.start();
    await flush();
    expect(events.errors).toHaveLength(1);
    expect(events.rooms).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(events.rooms).toEqual(['1234']);
  });

  it('stops cleanly', async () => {
    const { connection } = setup([room('1234')]);
    connection.start();
    await flush();
    const socket = lastSocket();

    connection.stop();
    socket.serverClose(1000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(socket.closed).toEqual({ code: 1000 });
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
