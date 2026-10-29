// Calendar API boundary. Components use this helper rather than reaching the
// backend directly, matching the rest of Astir's frontend data model.
export type UpcomingCalendarEvent = {
  id: string
  title: string
  start: string
  end: string
  kind?: 'interview' | 'coffee'
  applicationId?: string
}

export type UpcomingCalendarResponse = {
  connected: boolean
  events: UpcomingCalendarEvent[]
}

export async function getUpcomingCalendarEvents(): Promise<UpcomingCalendarResponse> {
  const response = await fetch('/api/calendar/events')
  if (!response.ok) throw new Error('Calendar events could not be loaded')
  return response.json() as Promise<UpcomingCalendarResponse>
}

export async function saveCalendarEventCategory(
  eventId: string,
  choice: { kind: 'interview' | 'coffee'; applicationId?: string },
): Promise<void> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(eventId)}/category`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(choice),
  })
  if (!response.ok) throw new Error('Calendar category could not be saved')
}

export async function removeCalendarEventCategory(eventId: string): Promise<void> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(eventId)}/category`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('Calendar category could not be removed')
}
