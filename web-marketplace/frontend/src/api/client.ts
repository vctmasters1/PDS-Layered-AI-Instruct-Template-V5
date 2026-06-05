const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/v1'

export interface ApiError {
  error: string
  details?: string[]
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const err: ApiError = await response.json().catch(() => ({ error: 'Request failed' }))
    const msg = err.details ? err.details.join('; ') : (err.error || 'Request failed')
    throw new Error(msg)
  }

  return response.json()
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
