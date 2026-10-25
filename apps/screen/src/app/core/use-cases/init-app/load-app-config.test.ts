import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAppConfig() {
  vi.resetModules();
  const { appConfig } = await import('./load-app-config');
  return appConfig;
}

describe('appConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the deployed Worker by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect((await loadAppConfig()).upstream).toMatch(/^https:\/\/.+\.workers\.dev$/);
  });

  it('uses `wrangler dev` in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DANMU_UPSTREAM', '');

    expect((await loadAppConfig()).upstream).toBe('http://localhost:8787');
  });

  it('lets DANMU_UPSTREAM override the server in development only', async () => {
    vi.stubEnv('DANMU_UPSTREAM', 'http://192.168.1.10:8787');

    vi.stubEnv('NODE_ENV', 'development');
    expect((await loadAppConfig()).upstream).toBe('http://192.168.1.10:8787');

    vi.stubEnv('NODE_ENV', 'production');
    expect((await loadAppConfig()).upstream).toMatch(/workers\.dev$/);
  });
});
