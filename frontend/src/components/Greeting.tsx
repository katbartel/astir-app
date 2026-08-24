'use client'

import { useEffect } from 'react'
import { firstName, useUser } from './UserProvider'

// Same store the prototype uses; hasVisited rides along inside it so the
// greeting survives the eventual localStorage-to-database migration intact.
const storageKey = 'astir.v1'

function markVisited() {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    window.localStorage.setItem(storageKey, JSON.stringify({ ...saved, hasVisited: true }))
  } catch {
    // localStorage unavailable; greet as a first visit again next time.
  }
}

// Whether this is a first visit lives in localStorage, so neither the server
// nor React's first client render can know it. Deciding the wording in state
// meant every returning visit rendered "Welcome" and swapped to "Welcome back"
// once the effect ran — a visible flash of the wrong greeting.
//
// So render both and let CSS pick, driven by the data-visited attribute the
// blocking script in the root layout sets before first paint. The markup is
// identical on the server and the client, so there is nothing to hydrate
// around, and the correct wording is the only one ever painted.
export function Greeting() {
  const user = useUser()

  useEffect(() => {
    markVisited()
  }, [])

  return (
    <h1>
      <span className="greet-first">Welcome</span>
      <span className="greet-back">Welcome back</span>, {firstName(user)}
    </h1>
  )
}
