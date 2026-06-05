// Validates required environment variables at startup and provides typed accessors.
// Called once before the server binds. Throws if anything critical is missing.

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nCopy .env.example → .env and fill in the values.`);
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }
}

export const env = {
  port:               Number(process.env.PORT ?? 38291),
  nodeEnv:            process.env.NODE_ENV ?? 'development',
  jwtSecret:          process.env.JWT_SECRET,
  llmApiUrl:          process.env.LLM_API_URL ?? 'http://localhost:1234',
  // Multi-GPU: LLM_URLS=http://host:1234,http://host:1235 (separate ports, rarely needed)
  llmApiUrls:         (process.env.LLM_URLS ?? process.env.LLM_API_URL ?? 'http://localhost:1234')
                        .split(',').map((u) => u.trim()).filter(Boolean),
  llmModel:           process.env.LLM_MODEL ?? 'qwen/qwen3.6-35b-a3b',
  // Multi-GPU: LLM_MODEL_IDS=qwen-0,qwen-1,qwen-2 — one named instance per slot (same port)
  llmModelIds:        (process.env.LLM_MODEL_IDS ?? '').trim()
                        ? process.env.LLM_MODEL_IDS.split(',').map((s) => s.trim()).filter(Boolean)
                        : null,
  llmTimeoutMs:       Number(process.env.LLM_TIMEOUT_MS ?? 120000),
  userDataPath:       process.env.USERDATA_PATH || null,
  pythonCmd:          process.env.PYTHON_CMD ?? 'python3',
  extensionServerUrl: process.env.EXTENSION_SERVER_URL || null,
  isDev:              (process.env.NODE_ENV ?? 'development') === 'development',
};
