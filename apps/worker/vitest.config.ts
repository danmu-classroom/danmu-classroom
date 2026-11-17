import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            LINE_CHANNEL_SECRET: 'test_channel_secret',
            LINE_CHANNEL_TOKEN: 'test_channel_token',
            GOOGLE_CLIENT_ID: 'test-google-client',
            GOOGLE_CLIENT_SECRET: 'test-google-secret',
            DEV_LOGIN: 'true',
            // Tests use their own hosts; the redirect is tested with its own env
            PUBLIC_URL: '',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
