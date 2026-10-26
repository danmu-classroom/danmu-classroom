import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { generateCodeVerifier, generateState } from 'arctic';
import { Layout } from '../layout';
import { findProvider, SSO_PROVIDERS } from './providers';
import { endSession, startSession } from './sessions';
import { upsertSsoUser } from './users';

export const auth = new Hono<{ Bindings: Env }>();

type AppContext = Context<{ Bindings: Env }>;

const OAUTH_COOKIE_MAX_AGE = 10 * 60;

/** Only same-site paths are allowed as a post-login destination. */
export function safeNext(next: string | undefined) {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/host';
}

/** Local-only login without an SSO provider, for development (`DEV_LOGIN=true` in .dev.vars). */
export function devLoginEnabled(c: AppContext) {
  const { hostname } = new URL(c.req.url);
  return c.env.DEV_LOGIN === 'true' && (hostname === 'localhost' || hostname === '127.0.0.1');
}

function LoginPage({ c, next, error }: { c: AppContext; next: string; error?: string }) {
  const providers = SSO_PROVIDERS.filter((provider) => provider.enabled(c.env));
  return (
    <Layout title="主持人登入 · 彈幕教室">
      <h1>主持人登入</h1>
      <p class="muted">登入後，你開的房間和彈幕紀錄都會保存在帳號裡。</p>
      <div class="card">
        {providers.map((provider) => (
          <form method="get" action={`/auth/${provider.id}`}>
            <input type="hidden" name="next" value={next} />
            <button type="submit" class="provider">
              {provider.label}
            </button>
          </form>
        ))}
        {devLoginEnabled(c) && (
          <form method="post" action="/auth/dev">
            <input type="hidden" name="next" value={next} />
            <button type="submit" class="secondary">
              開發用登入（僅限 localhost）
            </button>
          </form>
        )}
        {providers.length === 0 && !devLoginEnabled(c) && (
          <p class="status-error">目前沒有可用的登入方式。</p>
        )}
        {error && <p class="status-error">{error}</p>}
      </div>
    </Layout>
  );
}

auth.get('/login', (c) => c.html(<LoginPage c={c} next={safeNext(c.req.query('next'))} />));

auth.get('/auth/:provider', (c) => {
  const provider = findProvider(c.req.param('provider'));
  if (!provider?.enabled(c.env)) return c.notFound();

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const secure = new URL(c.req.url).protocol === 'https:';
  const cookie = {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/auth',
    maxAge: OAUTH_COOKIE_MAX_AGE,
  } as const;
  setCookie(c, 'oauth_state', state, cookie);
  setCookie(c, 'oauth_code_verifier', codeVerifier, cookie);
  setCookie(c, 'oauth_next', safeNext(c.req.query('next')), cookie);

  const redirectUri = new URL(`/auth/${provider.id}/callback`, c.req.url).toString();
  return c.redirect(provider.authorizationUrl(c.env, redirectUri, state, codeVerifier).toString());
});

auth.get('/auth/:provider/callback', async (c) => {
  const provider = findProvider(c.req.param('provider'));
  if (!provider?.enabled(c.env)) return c.notFound();

  const state = getCookie(c, 'oauth_state');
  const codeVerifier = getCookie(c, 'oauth_code_verifier');
  const next = safeNext(getCookie(c, 'oauth_next'));
  for (const name of ['oauth_state', 'oauth_code_verifier', 'oauth_next']) {
    deleteCookie(c, name, { path: '/auth' });
  }

  const code = c.req.query('code');
  if (!code || !state || !codeVerifier || c.req.query('state') !== state) {
    return c.html(<LoginPage c={c} next={next} error="登入逾時或已取消，請再試一次。" />, 400);
  }

  try {
    const redirectUri = new URL(`/auth/${provider.id}/callback`, c.req.url).toString();
    const profile = await provider.fetchProfile(c.env, redirectUri, code, codeVerifier);
    const user = await upsertSsoUser(c.env.DB, profile);
    await startSession(c, user.id);
    return c.redirect(next);
  } catch (error) {
    console.error('auth @ callback failed', error);
    return c.html(<LoginPage c={c} next={next} error="登入失敗，請再試一次。" />, 400);
  }
});

auth.post('/auth/dev', async (c) => {
  if (!devLoginEnabled(c)) return c.notFound();

  const form = await c.req.parseBody();
  const user = await upsertSsoUser(c.env.DB, {
    provider: 'dev',
    providerUserId: 'dev',
    email: 'dev@localhost',
    name: '開發用主持人',
    picture: null,
  });
  await startSession(c, user.id);
  return c.redirect(safeNext(typeof form.next === 'string' ? form.next : undefined));
});

auth.post('/logout', async (c) => {
  await endSession(c);
  return c.redirect('/');
});
