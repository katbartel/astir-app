'use client'

import { Fragment, useMemo, useState } from 'react'
import { STATUS_OPTIONS, type Application, type Status, normalizeStatus } from '@/lib/applications'
import { CheckIcon } from '../icons'

// "Move to pipeline" flow: find a logged application by company name, then pick
// the stage it advanced to. Ported from the heard-back modal in
// prototype/app.js.
export function HeardBackModal({
  applications,
  onClose,
  onChoose,
}: {
  applications: Application[]
  onClose: () => void
  onChoose: (application: Application, status: Status) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Application | null>(null)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    // Only surface jobs still at "Applied" — anything already in the pipeline
    // or Closed shouldn't be moved into the pipeline again.
    return applications.filter(
      (application) =>
        normalizeStatus(application.status) === 'Applied' &&
        application.company.toLowerCase().includes(needle),
    )
  }, [applications, query])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="heardTitle">
        <div className="modal-head heard-head">
          <h2 id="heardTitle">{selected ? 'What happened?' : 'Who did you hear from?'}</h2>
          <p className="heard-support">
            Someone read your application and wrote back. Take a second with that.
          </p>
        </div>

        {selected ? (
          <div className="heard-stage-step">
            <div className="heard-selection">
              {selected.company} · {selected.role}
            </div>
            <div className="heard-stage-list">
              {STATUS_OPTIONS.map((option) => (
                <Fragment key={option}>
                  {option === '1st stage' || option === 'Closed' ? (
                    <div className="stage-separator" aria-hidden="true" />
                  ) : null}
                  <button
                    className="stage-choice"
                    type="button"
                    onClick={() => onChoose(selected, option)}
                  >
                    <span>{option}</span>
                    <span className="select-check" aria-hidden="true">
                      {option === normalizeStatus(selected.status) ? <CheckIcon /> : null}
                    </span>
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        ) : (
          <div className="typeahead-wrap">
            <input
              type="text"
              autoComplete="off"
              placeholder="Start typing a company name"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query.trim() ? (
              <div className="typeahead-menu">
                {matches.length === 0 ? (
                  <div className="typeahead-empty">Nothing logged under that name yet.</div>
                ) : (
                  matches.map((application) => (
                    <button
                      key={application.id}
                      className="typeahead-row"
                      type="button"
                      onClick={() => setSelected(application)}
                    >
                      <span className="typeahead-company">{application.company}</span>
                      <span className="typeahead-sep">·</span>
                      <span>{application.role}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}
