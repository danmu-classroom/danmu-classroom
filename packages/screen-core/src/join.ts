import type { CreatedRoom } from '@danmu/shared';
import { renderSVG } from 'uqr';

/** Page where the audience sends danmus to a room from a phone or computer. */
export function joinUrl(upstream: string, roomKey: string) {
  return new URL(`/r/${encodeURIComponent(roomKey)}`, upstream).toString();
}

/** `joinUrl` without the scheme, short enough to read off a screen. */
export function displayJoinUrl(upstream: string, roomKey: string) {
  return joinUrl(upstream, roomKey).replace(/^https?:\/\//, '');
}

/** QR code of the join URL as a standalone SVG string (black on white, with a quiet zone). */
export function joinQrSvg(upstream: string, roomKey: string) {
  return renderSVG(joinUrl(upstream, roomKey), { border: 2 });
}

/**
 * One-time link (valid ~10 minutes) that adds the room to the host's account once opened in a
 * signed-in browser. The screen proves it owns the room with the room's auth token.
 */
export async function requestClaimUrl(
  upstream: string,
  room: Pick<CreatedRoom, 'key' | 'auth_token'>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(new URL(`/api/rooms/${room.key}/claim-codes`, upstream), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_token: room.auth_token }),
  });
  if (!response.ok) throw new Error(`claim link failed: HTTP ${response.status}`);
  return ((await response.json()) as { url: string }).url;
}
