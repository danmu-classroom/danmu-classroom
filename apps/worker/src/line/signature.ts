function decodeBase64(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Checks `X-Line-Signature`: base64 HMAC-SHA256 of the raw body, keyed by the channel secret. */
export async function verifyLineSignature(
  channelSecret: string,
  body: string,
  signature: string | undefined,
): Promise<boolean> {
  const expected = signature ? decodeBase64(signature) : null;
  if (!channelSecret || !expected) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  // subtle.verify compares in constant time
  return crypto.subtle.verify('HMAC', key, expected, encoder.encode(body));
}
