import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { randomToken, sha256Hex } from './tokens';
import type { User } from './users';

const SESSION_DAYS = 30;

/** Any Hono context with this Worker's bindings (routes may add their own variables). */
type EnvContext<E extends { Bindings: Env } = { Bindings: Env }> = Context<E>;

/** `__Host-` cookies must be Secure, so plain-http local development uses a plain name. */
function cookieName(c: Context) {
  return new URL(c.req.url).protocol === 'https:' ? '__Host-danmu_session' : 'danmu_session';
}

export async function startSession<E extends { Bindings: Env }>(c: EnvContext<E>, userId: number) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), userId, expiresAt.toISOString())
    .run();

  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
}

/** The signed-in user, or null. Expired sessions are ignored (and cleaned up). */
export async function currentUser<E extends { Bindings: Env }>(
  c: EnvContext<E>,
): Promise<User | null> {
  const token = getCookie(c, cookieName(c));
  if (!token) return null;

  const id = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT sessions.expires_at, users.id, users.email, users.name, users.picture
     FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?`,
  )
    .bind(id)
    .first<User & { expires_at: string }>();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, picture: row.picture };
}

export async function endSession<E extends { Bindings: Env }>(c: EnvContext<E>) {
  const token = getCookie(c, cookieName(c));
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?')
      .bind(await sha256Hex(token))
      .run();
  }
  deleteCookie(c, cookieName(c), { path: '/', secure: new URL(c.req.url).protocol === 'https:' });
}
