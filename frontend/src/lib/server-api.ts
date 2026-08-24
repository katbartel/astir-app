import { cookies } from 'next/headers'

const SESSION_COOKIE = 'astir_session'

// Server-side requests go straight to the backend (the /api rewrite only
// applies to browser requests). API_TARGET matches next.config.ts.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000'

// An authenticated GET made while the page is being rendered, so a screen can
// arrive with its content already in the HTML instead of painting a loading
// line and filling in afterwards.
//
// Returns null rather than throwing whenever the data cannot be had — signed
// out, a non-2xx, or the backend being unreachable. Every caller treats null as
// "the browser should fetch this itself", which is exactly the behaviour the
// screens had before, so a bad server fetch degrades to the old path instead of
// breaking the page. Same shape as getCurrentUser in ./auth.
export async function serverGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  if (!session) {
    return null
  }
  try {
    const response = await fetch(`${apiTarget}${path}`, {
      headers: { cookie: `${SESSION_COOKIE}=${session.value}` },
      cache: 'no-store',
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  }
}
