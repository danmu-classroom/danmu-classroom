import type { CreatedRoom, Danmu, ScreenMessage } from '@danmu/shared';
import { exports } from 'cloudflare:workers';

export const BASE = 'http://danmu.test';

export function api(path: string, init?: RequestInit) {
  return exports.default.fetch(new Request(`${BASE}/api${path}`, init));
}

export async function createRoom(): Promise<CreatedRoom> {
  const response = await api('/rooms', { method: 'POST' });
  if (response.status !== 201) throw new Error(`create room: HTTP ${response.status}`);
  return response.json();
}

export function postDanmu(key: string, content: string, uid = 'u1') {
  return api(`/rooms/${key}/danmus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ danmu: { content, sender: { provider: 'test', uid } } }),
  });
}

export async function popDanmus(room: CreatedRoom): Promise<Danmu[]> {
  const response = await api(`/rooms/${room.key}/danmus?auth_token=${room.auth_token}`);
  return response.json();
}

/** Opens the screen WebSocket and collects every message it receives. */
export async function connectScreen(room: CreatedRoom, token = room.auth_token) {
  const response = await api(`/rooms/${room.key}/ws?auth_token=${token}`, {
    headers: { Upgrade: 'websocket' },
  });
  const socket = response.webSocket;
  if (!socket) return { response, socket: null, messages: [] as ScreenMessage[] };

  const messages: ScreenMessage[] = [];
  const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener('close', resolve));
  socket.addEventListener('message', (event) => {
    messages.push(JSON.parse(event.data as string) as ScreenMessage);
  });
  socket.accept();
  return { response, socket, messages, closed };
}

/** Lets queued WebSocket events run. */
export async function waitFor(condition: () => boolean, timeoutMs = 1000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
