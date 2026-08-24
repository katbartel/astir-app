import type { Application } from './applications'
import { serverGet } from './server-api'

// The signed-in user's applications, fetched while the page is being rendered
// so Home, Pipeline and All applications arrive with their content already in
// the HTML instead of painting empty and filling in afterwards.
//
// Rows come back raw: normalizing them needs normalizeStageId from ./stages,
// which is a 'use client' module and cannot be called from a server component.
// ApplicationsProvider normalizes them on the way into state.
export function getInitialApplications(): Promise<Application[] | null> {
  return serverGet<Application[]>('/api/applications')
}
