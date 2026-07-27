'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Application } from '@/lib/applications'
import { formatPostedDate, isPipelineStatus } from '@/lib/applications'
import { STAGE_IDS } from '@/lib/stages'
import { KebabMenu } from './applications/KebabMenu'
import {
  LogApplicationModal,
  type LogApplicationInitial,
} from './applications/LogApplicationModal'
import { Snackbar, useSnackbar } from './applications/useSnackbar'
import { BellIcon, BellOffIcon, OpenIcon, PlusIcon } from './icons'

type Role = {
  id: string
  title: string
  url: string
  location: string | null
  locations: string[]
  workMode: string | null
  // ISO 639-1 code of the language the ad is written in (e.g. 'en', 'de'), when
  // the provider exposes it; null otherwise.
  contentLanguage: string | null
  postedAt: string | null
  firstSeenAt: string
  matchedKeywords: string[]
}

type NetworkingStage = 'none' | 'active' | 'warm'

type Company = {
  id: string
  name: string
  careersUrl: string | null
  alertsOn: boolean
  resolutionStatus: 'pending' | 'resolved' | 'unresolved'
  networkingStage: NetworkingStage
  networkingNotes: string | null
  roles: Role[]
}

// The three steps of warming up a company before a role even opens: no outreach
// yet, actively reaching out, or holding a solid contact who could refer you.
// `label` is the full wording inside the popover; `chip` is the compact wording
// on the header chip.
const NETWORKING_STAGES: { key: NetworkingStage; label: string; chip: string }[] = [
  { key: 'none', label: 'No outreach yet', chip: 'No outreach' },
  { key: 'active', label: 'Reaching out', chip: 'Reaching out' },
  { key: 'warm', label: 'Have a contact', chip: 'Contact ready' },
]

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000

// "New" means posted at the source within the last 48h. Roles without a
// provider posting date get no label (we don't fall back to when we pulled it in).
function isFresh(role: Role): boolean {
  if (!role.postedAt) return false
  return Date.now() - new Date(role.postedAt).getTime() < NEW_WINDOW_MS
}

// The same opening across several cities is one posting; show the primary
// location with a "+N" chip for the rest (e.g. "Berlin +9"), matching the
// prototype's locationLabel. Providers deliver the extras either as separate
// array entries or as one ";"-joined string, so flatten both.
function locationParts(role: Role): string[] {
  const raw = role.locations.length > 0 ? role.locations : role.location ? [role.location] : []
  return raw
    .flatMap((value) => value.split(';'))
    .map((value) => value.trim())
    .filter(Boolean)
}

function LocationLine({ role }: { role: Role }) {
  const parts = locationParts(role)
  const primary = parts[0] ?? null
  const extra = Math.max(0, parts.length - 1)
  const hiddenLocations = parts.slice(1).join(', ')
  const mode = role.workMode
  if (!primary && !mode) return null
  return (
    <div className="role-loc">
      {primary ? (
        <>
          {primary}
          {extra > 0 ? (
            <span className="more-cities" data-tooltip={hiddenLocations}>
              +{extra}
            </span>
          ) : null}
        </>
      ) : null}
      {/* A single known location can show its work mode; when compressed the
          modes vary, so we drop it. */}
      {primary && extra === 0 && mode ? `, ${mode}` : null}
      {!primary && mode ? mode : null}
      {role.contentLanguage ? <span className="role-lang">{role.contentLanguage.toUpperCase()}</span> : null}
    </div>
  )
}

// Best-effort company name from a careers link, used to prefill the name field
// (mirrors the prototype's slug prefill). ATS hosts carry the slug in the path.
function deriveNameFromUrl(url: string): string {
  const titleCase = (slug: string) =>
    slug
      .split(/[-_]/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  const atsMatch = url.match(
    /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9-]+)|jobs\.ashbyhq\.com\/([a-z0-9-]+)|apply\.workable\.com\/([a-z0-9-]+)|jobs\.lever\.co\/([a-z0-9-]+)|(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9-]+)|([a-z0-9-]+)\.recruitee\.com|join\.com\/companies\/([a-z0-9-]+)/i,
  )
  if (atsMatch) {
    return titleCase(
      atsMatch[1] ||
        atsMatch[2] ||
        atsMatch[3] ||
        atsMatch[4] ||
        atsMatch[5] ||
        atsMatch[6] ||
        atsMatch[7],
    )
  }
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    const parts = host.replace(/^www\./, '').split('.')
    return titleCase(parts[0])
  } catch {
    return ''
  }
}

type CompanyForm = { name: string; careersUrl: string }
type Editor =
  | { mode: 'add' }
  | { mode: 'edit'; company: Company }
  | { mode: 'remove'; company: Company }
  | null

function CompanyModal({
  title,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string
  initial: CompanyForm
  submitLabel: string
  onSubmit: (form: CompanyForm) => Promise<string | null>
  onClose: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [careersUrl, setCareersUrl] = useState(initial.careersUrl)
  const [prefilled, setPrefilled] = useState(false)
  const [nameEdited, setNameEdited] = useState(initial.name.length > 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onUrlChange(value: string) {
    setCareersUrl(value)
    if (!nameEdited && value.trim()) {
      const guess = deriveNameFromUrl(value.trim())
      if (guess) {
        setName(guess)
        setPrefilled(true)
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || busy) {
      return
    }
    setBusy(true)
    setError(null)
    const message = await onSubmit({ name: name.trim(), careersUrl: careersUrl.trim() })
    if (message) {
      setError(message)
      setBusy(false)
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <label>
          Careers page link
          <input
            name="careersUrl"
            value={careersUrl}
            placeholder="https://..."
            autoFocus
            onChange={(event) => onUrlChange(event.target.value)}
          />
        </label>
        <label>
          Company name
          <input
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setNameEdited(true)
              setPrefilled(false)
            }}
          />
          {prefilled ? (
            <span className="field-note">Filled in from the link. Edit it if it looks off.</span>
          ) : null}
        </label>
        {error ? <p className="modal-note">{error}</p> : null}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn solid" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Checking board…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

function RemoveModal({
  company,
  onConfirm,
  onClose,
}: {
  company: Company
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Remove {company.name}?</h2>
        </div>
        <p className="modal-copy">
          Its open roles will no longer show here and alerts will stop. You can add the company again
          anytime.
        </p>
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn ghost"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onConfirm()
              onClose()
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}

// Per-company networking control that lives in the company header. The chip
// shows the current stage at a glance (colour-coded); clicking it opens a
// popover with the three-step selector and a notes field for names, LinkedIn
// links, and conversation history. The idea is that by the time a role opens,
// the user already knows who to reach out to. Open state is controlled by the
// parent so the "contact ready" flag on a role row can open it too.
function NetworkingControl({
  company,
  open,
  onOpenChange,
  onUpdate,
}: {
  company: Company
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (patch: { networkingStage?: NetworkingStage; networkingNotes?: string }) => void
}) {
  const savedNotes = company.networkingNotes ?? ''
  const [draft, setDraft] = useState(savedNotes)
  const ref = useRef<HTMLSpanElement>(null)

  // Keep the draft in sync when the persisted value changes elsewhere (e.g.
  // after a reload) while the popover is closed.
  useEffect(() => {
    if (!open) setDraft(savedNotes)
  }, [savedNotes, open])

  function commitNotes() {
    if (draft.trim() === savedNotes.trim()) return
    onUpdate({ networkingNotes: draft })
  }

  function close() {
    commitNotes()
    onOpenChange(false)
  }

  // Clicking outside or pressing Escape closes the popover (and saves notes).
  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
    // draft/savedNotes are read by close(); rebind so it saves the latest text.
  }, [open, draft, savedNotes])

  const current = NETWORKING_STAGES.find((s) => s.key === company.networkingStage) ?? NETWORKING_STAGES[0]

  return (
    <span className={`net-wrap stage-${company.networkingStage}${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="net-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip="Networking"
        onClick={() => (open ? close() : onOpenChange(true))}
      >
        <span className="net-dot" aria-hidden="true" />
        {current.chip}
      </button>
      <div className="net-pop" role="dialog" aria-label={`Networking at ${company.name}`}>
        <div className="net-stages" role="group" aria-label="Networking progress">
          {NETWORKING_STAGES.map((stage) => {
            const active = company.networkingStage === stage.key
            return (
              <button
                key={stage.key}
                type="button"
                className={`net-stage${active ? ' active' : ''}`}
                aria-pressed={active}
                onClick={() => onUpdate({ networkingStage: stage.key })}
              >
                {stage.label}
              </button>
            )
          })}
        </div>
        <textarea
          className="net-notes"
          value={draft}
          placeholder="Who could refer you? Names, LinkedIn links, conversations so far…"
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitNotes}
        />
      </div>
    </span>
  )
}

function CompanyCard({
  company,
  onToggleAlerts,
  onEdit,
  onRemove,
  onLog,
  onNetworking,
}: {
  company: Company
  onToggleAlerts: (company: Company) => void
  onEdit: (company: Company) => void
  onRemove: (company: Company) => void
  onLog: (company: Company, role: Role) => void
  onNetworking: (
    company: Company,
    patch: { networkingStage?: NetworkingStage; networkingNotes?: string },
  ) => void
}) {
  const [netOpen, setNetOpen] = useState(false)
  const hasContact = company.networkingStage === 'warm'
  return (
    <article className="watch-group">
      <div className="watch-head">
        <div className="company-name">{company.name}</div>
        <NetworkingControl
          company={company}
          open={netOpen}
          onOpenChange={setNetOpen}
          onUpdate={(patch) => onNetworking(company, patch)}
        />
        <span className="company-spacer" />
        <button
          className={`round-icon bell ${company.alertsOn ? 'on' : 'off'}`}
          type="button"
          aria-label={company.alertsOn ? 'Alerts on' : 'Alerts off'}
          data-tooltip="Alerts"
          onClick={() => onToggleAlerts(company)}
        >
          {company.alertsOn ? <BellIcon /> : <BellOffIcon />}
        </button>
        <KebabMenu>
          <button type="button" onClick={() => onEdit(company)}>
            Edit
          </button>
          <button type="button" onClick={() => onRemove(company)}>
            Remove
          </button>
        </KebabMenu>
      </div>
      {company.roles.map((role) => (
        <div className="watch-role" key={role.id}>
          <div className="role-main">
            <div className="role-title-line">
              <span className="role-name" title={role.title}>
                {role.title}
              </span>
              <a
                className="round-icon small"
                href={role.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open posting"
                data-tooltip="Open posting"
              >
                <OpenIcon />
              </a>
              {isFresh(role) ? <span className="role-new-chip">New</span> : null}
              {/* A warm company gets a nudge on each open role: you already
                  know someone here — open your notes and reach out first. */}
              {hasContact ? (
                <button
                  type="button"
                  className="role-contact-flag"
                  data-tooltip="You have a contact here — reach out"
                  onClick={() => setNetOpen(true)}
                >
                  Contact ready
                </button>
              ) : null}
            </div>
            <LocationLine role={role} />
            <div className="role-posted">Posted: {formatPostedDate(role.postedAt)}</div>
          </div>
          <button
            className="round-icon add-application"
            type="button"
            aria-label="Log application"
            data-tooltip="Log application"
            onClick={() => onLog(company, role)}
          >
            <PlusIcon />
          </button>
        </div>
      ))}
      {company.resolutionStatus === 'unresolved' ? (
        <div className="watch-role">
          <div className="role-loc">
            We couldn&apos;t find this company&apos;s job board yet. Add its careers link to help us
            watch it.
          </div>
        </div>
      ) : null}
    </article>
  )
}

function QuietRow({
  company,
  onToggleAlerts,
  onEdit,
  onRemove,
  onNetworking,
  onRetry,
  retrying,
}: {
  company: Company
  onToggleAlerts: (company: Company) => void
  onEdit: (company: Company) => void
  onRemove: (company: Company) => void
  onNetworking: (
    company: Company,
    patch: { networkingStage?: NetworkingStage; networkingNotes?: string },
  ) => void
  onRetry: (company: Company) => void
  retrying: boolean
}) {
  const [netOpen, setNetOpen] = useState(false)
  return (
    <article className="watch-group quiet-company">
      <div className="watch-head">
        <div className="company-name">{company.name}</div>
        <NetworkingControl
          company={company}
          open={netOpen}
          onOpenChange={setNetOpen}
          onUpdate={(patch) => onNetworking(company, patch)}
        />
        <span className="company-spacer" />
        <button
          className={`round-icon bell ${company.alertsOn ? 'on' : 'off'}`}
          type="button"
          aria-label={company.alertsOn ? 'Alerts on' : 'Alerts off'}
          data-tooltip="Alerts"
          onClick={() => onToggleAlerts(company)}
        >
          {company.alertsOn ? <BellIcon /> : <BellOffIcon />}
        </button>
        <KebabMenu>
          <button type="button" onClick={() => onEdit(company)}>
            Edit
          </button>
          <button type="button" onClick={() => onRemove(company)}>
            Remove
          </button>
        </KebabMenu>
      </div>
      {company.resolutionStatus === 'unresolved' ? (
        <div className="watch-role">
          <div className="role-loc">
            We couldn&apos;t find this company&apos;s job board yet. Add its careers link to help us
            watch it, or re-check.
          </div>
          <button
            className="text-button"
            type="button"
            disabled={retrying}
            onClick={() => onRetry(company)}
          >
            {retrying ? 'Re-checking…' : 'Re-check'}
          </button>
        </div>
      ) : null}
    </article>
  )
}

export function WatchlistView() {
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [editor, setEditor] = useState<Editor>(null)
  const [quietOpen, setQuietOpen] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [logging, setLogging] = useState<LogApplicationInitial | null>(null)
  const { message: snack, showSnack } = useSnackbar()

  async function reload() {
    try {
      const response = await fetch('/api/watchlist/companies')
      if (!response.ok) {
        throw new Error(`Watchlist request failed: ${response.status}`)
      }
      setCompanies((await response.json()) as Company[])
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  async function addCompany(form: CompanyForm): Promise<string | null> {
    const response = await fetch('/api/watchlist/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!response.ok) {
      if (response.status === 409) {
        return 'This company is already on your watchlist.'
      }
      return 'Something went wrong. Try again.'
    }
    await reload()
    showSnack({ text: `${form.name} added. Checking its board for matching roles now.` })
    return null
  }

  async function editCompany(company: Company, form: CompanyForm): Promise<string | null> {
    const response = await fetch(`/api/watchlist/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!response.ok) {
      if (response.status === 409) {
        return 'This company is already on your watchlist.'
      }
      return 'Something went wrong. Try again.'
    }
    await reload()
    return null
  }

  async function removeCompany(company: Company) {
    await fetch(`/api/watchlist/companies/${company.id}`, { method: 'DELETE' })
    await reload()
    showSnack({ text: `${company.name} removed from your watchlist.` })
  }

  // Re-attempt resolution for a company we couldn't place on an ATS — useful
  // after a new integration ships (its board may now be found).
  async function retryCompany(company: Company) {
    if (retryingId) return
    setRetryingId(company.id)
    try {
      const response = await fetch(`/api/watchlist/companies/${company.id}/resolve`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      await reload()
      const updated = ((await response.json()) as Company | undefined) ?? company
      showSnack({
        text:
          updated.resolutionStatus === 'resolved'
            ? `Found ${company.name}'s job board.`
            : `Still couldn't find ${company.name}'s job board.`,
      })
    } catch {
      showSnack({ text: `Couldn't re-check ${company.name}. Try again.` })
    } finally {
      setRetryingId(null)
    }
  }

  function openLog(company: Company, role: Role) {
    setLogging({
      listingId: role.id,
      company: company.name,
      role: role.title,
      link: role.url,
      status: STAGE_IDS.applied,
    })
  }

  // After logging, the role drops off the watchlist (the backend hides applied
  // listings) and lands on Pipeline or All applications depending on stage.
  async function onLogged(application: Application) {
    await reload()
    const inPipeline = isPipelineStatus(application.status)
    showSnack(
      inPipeline
        ? { text: 'Logged. You can see it in pipeline.', linkText: 'pipeline', href: '/pipeline' }
        : {
            text: 'Logged. Find it in all applications.',
            linkText: 'all applications',
            href: '/applications',
          },
      5000,
    )
  }

  async function toggleAlerts(company: Company) {
    // Optimistic: flip locally, then persist.
    setCompanies(
      (prev) =>
        prev?.map((item) =>
          item.id === company.id ? { ...item, alertsOn: !item.alertsOn } : item,
        ) ?? prev,
    )
    await fetch(`/api/watchlist/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertsOn: !company.alertsOn }),
    })
  }

  async function updateNetworking(
    company: Company,
    patch: { networkingStage?: NetworkingStage; networkingNotes?: string },
  ) {
    // Optimistic, like alerts: reflect the change locally, then persist.
    setCompanies(
      (prev) =>
        prev?.map((item) =>
          item.id === company.id
            ? {
                ...item,
                ...(patch.networkingStage !== undefined
                  ? { networkingStage: patch.networkingStage }
                  : {}),
                ...(patch.networkingNotes !== undefined
                  ? { networkingNotes: patch.networkingNotes.trim() || null }
                  : {}),
              }
            : item,
        ) ?? prev,
    )
    await fetch(`/api/watchlist/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  const { live, quiet } = useMemo(() => {
    const list = companies ?? []
    return {
      live: list.filter((company) => company.roles.length > 0),
      quiet: list.filter((company) => company.roles.length === 0),
    }
  }, [companies])

  return (
    <section className="screen" data-screen="watchlist">
      <div className="page-head">
        <h1>Watchlist</h1>
        <button className="btn ghost" type="button" onClick={() => setEditor({ mode: 'add' })}>
          Add company
        </button>
      </div>
      <div className="watchlist">
        {failed ? (
          <p className="watch-invite">Your watchlist is resting for a moment. Try again soon.</p>
        ) : companies === null ? (
          <p className="watch-invite">Loading your watchlist…</p>
        ) : companies.length === 0 ? (
          <p className="watch-invite">
            Add a company you would fight for. We will watch its board for you.
          </p>
        ) : (
          <>
            {live.length > 0 ? (
              <div className="watch-card-list">
                {live.map((company) => (
                  <CompanyCard
                    key={company.id}
                    company={company}
                    onToggleAlerts={toggleAlerts}
                    onEdit={(c) => setEditor({ mode: 'edit', company: c })}
                    onRemove={(c) => setEditor({ mode: 'remove', company: c })}
                    onLog={openLog}
                    onNetworking={updateNetworking}
                  />
                ))}
              </div>
            ) : null}
            {quiet.length > 0 ? (
              <div className="quiet-section">
                <button
                  type="button"
                  className="quiet-toggle"
                  aria-expanded={quietOpen}
                  onClick={() => setQuietOpen((open) => !open)}
                >
                  Nothing open elsewhere right now
                </button>
                {quietOpen ? (
                  <div className="watch-card-list">
                    {quiet.map((company) => (
                      <QuietRow
                        key={company.id}
                        company={company}
                        onToggleAlerts={toggleAlerts}
                        onEdit={(c) => setEditor({ mode: 'edit', company: c })}
                        onRemove={(c) => setEditor({ mode: 'remove', company: c })}
                        onNetworking={updateNetworking}
                        onRetry={retryCompany}
                        retrying={retryingId === company.id}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {editor?.mode === 'add' ? (
        <CompanyModal
          title="Add a company"
          submitLabel="Add company"
          initial={{ name: '', careersUrl: '' }}
          onSubmit={addCompany}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {editor?.mode === 'edit' ? (
        <CompanyModal
          title="Edit company"
          submitLabel="Save changes"
          initial={{ name: editor.company.name, careersUrl: editor.company.careersUrl ?? '' }}
          onSubmit={(form) => editCompany(editor.company, form)}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {editor?.mode === 'remove' ? (
        <RemoveModal
          company={editor.company}
          onConfirm={() => removeCompany(editor.company)}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {logging ? (
        <LogApplicationModal
          initial={logging}
          fromWatchlist
          onClose={() => setLogging(null)}
          onSaved={(application) => void onLogged(application)}
        />
      ) : null}

      <Snackbar message={snack} />
    </section>
  )
}
