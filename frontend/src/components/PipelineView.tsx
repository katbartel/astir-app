'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  type Application,
  type Status,
  isPipelineStatus,
  normalizeMode,
  plainDate,
  stageColorKey,
  stageRank,
  updateApplication,
} from '@/lib/applications'
import { HeardBackModal } from './applications/HeardBackModal'
import { KebabMenu } from './applications/KebabMenu'
import { LogApplicationModal } from './applications/LogApplicationModal'
import { NoteField } from './applications/NoteField'
import { StageSelect } from './applications/StageSelect'
import { useApplications } from './applications/useApplications'
import { useStageConfig } from '@/lib/stages'
import { OpenIcon } from './icons'

// "Posted · Applied · Location · Type" for the expanded card, from the linked
// posting when we have one.
function ApplicationMeta({ application }: { application: Application }) {
  const posting = application.posting
  const parts: string[] = []
  // "Posted" is the provider's real posting date, not when we discovered the
  // listing — em-dash when the provider didn't give us one.
  if (posting) parts.push(`Posted: ${plainDate(posting.postedAt) || '—'}`)
  parts.push(`Applied: ${plainDate(application.appliedDate) || 'Unknown'}`)
  if (posting?.location) parts.push(`Location: ${posting.location}`)
  if (posting?.workMode) parts.push(`Type: ${normalizeMode(posting.workMode)}`)
  return <>{parts.join(' · ')}</>
}

function PipelineCard({
  application,
  expanded,
  onToggle,
  onStage,
  onNote,
}: {
  application: Application
  expanded: boolean
  onToggle: () => void
  onStage: (status: Status) => void
  onNote: (note: NonNullable<Application['note']>) => void
}) {
  const openUrl = application.link || application.posting?.url || ''

  // Expand only when the click landed on the card body, not on a control.
  function onCardClick(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest('button, a, .select-shell, .note-field')) return
    onToggle()
  }

  return (
    <article
      className={`pipeline-card ${expanded ? 'expanded' : ''}`.trim()}
      data-stage={stageColorKey(application.status)}
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${application.company}, ${application.role}`}
      onClick={onCardClick}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <div className="pipeline-card-row">
        <div className="pipeline-card-main">
          <span className="pipeline-company">{application.company}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span className="pipeline-role" title={application.role}>
            {application.role}
          </span>
          {openUrl ? (
            <a
              className="round-icon small pipeline-open"
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open posting"
              data-tooltip="Open posting"
            >
              <OpenIcon />
            </a>
          ) : null}
        </div>
        <StageSelect
          className="stage-select"
          value={application.status}
          onChange={onStage}
        />
      </div>
      {expanded ? (
        <div className="pipeline-details">
          <div className="pipeline-meta">
            <ApplicationMeta application={application} />
          </div>
          <NoteField note={application.note} onChange={onNote} />
        </div>
      ) : null}
    </article>
  )
}

export function PipelineView() {
  const { applications, changeStage, reload, showSnack, overlay } = useApplications()
  const { isEnabled } = useStageConfig()
  const [expandedId, setExpandedId] = useState('')
  const [logging, setLogging] = useState(false)
  const [heardOpen, setHeardOpen] = useState(false)

  const pipeline = useMemo(() => {
    return (applications ?? [])
      .filter(
        (application) =>
          isPipelineStatus(application.status) && isEnabled(application.status),
      )
      .sort((a, b) => {
        // Most advanced stage first; break ties by most recent stage change.
        const byStage = stageRank(b.status) - stageRank(a.status)
        if (byStage !== 0) return byStage
        return new Date(b.stageChangedAt).getTime() - new Date(a.stageChangedAt).getTime()
      })
  }, [applications, isEnabled])

  const empty = pipeline.length === 0

  return (
    <section className="screen" data-screen="pipeline">
      <div className="pipeline-head">
        <div className="pipeline-title-wrap">
          <h1>Pipeline</h1>
          <KebabMenu menuClassName="pipeline-menu">
            <Link
              href="/applications"
              data-tooltip={
                empty
                  ? 'This is where your applications will live'
                  : 'View everything you have applied to.'
              }
            >
              All applications
            </Link>
          </KebabMenu>
        </div>
        {!empty ? (
          <div className="pipeline-actions">
            <button className="btn ghost" type="button" onClick={() => setLogging(true)}>
              Log application
            </button>
            <button className="btn ghost" type="button" onClick={() => setHeardOpen(true)}>
              Move to pipeline
            </button>
          </div>
        ) : null}
      </div>
      <div className="pipeline-list">
        {empty ? (
          <div className="pipeline-empty">
            <div className="sleepy-orb" aria-hidden="true">
              <span className="sleepy-core" />
              <span className="sleepy-z z-one">z</span>
              <span className="sleepy-z z-two">z</span>
              <span className="sleepy-z z-three">z</span>
            </div>
            <p>
              Nothing in motion for now. When you hear back, it will show here. In the meantime, add
              companies to your <Link href="/watchlist">Watchlist</Link> and log applications as you
              send them.
            </p>
            <div className="pipeline-empty-actions">
              <button className="btn ghost" type="button" onClick={() => setLogging(true)}>
                Log application
              </button>
              <button className="btn ghost" type="button" onClick={() => setHeardOpen(true)}>
                Move to pipeline
              </button>
            </div>
          </div>
        ) : (
          pipeline.map((application) => (
            <PipelineCard
              key={application.id}
              application={application}
              expanded={expandedId === application.id}
              onToggle={() =>
                setExpandedId((current) => (current === application.id ? '' : application.id))
              }
              onStage={(status) => void changeStage(application, status, 'pipeline')}
              onNote={(note) => void updateApplication(application.id, { note })}
            />
          ))
        )}
      </div>

      {logging ? (
        <LogApplicationModal
          initial={{ status: 'Applied' }}
          onClose={() => setLogging(false)}
          onSaved={(application, isNew) => {
            void reload()
            if (isNew && application.status !== 'Hired') {
              showSnack({ text: 'Application logged.' })
            }
          }}
        />
      ) : null}

      {heardOpen ? (
        <HeardBackModal
          applications={applications ?? []}
          onClose={() => setHeardOpen(false)}
          onChoose={(application, status) => {
            setHeardOpen(false)
            void changeStage(application, status, 'heard')
          }}
        />
      ) : null}

      {overlay}
    </section>
  )
}
