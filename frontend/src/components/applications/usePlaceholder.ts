'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Whether to show a loading placeholder, with the two rules that stop it being
// worse than showing nothing:
//
//   - nothing appears unless loading is still going after `delay`, so a fast
//     response never flashes a placeholder on and straight back off;
//   - once it does appear it stays for at least `hold`, so it never appears and
//     vanishes within a frame or two.
//
// Starts false, so the server renders no placeholder and the first client
// render matches it.
export function useLoadingPlaceholder(loading: boolean, delay = 200, hold = 300): boolean {
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    if (loading) {
      if (visible) return
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, delay)
      return () => window.clearTimeout(timer)
    }
    if (!visible) return
    const remaining = hold - (Date.now() - shownAt.current)
    if (remaining <= 0) {
      setVisible(false)
      return
    }
    const timer = window.setTimeout(() => setVisible(false), remaining)
    return () => window.clearTimeout(timer)
  }, [loading, visible, delay, hold])

  return visible
}

// How many placeholder rows to draw: the number this list had the last time it
// loaded. A pipeline changes maybe once a day, so last visit's count is almost
// always this visit's count, and the placeholder ends up the same size as the
// content that replaces it.
//
// Read in an effect rather than during render — reading localStorage while
// rendering would make the client's first output differ from the server's.
export function useRememberedCount(
  key: string,
  fallback: number,
): [number, (count: number) => void] {
  const [count, setCount] = useState(fallback)

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(key))
      if (Number.isFinite(stored) && stored > 0) {
        setCount(Math.min(stored, 12))
      }
    } catch {
      // Private mode or a disabled store: the fallback is fine.
    }
  }, [key])

  const remember = useCallback(
    (next: number) => {
      setCount(next > 0 ? next : fallback)
      try {
        window.localStorage.setItem(key, String(next))
      } catch {
        // Nothing to do: the count is only ever an optimisation.
      }
    },
    [key, fallback],
  )

  return [count, remember]
}
