// See server/AI-INSTRUCT.md — all DB access must go through this module
import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

export const db = {
  async query(sql, params = []) {
    const client = getPool();
    return client.query(sql, params);
  },

  async getUserById(id) {
    const r = await this.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  },

  async getUserByUsername(username) {
    const r = await this.query('SELECT * FROM users WHERE username = $1', [username]);
    return r.rows[0] ?? null;
  },

  async getListingById(id) {
    const r = await this.query('SELECT * FROM listings WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  },

  async getListingByUserAndId(userId, listingId) {
    const r = await this.query(
      'SELECT * FROM listings WHERE id = $1 AND user_id = $2',
      [listingId, userId]
    );
    return r.rows[0] ?? null;
  },

  async getArtifactsByListing(listingId) {
    const r = await this.query(
      'SELECT * FROM artifacts WHERE listing_id = $1 ORDER BY created_at',
      [listingId]
    );
    return r.rows;
  },

  async getLatestJobForStep(listingId, step) {
    const r = await this.query(
      `SELECT * FROM workflow_jobs
       WHERE listing_id = $1 AND step = $2
       ORDER BY created_at DESC LIMIT 1`,
      [listingId, step]
    );
    return r.rows[0] ?? null;
  },

  async getLatestUserJobForStep(userId, step) {
    const r = await this.query(
      `SELECT * FROM workflow_jobs
       WHERE user_id = $1 AND listing_id IS NULL AND step = $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, step]
    );
    return r.rows[0] ?? null;
  },

  async upsertArtifact(listingId, filename, step) {
    await this.query(
      `INSERT INTO artifacts (listing_id, filename, step)
       VALUES ($1, $2, $3)
       ON CONFLICT (listing_id, filename) DO UPDATE SET step = EXCLUDED.step, created_at = NOW()`,
      [listingId, filename, step]
    );
  },

  async getProfile(userId) {
    const r = await this.query('SELECT profile FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.profile ?? {};
  },

  async setProfile(userId, profile) {
    await this.query('UPDATE users SET profile = $1 WHERE id = $2', [JSON.stringify(profile), userId]);
  },

  async getSetting(key) {
    const r = await this.query('SELECT value FROM settings WHERE key = $1', [key]);
    return r.rows[0]?.value ?? null;
  },

  async setSetting(key, value) {
    await this.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, String(value)]
    );
  },

  async close() {
    if (pool) {
      await pool.end();
      pool = null;
    }
  },
};
