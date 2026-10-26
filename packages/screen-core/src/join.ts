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
