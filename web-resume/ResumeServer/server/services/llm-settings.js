// DB-backed LLM config with a short TTL cache.
// Allows admin to change the AI endpoint/model/key at runtime without a restart.
// Call invalidateLlmCache() after saving new settings so the next request picks them up.

import { db } from '../database/database.js';
import { env } from '../config/env.js';

const SETTING_KEYS = ['llm_api_url', 'llm_api_key', 'llm_model'];
const TTL_MS = 30_000; // 30 seconds

let _cache = null;
let _cacheAt = 0;

export async function getLlmConfig() {
  const now = Date.now();
  if (_cache && now - _cacheAt < TTL_MS) return _cache;

  try {
    const r = await db.query(
      'SELECT key, value FROM settings WHERE key = ANY($1)',
      [SETTING_KEYS]
    );
    const s = Object.fromEntries(r.rows.map((row) => [row.key, row.value]));
    _cache = {
      apiUrl: s.llm_api_url ?? env.llmApiUrl,
      apiKey: s.llm_api_key ?? null,
      model:  s.llm_model   ?? env.llmModel,
    };
    _cacheAt = now;
  } catch {
    // DB unreachable — fall back to env without caching so we retry next call
    return { apiUrl: env.llmApiUrl, apiKey: null, model: env.llmModel };
  }

  return _cache;
}

export function invalidateLlmCache() {
  _cache = null;
}
