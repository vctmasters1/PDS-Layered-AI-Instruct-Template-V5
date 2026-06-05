/**
 * apiClient.ts
 * Thin fetch wrapper for all calls to WEB-HMI/api (/v1/*).
 *
 * In dev, Vite proxies /v1/* → http://localhost:3001 (see vite.config.ts).
 * In production, requests go to the same origin (Express serves the built SPA).
 *
 * All requests include credentials (httpOnly cookie for session auth).
 */

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
  };

  if (body !== undefined) {
    (init as any).body = JSON.stringify(body);
  }

  // VITE_API_PREFIX is set in Railway dashboard (e.g. /hmi/api). Empty string in local dev.
  const _apiPrefix = (import.meta.env.VITE_API_PREFIX as string | undefined) ?? '';
  const res = await fetch(`${_apiPrefix}/v1${path}`, init);

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }));
    const err = Object.assign(new Error(payload.error || res.statusText), {
      status: res.status,
    });
    throw err;
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get:    <T>(path: string)                => request<T>("GET",    path),
  post:   <T>(path: string, body: unknown) => request<T>("POST",   path, body),
  patch:  <T>(path: string, body: unknown) => request<T>("PATCH",  path, body),
  delete: <T>(path: string)                => request<T>("DELETE", path),
};
