// Shared response envelope — { data, error, meta }.
// Per auth-api/.ai/instruct.md → Module-Specific Rules → Layering → Rule 4.

export function ok<T>(data: T, meta: Record<string, unknown> = {}) {
  return { data, error: null, meta };
}

export function fail(code: string, details: unknown = null) {
  return { data: null, error: { code, details }, meta: {} };
}
