import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import app from '../src/index';

const PUBLIC = 'https://danmu.example.org';

function get(url: string, method = 'GET') {
  const ctx = {
    waitUntil() {},
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;
  return app.fetch(
    new Request(url, { method, redirect: 'manual' }),
    { ...env, PUBLIC_URL: PUBLIC },
    ctx,
  );
}

describe('public address', () => {
  it.each(['/login?next=/host/rooms', '/host', '/host/rooms', '/auth/google?next=%2Fhost'])(
    'sends %s on workers.dev to the public address',
    async (path) => {
      const response = await get(`https://danmu-classroom.yanghongxin.workers.dev${path}`);
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`${PUBLIC}${path}`);
    },
  );

  it.each(['/', '/privacy', '/r/1234', '/screen', '/api/rooms'])(
    'keeps serving %s on workers.dev',
    async (path) => {
      const response = await get(`https://danmu-classroom.yanghongxin.workers.dev${path}`);
      expect(response.status).not.toBe(301);
    },
  );

  it('serves the host pages on the public address itself', async () => {
    const response = await get(`${PUBLIC}/login`);
    expect(response.status).toBe(200);
  });

  it('leaves localhost alone for development', async () => {
    expect((await get('http://localhost:8787/login')).status).toBe(200);
  });

  it('does not redirect form posts', async () => {
    const response = await get('https://danmu-classroom.yanghongxin.workers.dev/logout', 'POST');
    expect(response.status).not.toBe(301);
  });
});
