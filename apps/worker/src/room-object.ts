import { DurableObject } from 'cloudflare:workers';
import type { Danmu, ScreenMessage } from '@danmu/shared';

interface RoomMeta {
  id: number;
  key: string;
  authToken: string;
  online: boolean;
}

export type DeliverResult = 'delivered' | 'queued' | 'offline';

// Danmus kept for screens that are not connected (or still poll); oldest dropped first.
const MAX_QUEUED_DANMUS = 500;
export const ROOM_CLOSED_CLOSE_CODE = 4000;

/**
 * One instance per room (named by the room id). Pushes danmus to connected screens over
 * hibernatable WebSockets, queues them while no screen is connected, and closes the room
 * with an alarm when its lifetime ends.
 */
export class RoomObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answer keep-alive pings without waking the object up.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async open(room: Omit<RoomMeta, 'online'>, lifetimeMs: number): Promise<void> {
    await this.ctx.storage.put<RoomMeta>('meta', { ...room, online: true });
    await this.ctx.storage.put<Danmu[]>('queue', []);
    await this.ctx.storage.setAlarm(Date.now() + lifetimeMs);
  }

  async deliver(danmu: Danmu): Promise<DeliverResult> {
    const meta = await this.meta();
    if (!meta?.online) return 'offline';

    const sockets = this.ctx.getWebSockets();
    if (sockets.length > 0) {
      const message = JSON.stringify({ type: 'danmu', danmu } satisfies ScreenMessage);
      sockets.forEach((socket) => socket.send(message));
      return 'delivered';
    }

    const queue = (await this.ctx.storage.get<Danmu[]>('queue')) ?? [];
    queue.push(danmu);
    await this.ctx.storage.put('queue', queue.slice(-MAX_QUEUED_DANMUS));
    return 'queued';
  }

  /** Returns and clears queued danmus, newest first (same order as the original Redis list). */
  async popQueued(): Promise<Danmu[]> {
    const queue = (await this.ctx.storage.get<Danmu[]>('queue')) ?? [];
    await this.ctx.storage.put<Danmu[]>('queue', []);
    return queue.reverse();
  }

  /** Closes the room now (also used by the alarm). */
  async close(): Promise<void> {
    const meta = await this.meta();
    if (!meta?.online) return;

    await this.ctx.storage.put<RoomMeta>('meta', { ...meta, online: false });
    await this.ctx.storage.delete('queue');
    await this.ctx.storage.deleteAlarm();
    await this.env.DB.prepare(
      `UPDATE rooms SET online = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
      .bind(meta.id)
      .run();

    const message = JSON.stringify({ type: 'room_closed' } satisfies ScreenMessage);
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(message);
      socket.close(ROOM_CLOSED_CLOSE_CODE, 'room closed');
    }
  }

  override async alarm(): Promise<void> {
    await this.close();
  }

  /** WebSocket upgrade for screens: `?auth_token=` must match the room's token. */
  override async fetch(request: Request): Promise<Response> {
    const meta = await this.meta();
    const token = new URL(request.url).searchParams.get('auth_token');
    if (!meta?.online) return Response.json({ error: 'room is offline' }, { status: 410 });
    if (token !== meta.authToken) {
      return Response.json({ error: 'wrong auth_token' }, { status: 401 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    for (const danmu of (await this.popQueued()).reverse()) {
      server.send(JSON.stringify({ type: 'danmu', danmu } satisfies ScreenMessage));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(): void {
    // Screens only receive; anything other than the auto-answered ping is ignored.
  }

  override webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }

  private meta() {
    return this.ctx.storage.get<RoomMeta>('meta');
  }
}
