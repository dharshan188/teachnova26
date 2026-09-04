'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Fetches `fetcher` on mount and exposes `refetch` for manual reload.
 * The fetcher is kept in a ref (updated via effect) so inline functions do not
 * retrigger loads, and any changing input the fetcher closes over can be read
 * at call time. Filtering by changing inputs should be done client-side after
 * a single fetch, or by calling `refetch()`.
 */
export function useAsync<T>(fetcher: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef<() => Promise<T>>(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await fetcherRef.current()
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tick])

  const refetch = useCallback(() => {
    setLoading(true)
    setTick((t) => t + 1)
  }, [])

  return { data, loading, error, refetch }
}
