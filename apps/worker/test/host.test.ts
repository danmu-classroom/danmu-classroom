import { env } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreatedRoom } from '@danmu/shared';

const LOCAL = 'http://localhost:8787';

function request(path: string, init: RequestInit & { cookie?: string } = {}, origin = LOCAL) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  return exports.default.fetch(
    new Request(`${origin}${path}`, { ...init, headers, redirect: 'manual' }),
  );
}

function form(path: string, fields: Record<string, string>, cookie?: string, origin = LOCAL) {
  return request(
    path,
    {
      method: 'POST',
      cookie,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
      body: new URLSearchParams(fields).toString(),
    },
    origin,
  );
}

/** "name=value" pairs from Set-Cookie headers, ready for a Cookie header. */
function cookiesFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function devLogin() {
  const response = await form('/auth/dev', { next: '/host/rooms' });
  expect(response.status).toBe(302);
  return cookiesFrom(response);
}

async function createRoom(cookie?: string): Promise<CreatedRoom> {
  const response = await request('/api/rooms', { method: 'POST', cookie });
  return response.json();
}

function fakeIdToken(claims: Record<string, unknown>) {
  const encode = (value: object) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}

async function googleLogin(claims: Record<string, unknown>) {
  const start = await request('/auth/google?next=/host/rooms');
  const authorizeUrl = new URL(start.headers.get('Location')!);
  const state = authorizeUrl.searchParams.get('state')!;

  const tokenRequests: Request[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    tokenRequests.push(new Request(input, init));
    return Promise.resolve(
      Response.json({
        access_token: 'access',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: fakeIdToken(claims),
      }),
    );
  });
  const callback = await request(`/auth/google/callback?code=auth-code&state=${state}`, {
    cookie: cookiesFrom(start),
  });
  vi.unstubAllGlobals();
  return { start, authorizeUrl, callback, tokenRequests };
}

describe('host sign-in', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends signed-out visitors of /host to the login page', async () => {
    const response = await request('/host/rooms');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login?next=%2Fhost%2Frooms');
  });

  it('offers Google login, and the dev login only on localhost', async () => {
    const local = await (await request('/login')).text();
    expect(local).toContain('使用 Google 登入');
    expect(local).toContain('開發用登入');

    const remote = await (await request('/login', {}, 'https://danmu.example.com')).text();
    expect(remote).toContain('使用 Google 登入');
    expect(remote).not.toContain('開發用登入');
    expect((await form('/auth/dev', {}, undefined, 'https://danmu.example.com')).status).toBe(404);
  });

  it('signs in with Google (PKCE) and keeps one user per Google account', async () => {
    const claims = {
      sub: 'google-123',
      email: 'teacher@example.com',
      email_verified: true,
      name: '王老師',
    };
    const { authorizeUrl, callback, tokenRequests } = await googleLogin(claims);

    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(authorizeUrl.searchParams.get('client_id')).toBe('test-google-client');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(`${LOCAL}/auth/google/callback`);
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizeUrl.searchParams.get('scope')).toBe('openid email profile');
    expect(tokenRequests[0]?.url).toBe('https://oauth2.googleapis.com/token');

    expect(callback.status).toBe(302);
    expect(callback.headers.get('Location')).toBe('/host/rooms');
    const page = await (await request('/host/rooms', { cookie: cookiesFrom(callback) })).text();
    expect(page).toContain('王老師');

    await googleLogin({ ...claims, name: '王老師（改名）' });
    const users = await env.DB.prepare('SELECT name, email FROM users').all();
    expect(users.results).toEqual([{ name: '王老師（改名）', email: 'teacher@example.com' }]);
  });

  it('rejects a callback whose state does not match', async () => {
    const start = await request('/auth/google');

    const response = await request('/auth/google/callback?code=x&state=forged', {
      cookie: cookiesFrom(start),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('登入逾時或已取消');
  });

  it('only accepts form posts from this site (CSRF)', async () => {
    const response = await request('/auth/dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://evil.example',
      },
      body: '',
    });

    expect(response.status).toBe(403);
  });

  it('logs out', async () => {
    const cookie = await devLogin();

    const logout = await form('/logout', {}, cookie);
    expect(logout.status).toBe(302);
    expect((await request('/host/rooms', { cookie })).status).toBe(302);
  });

  it('ignores off-site next destinations', async () => {
    const response = await form('/auth/dev', { next: '//evil.example/' });

    expect(response.headers.get('Location')).toBe('/host');
  });
});

describe('host rooms', () => {
  it('rooms opened by a signed-in browser show up with their danmu history and CSV', async () => {
    const cookie = await devLogin();
    const room = await createRoom(cookie);
    for (const [content, uid] of [
      ['你好', 'a'],
      ['有 "引號", 也有逗號', 'b'],
    ]) {
      await request(`/api/rooms/${room.key}/danmus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ danmu: { content, sender: { provider: 'web', uid } } }),
      });
    }

    const list = await (await request('/host/rooms', { cookie })).text();
    expect(list).toContain(`>${room.key}</a>`);
    expect(list).toContain('進行中');

    const detail = await (await request(`/host/rooms/${room.id}`, { cookie })).text();
    expect(detail).toContain('2 則彈幕');
    expect(detail).toContain('你好');
    expect(detail).toContain('網頁');

    const csv = await request(`/host/rooms/${room.id}/danmus.csv`, { cookie });
    expect(csv.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM for Excel
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('created_at,content,source\r\n')).toBe(true);
    expect(text).toContain('"有 ""引號"", 也有逗號","web"');
  });

  it("does not show other hosts' rooms", async () => {
    const owner = await devLogin();
    const room = await createRoom(owner);
    const { callback } = await googleLogin({ sub: 'someone-else' });
    const other = cookiesFrom(callback);

    expect((await request(`/host/rooms/${room.id}`, { cookie: other })).status).toBe(404);
    expect(await (await request('/host/rooms', { cookie: other })).text()).toContain('還沒有房間');
  });

  it('anonymous rooms are not owned by anyone', async () => {
    const room = await createRoom();

    const row = await env.DB.prepare('SELECT owner_id FROM rooms WHERE id = ?')
      .bind(room.id)
      .first();
    expect(row).toEqual({ owner_id: null });
  });
});

describe('claiming a room from a screen', () => {
  async function claimUrl(room: CreatedRoom, token = room.auth_token) {
    return request(`/api/rooms/${room.key}/claim-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_token: token }),
    });
  }

  it('the screen gets a one-time link; the signed-in host confirms and owns the room', async () => {
    const room = await createRoom();
    const response = await claimUrl(room);
    expect(response.status).toBe(201);
    const { url } = await response.json<{ url: string }>();
    const link = new URL(url);
    expect(link.pathname).toBe('/host/claim');
    const code = link.searchParams.get('code')!;

    const signedOut = await request(`/host/claim?code=${code}`);
    expect(signedOut.headers.get('Location')).toBe(
      `/login?next=${encodeURIComponent(`/host/claim?code=${code}`)}`,
    );

    const cookie = await devLogin();
    expect(await (await request(`/host/claim?code=${code}`, { cookie })).text()).toContain(
      `保存房號 ${room.key}？`,
    );

    const confirmed = await form('/host/claim', { code }, cookie);
    expect(confirmed.status).toBe(302);
    expect(confirmed.headers.get('Location')).toBe(`/host/rooms/${room.id}`);
    expect((await request(`/host/rooms/${room.id}`, { cookie })).status).toBe(200);

    expect((await form('/host/claim', { code }, cookie)).status).toBe(400);
  });

  it('needs the room auth token', async () => {
    const room = await createRoom();

    expect((await claimUrl(room, 'wrong')).status).toBe(401);
  });

  it('cannot take a room that belongs to another host', async () => {
    const owner = await devLogin();
    const room = await createRoom(owner);
    const { url } = await (await claimUrl(room)).json<{ url: string }>();
    const code = new URL(url).searchParams.get('code')!;

    const { callback } = await googleLogin({ sub: 'intruder' });
    const intruder = cookiesFrom(callback);

    expect((await request(`/host/claim?code=${code}`, { cookie: intruder })).status).toBe(403);
    expect((await form('/host/claim', { code }, intruder)).status).toBe(400);
  });
});
