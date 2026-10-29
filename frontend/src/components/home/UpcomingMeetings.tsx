'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { type Application } from '@/lib/applications'
import {
  getUpcomingCalendarEvents,
  removeCalendarEventCategory,
  saveCalendarEventCategory,
  type UpcomingCalendarResponse,
} from '@/lib/calendar'
import { useStageConfig } from '@/lib/stages'
import { CalendarIcon, ChevronDownIcon, CoffeeIcon, InterviewIcon } from '../icons'
import { MenuScrim, useMenuModality } from '../applications/menuModality'

type MeetingKind = 'interview' | 'coffee'

type Meeting = {
  id: string
  title: string
  start: string
  end: string
  kind?: MeetingKind
  applicationId?: string
}

type MeetingChoice = { kind: MeetingKind; applicationId?: string }

const demoMeetings: Meeting[] = [
  { id: 'revizto', title: 'Interview, Revizto', start: '2026-10-29T10:00:00', end: '2026-10-29T11:00:00' },
  { id: 'astir', title: 'Interview with Astir', start: '2026-10-29T12:00:00', end: '2026-10-29T13:00:00' },
  { id: 'mark', title: 'Chat with Mark', start: '2026-11-03T12:00:00', end: '2026-11-03T13:00:00' },
]

const calendarCacheKey = 'astir.calendar.events.v1'

function readCalendarCache(): UpcomingCalendarResponse | null {
  try {
    const raw = window.localStorage.getItem(calendarCacheKey)
    if (!raw) return null
    const value = JSON.parse(raw) as UpcomingCalendarResponse
    return typeof value.connected === 'boolean' && Array.isArray(value.events) ? value : null
  } catch {
    return null
  }
}

function writeCalendarCache(value: UpcomingCalendarResponse) {
  try {
    window.localStorage.setItem(calendarCacheKey, JSON.stringify(value))
  } catch {
    // The visible response remains usable when browser storage is unavailable.
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' }).format(
    new Date(value),
  )
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function sameDay(left: string, right: string) {
  return new Date(left).toDateString() === new Date(right).toDateString()
}

function MeetingTag({ meeting, application }: { meeting: Meeting; application?: Application }) {
  const Icon = meeting.kind === 'coffee' ? CoffeeIcon : InterviewIcon
  const label = meeting.kind === 'coffee' ? 'Coffee chat' : application?.company
  if (!label) return null
  return (
    <span className="meeting-tag">
      <Icon />
      {label}
    </span>
  )
}

function CategorizeMenu({
  meeting,
  applications,
  onChoose,
}: {
  meeting: Meeting
  applications: Application[]
  onChoose: (choice: MeetingChoice | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  useMenuModality(open, ref, setOpen)

  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <div className={`meeting-menu ${open ? 'open' : ''}`.trim()} ref={ref}>
      <button
        ref={triggerRef}
        className={`btn ghost meeting-categorize${meeting.kind ? ' categorized' : ''}`.trim()}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {meeting.kind ? <MeetingTag meeting={meeting} application={applications.find((item) => item.id === meeting.applicationId)} /> : 'Categorize'}
        <ChevronDownIcon />
      </button>
      {open ? (
        <div className="meeting-menu-popover" role="menu" aria-label={`Categorize ${meeting.title}`}>
          <div className="meeting-menu-label">Interview</div>
          {applications.length ? (
            applications.map((application) => (
              <button
                type="button"
                role="menuitem"
                key={application.id}
                onClick={() => {
                  onChoose({ kind: 'interview', applicationId: application.id })
                  setOpen(false)
                }}
              >
                <InterviewIcon />
                {application.company}
              </button>
            ))
          ) : (
            <p className="meeting-menu-empty">No companies in your pipeline yet.</p>
          )}
          <div className="meeting-menu-divider" />
          <div className="meeting-menu-label">Networking</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onChoose({ kind: 'coffee' })
              setOpen(false)
            }}
          >
            <CoffeeIcon />
            Coffee chat
          </button>
          {meeting.kind ? (
            <>
              <div className="meeting-menu-divider" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onChoose(null)
                  setOpen(false)
                }}
              >
                Remove category
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {open ? <MenuScrim onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

function MeetingRow({ meeting, applications, onChoose }: { meeting: Meeting; applications: Application[]; onChoose: (choice: MeetingChoice | null) => void }) {
  return (
    <div className="meeting-row">
      <div className="meeting-main">
        <span className="meeting-rule" aria-hidden="true" />
        <div>
          <div className="meeting-title">{meeting.title}</div>
          <div className="meeting-time">
            {formatTime(meeting.start)} to {formatTime(meeting.end)}
          </div>
        </div>
      </div>
      <div className="meeting-action">
        <CategorizeMenu meeting={meeting} applications={applications} onChoose={onChoose} />
      </div>
    </div>
  )
}

export function UpcomingMeetings({ applications }: { applications: Application[] }) {
  const [state, setState] = useState<'disconnected' | 'empty' | 'upcoming'>('disconnected')
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1') {
      setState('upcoming')
      setMeetings(demoMeetings)
      setLoading(false)
      return
    }
    let alive = true
    const applyResponse = (result: UpcomingCalendarResponse) => {
      if (!alive) return
      setMeetings(result.events)
      setState(result.connected ? (result.events.length ? 'upcoming' : 'empty') : 'disconnected')
      setLoading(false)
    }
    const cached = readCalendarCache()
    if (cached) applyResponse(cached)
    getUpcomingCalendarEvents()
      .then((result) => {
        writeCalendarCache(result)
        applyResponse(result)
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const { isPipeline } = useStageConfig()
  const pipelineApplications = useMemo(
    () => applications.filter((application) => isPipeline(application.status)),
    [applications, isPipeline],
  )
  const grouped = meetings.reduce<Meeting[][]>((groups, meeting) => {
    const last = groups.at(-1)
    if (last && sameDay(last[0].start, meeting.start)) last.push(meeting)
    else groups.push([meeting])
    return groups
  }, [])
  const choose = (id: string, choice: MeetingChoice | null) => {
    setMeetings((current) => {
      const next = current.map((meeting) =>
        meeting.id === id
          ? choice
            ? { ...meeting, ...choice }
            : { ...meeting, kind: undefined, applicationId: undefined }
          : meeting,
      )
      writeCalendarCache({ connected: true, events: next })
      return next
    })
    void (choice ? saveCalendarEventCategory(id, choice) : removeCalendarEventCategory(id)).catch(() => {
      // The next background fetch restores the server's persisted category.
      void getUpcomingCalendarEvents().then((result) => {
        writeCalendarCache(result)
        setMeetings(result.events)
        setState(result.connected ? (result.events.length ? 'upcoming' : 'empty') : 'disconnected')
      })
    })
  }

  return (
    <section className="meetings-card" aria-labelledby="meetingsLabel">
      {loading ? (
        <div className="meetings-loading sk-shimmer" aria-label="Loading upcoming meetings" />
      ) : state === 'upcoming' ? (
        <>
          <div className="label" id="meetingsLabel">Upcoming meetings</div>
          <div className="meeting-groups">
            {grouped.map((group) => (
              <section className="meeting-day" key={group[0].start} aria-label={formatDate(group[0].start)}>
                <h2>{formatDate(group[0].start)}</h2>
                {group.map((meeting) => (
                  <MeetingRow
                    key={meeting.id}
                    meeting={meeting}
                    applications={pipelineApplications}
                    onChoose={(choice) => choose(meeting.id, choice)}
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="meetings-empty">
          <CalendarIcon />
          <p>{state === 'disconnected' ? 'No meetings found' : 'No upcoming meetings'}</p>
          {state === 'disconnected' ? (
            <button className="btn ghost" type="button" onClick={() => window.location.assign('/api/calendar/connect')}>
              Connect calendar
            </button>
          ) : null}
        </div>
      )}
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1' ? (
        <aside className="demo-panel" aria-label="Preview state">
          <div className="demo-label">Meetings preview</div>
          <div className="demo-actions">
            {(['disconnected', 'empty', 'upcoming'] as const).map((option) => (
              <button
                type="button"
                className={state === option ? 'active' : ''}
                key={option}
                onClick={() => {
                  setState(option)
                  if (option === 'upcoming') setMeetings(demoMeetings)
                }}
              >
                {option === 'disconnected' ? 'Connect calendar' : option === 'empty' ? 'No upcoming meetings' : 'Upcoming meetings'}
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  )
}
