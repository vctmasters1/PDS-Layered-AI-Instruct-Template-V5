import { useState, useEffect, useCallback, useRef } from 'react'

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const counter = useRef(0)

  const load = useCallback(() => {
    const id = ++counter.current
    setLoading(true)
    setError(null)
    fetcher()
      .then(d => { if (counter.current === id) { setData(d); setLoading(false) } })
      .catch(e => { if (counter.current === id) { setError(e.message ?? 'Failed to load'); setLoading(false) } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load }
}
