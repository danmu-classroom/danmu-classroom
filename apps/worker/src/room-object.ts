import { DurableObject } from 'cloudflare:workers';
import type { Danmu, ScreenMessage } from '@danmu/shared';

interface RoomMeta {
  id: number;
  key: string;
  authToken: string;
  online: boolean;
}

export type DeliverResult = 'delivered' | 'queued' | 'offline' | 'rate_limited';

// Danmus kept for screens that are not connected (or still poll); oldest dropped first.
const MAX_QUEUED_DANMUS = 500;
export const ROOM_CLOSED_CLOSE_CODE = 4000;

// Per-sender token bucket for the public HTTP API: a short burst, then about 1 danmu per second.
export const RATE_LIMIT_BURST = 3;
export const RATE_LIMIT_REFILL_MS = 1000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * One instance per room (named by the room id). Pushes danmus to connected screens over
 * hibernatable WebSockets, queues them while no screen is connected, and closes the room
 * with an alarm when its lifetime ends.
 */
export class RoomObject extends DurableObject<Env> {
  // In memory only: resetting when the object is evicted is fine for a rate limit.
  private readonly buckets = new Map<string, Bucket>();

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

  /** `rateLimitKey` identifies the sender when the danmu came through the public API. */
  async deliver(danmu: Danmu, rateLimitKey?: string): Promise<DeliverResult> {
    const meta = await this.meta();
    if (!meta?.online) return 'offline';
    if (rateLimitKey && !this.takeToken(rateLimitKey)) return 'rate_limited';

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
    // 1005/1006/1015 only describe how the peer went away (no status, abnormal, TLS) and are
    // not allowed in a close frame, so answer those with a normal closure.
    if (code === 1005 || code === 1006 || code === 1015) socket.close(1000, 'closed');
    else socket.close(code, reason);
  }

  private takeToken(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: RATE_LIMIT_BURST, updatedAt: now };
    const refilled = Math.min(
      RATE_LIMIT_BURST,
      bucket.tokens + (now - bucket.updatedAt) / RATE_LIMIT_REFILL_MS,
    );
    if (refilled < 1) {
      this.buckets.set(key, { tokens: refilled, updatedAt: now });
      return false;
    }
    this.buckets.set(key, { tokens: refilled - 1, updatedAt: now });
    return true;
  }

  private meta() {
    return this.ctx.storage.get<RoomMeta>('meta');
  }
}
