'use client'

import { useState, type FormEvent } from 'react'
import {
  type Application,
  type Status,
  createApplication,
  noteFromText,
  noteText,
  todayKey,
  updateApplication,
} from '@/lib/applications'
import { STAGE_IDS } from '@/lib/stages'
import { DatePicker } from './DatePicker'
import { StageSelect } from './StageSelect'

export type LogApplicationInitial = {
  id?: string
  listingId?: string | null
  company?: string
  role?: string
  link?: string
  status?: Status
  appliedDate?: string
  note?: Application['note']
}

export function LogApplicationModal({
  initial,
  fromWatchlist = false,
  fromJobBoard = false,
  onClose,
  onSaved,
}: {
  initial: LogApplicationInitial
  fromWatchlist?: boolean
  fromJobBoard?: boolean
  onClose: () => void
  onSaved: (application: Application, isNew: boolean) => void
}) {
  const editing = Boolean(initial.id)
  const [link, setLink] = useState(initial.link ?? '')
  const [company, setCompany] = useState(initial.company ?? '')
  const [role, setRole] = useState(initial.role ?? '')
  const [status, setStatus] = useState<Status>(initial.status ?? STAGE_IDS.applied)
  const [appliedDate, setAppliedDate] = useState(initial.appliedDate ?? todayKey())
  const [note, setNote] = useState(noteText(initial.note))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = company.trim().length > 0 && role.trim().length > 0

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      const payload = {
        company: company.trim(),
        role: role.trim(),
        link: link.trim(),
        status,
        appliedDate,
        note: noteFromText(note),
      }
      const saved = editing
        ? await updateApplication(initial.id!, payload)
        : await createApplication({ ...payload, listingId: initial.listingId ?? null })
      onSaved(saved, !editing)
      onClose()
    } catch {
      setError('Something went wrong. Try again.')
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="jobTitle">
        <div className="modal-head">
          <h2 id="jobTitle">{editing ? 'Edit application' : 'Log application'}</h2>
        </div>
        <form onSubmit={submit}>
          {fromWatchlist ? (
            <div className="modal-hint">
              Saving adds this to your applications and clears it from the watchlist.
            </div>
          ) : fromJobBoard ? (
            <div className="modal-hint">
              Saving adds this to your applications and clears it from the job board.
            </div>
          ) : null}
          <label>
            <span>
              Link <span className="optional-label">(optional)</span>
            </span>
            <input
              name="link"
              type="url"
              autoComplete="url"
              placeholder="https://"
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          </label>
          <label>
            <span>Company</span>
            <input
              name="company"
              type="text"
              autoComplete="organization"
              required
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </label>
          <label>
            <span>Role</span>
            <input
              name="role"
              type="text"
              autoComplete="off"
              required
              value={role}
              onChange={(event) => setRole(event.target.value)}
            />
          </label>
          <div className="field-row">
            <label>
              <span>Status</span>
              <StageSelect value={status} onChange={setStatus} />
            </label>
            <label>
              <span>Applied date</span>
              <DatePicker value={appliedDate} onChange={setAppliedDate} />
            </label>
          </div>
          <label>
            <span>Note</span>
            <textarea
              name="note"
              rows={3}
              placeholder="Anything you want to remember about this one"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error ? <p className="modal-note">{error}</p> : null}
          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn solid" type="submit" disabled={busy || !canSubmit}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Log application'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
