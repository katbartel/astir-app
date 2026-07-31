import { cookies } from 'next/headers'
import type { Application } from './applications'

const SESSION_COOKIE = 'astir_session'

// Server-side requests go straight to the backend (the /api rewrite only
// applies to browser requests). API_TARGET matches next.config.ts. Same shape
// as getCurrentUser in ./auth.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000'

// The signed-in user's applications, fetched while the page is being rendered
// so Home, Pipeline and All applications arrive with their content already in
// the HTML instead of painting empty and filling in afterwards.
//
// Rows come back raw: normalizing them needs normalizeStageId from ./stages,
// which is a 'use client' module and cannot be called from a server component.
// ApplicationsProvider normalizes them on the way into state.
export async function getInitialApplications(): Promise<Application[] | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  if (!session) {
    return null
  }
  try {
    const response = await fetch(`${apiTarget}/api/applications`, {
      headers: { cookie: `${SESSION_COOKIE}=${session.value}` },
      cache: 'no-store',
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as Application[]
  } catch {
    // Backend unreachable: fall back to the client fetch rather than crashing
    // the page, exactly as getCurrentUser does.
    return null
  }
}
