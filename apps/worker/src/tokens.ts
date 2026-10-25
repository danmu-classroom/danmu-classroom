import { ROOM_KEY_LENGTH } from '@danmu/shared';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Random digits, e.g. "0427". */
export function generateRoomKey(length = ROOM_KEY_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => String(n % 10)).join('');
}

/** 24 base58 characters, like Rails' `SecureRandom.base58(24)`. */
export function generateAuthToken(length = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (n) => BASE58[n % BASE58.length]).join('');
}
