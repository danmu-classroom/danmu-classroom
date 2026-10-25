import type { CreatedRoom, Danmu, ScreenMessage } from '@danmu/shared';

export interface ScreenConnectionOptions {
  /** Server origin, e.g. `http://localhost:8787`. */
  upstream: string;
  onRoom: (room: CreatedRoom) => void;
  onDanmu: (danmu: Danmu) => void;
  onError?: (error: unknown) => void;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  pingIntervalMs?: number;
  maxReconnectDelayMs?: number;
}

const ROOM_CLOSED = 4000;

/**
 * Opens a room and keeps a WebSocket to it: reconnects with backoff when the connection
 * drops, and opens a new room when the server closes the old one (rooms expire after 3 hours).
 */
export class ScreenConnection {
  private room: CreatedRoom | null = null;
  private socket: WebSocket | null = null;
  private stopped = true;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: ScreenConnectionOptions) {}

  get currentRoom() {
    return this.room;
  }

  /** Starts in the background; failures are reported to `onError` and retried. */
  start() {
    this.stopped = false;
    this.reopenRoom();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    this.socket?.close(1000, 'screen stopped');
    this.socket = null;
  }

  private reopenRoom = () => {
    this.openRoom().catch((error: unknown) => this.retry(error, this.reopenRoom));
  };

  private async openRoom() {
    const fetchImpl = this.options.fetch ?? fetch;
    const response = await fetchImpl(new URL('/api/rooms', this.options.upstream), {
      method: 'POST',
    });
    if (!response.ok) throw new Error(`create room failed: HTTP ${response.status}`);

    this.room = (await response.json()) as CreatedRoom;
    if (this.stopped) return;
    this.options.onRoom(this.room);
    this.connect();
  }

  private connect() {
    if (this.stopped || !this.room) return;

    const url = new URL(`/api/rooms/${this.room.key}/ws`, this.options.upstream);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('auth_token', this.room.auth_token);

    const WebSocketImpl = this.options.WebSocket ?? WebSocket;
    const socket = new WebSocketImpl(url.toString());
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(
        () => socket.send('ping'),
        this.options.pingIntervalMs ?? 30_000,
      );
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      const message = JSON.parse(event.data) as ScreenMessage;
      if (message.type === 'danmu') this.options.onDanmu(message.danmu);
    });

    socket.addEventListener('close', (event: CloseEvent) => {
      clearInterval(this.pingTimer);
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;

      if (event.code === ROOM_CLOSED) {
        this.reopenRoom();
      } else {
        this.retry(new Error(`socket closed: ${event.code}`), () => this.connect());
      }
    });
  }

  private retry(error: unknown, action: () => void) {
    this.options.onError?.(error);
    if (this.stopped) return;

    const delay = Math.min(
      1000 * 2 ** this.reconnectAttempts,
      this.options.maxReconnectDelayMs ?? 30_000,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(action, delay);
  }
}
