// Integration tests: routes against a real Postgres + Redis via testcontainers.
// Per auth-api/.ai/instruct.md → Testing Rules:
//   "Every route has at least one integration test that hits a real Postgres
//    (testcontainers) and a real Redis."
//
// These tests are skipped in this example because the example repo does not ship
// the testcontainers dependency. In a real project:
//   1. Add `testcontainers` and `@testcontainers/postgresql` to devDependencies.
//   2. Remove the .skip modifiers below.
//   3. Implement the helpers (startPostgres, runMigrations, startRedis) for your stack.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';

// Real impl: start containers once per suite, run migrations, seed fixtures.
async function startPostgres() { return { connectionString: '' }; }
async function startRedis() { return { url: '' }; }
async function runMigrations(_connectionString: string) {}

describe.skip('POST /v1/auth/login (integration)', () => {
  beforeAll(async () => {
    const pg = await startPostgres();
    const _redis = await startRedis();
    await runMigrations(pg.connectionString);
  });

  afterAll(async () => {
    // Tear down containers.
  });

  it('returns 401 for unknown email', async () => {
    // const res = await request(app).post('/v1/auth/login').send({ email: 'nobody@example.com', password: 'password' });
    // expect(res.status).toBe(401);
    expect(true).toBe(true);
  });
});

describe.skip('POST /v1/auth/signup (integration)', () => {
  it('returns 201 and tokens for a new email', async () => {
    expect(true).toBe(true);
  });

  it('returns 409 when email is already registered', async () => {
    expect(true).toBe(true);
  });
});

describe.skip('POST /v1/auth/reset-password (integration)', () => {
  it('returns 200 regardless of whether the email exists', async () => {
    expect(true).toBe(true);
  });
});
