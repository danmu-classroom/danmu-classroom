import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// D1 is shared by the tests in a file; start each test from empty tables.
// AUTOINCREMENT never reuses ids, so rooms (and their Durable Objects) stay distinct.
beforeEach(async () => {
  await env.DB.batch(
    ['DELETE FROM danmus', 'DELETE FROM senders', 'DELETE FROM rooms'].map((sql) =>
      env.DB.prepare(sql),
    ),
  );
});
