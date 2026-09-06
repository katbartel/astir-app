'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Application } from '@/lib/applications'
import { formatPostedDate, isPipelineStatus, noteFromText } from '@/lib/applications'
import { displayLocationParts } from '@/lib/location-display'
import { noteHasContent, type StoredNote } from '@/lib/noteMigration'
import { STAGE_IDS } from '@/lib/stages'
import { KebabMenu } from './applications/KebabMenu'
import {
  LogApplicationModal,
  type LogApplicationInitial,
} from './applications/LogApplicationModal'
import { NoteEditor } from './applications/NoteEditor'
import { Snackbar, useSnackbar } from './applications/useSnackbar'
import {
  CheckIcon,
  ChevronDownIcon,
  ConnectionIcon,
  OpenIcon,
  PlusIcon,
  SkipIcon,
  WarningIcon,
  XIcon,
} from './icons'

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
type ConnectionStatus = 'found' | 'reached_out' | 'talking' | 'can_refer' | 'closed'

type WatchlistConnection = {
  id: string
  name: string
  status: ConnectionStatus
  details: string
  notes: string
}

export type Company = {
  id: string
  name: string
  careersUrl: string | null
  alertsOn: boolean
  resolutionStatus: 'pending' | 'resolved' | 'unresolved'
  networkingStage: NetworkingStage
  networkingNotes: string | null
  networkingConnections: WatchlistConnection[]
  roles: Role[]
  hiddenRoles: Role[]
}

// The three connection states before a role opens: none added yet, work in
// progress, or a solid contact who could refer you.
const NETWORKING_STAGES: { key: NetworkingStage; label: string }[] = [
  { key: 'none', label: 'No connection added' },
  { key: 'active', label: 'Networking in progress' },
  { key: 'warm', label: 'Connection established' },
]

const CONNECTION_STATUS_OPTIONS: { key: ConnectionStatus; label: string }[] = [
  { key: 'found', label: 'Found' },
  { key: 'reached_out', label: 'Reached out' },
  { key: 'talking', label: 'Talking' },
  { key: 'can_refer', label: 'Can refer' },
  { key: 'closed', label: 'Closed' },
]

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000

// "New" means first seen by Astir within the last 48h.
function isFresh(role: Role): boolean {
  return Date.now() - new Date(role.firstSeenAt).getTime() < NEW_WINDOW_MS
}

// The same opening across several cities is one posting; show the primary
// location with a "+N" chip for the rest (e.g. "Berlin +9"), matching the
// prototype's locationLabel. Providers deliver the extras either as separate
// array entries or as one ";"-joined string, so flatten both.
function locationParts(role: Role): string[] {
  return displayLocationParts(role.locations, role.location)
}

function LocationLine({ role, showWorkMode = true }: { role: Role; showWorkMode?: boolean }) {
  const parts = locationParts(role)
  const primary = parts[0] ?? null
  const extra = Math.max(0, parts.length - 1)
  const hiddenLocations = parts.slice(1).join(', ')
  const mode = role.workMode
  if (!primary && (!showWorkMode || !mode)) return null
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
      {showWorkMode && primary && extra === 0 && mode ? `, ${mode}` : null}
      {showWorkMode && !primary && mode ? mode : null}
      {role.contentLanguage ? <span className="role-lang">{role.contentLanguage.toUpperCase()}</span> : null}
    </div>
  )
}

function effectiveRoleDate(role: Role): number {
  return new Date(role.postedAt ?? role.firstSeenAt).getTime()
}

function companyRoleDate(company: Company): number {
  return company.roles.reduce((best, role) => Math.max(best, effectiveRoleDate(role)), 0)
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

type CompanyForm = {
  name: string
  careersUrl: string
  networkingNotes?: string
  networkingConnections?: WatchlistConnection[]
}
type CompanyModalInitial = {
  name: string
  careersUrl: string
  networkingNotes?: string | null
  networkingConnections?: WatchlistConnection[]
}
type Editor =
  | { mode: 'add' }
  | { mode: 'edit'; company: Company }
  | { mode: 'remove'; company: Company }
  | null

function companyNoteFromStorage(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return noteFromText(value)
  }
}

function companyNoteToStorage(note: unknown): string {
  return noteHasContent(note) ? JSON.stringify(note) : ''
}

function newConnection(): WatchlistConnection {
  return {
    id: `connection-${Date.now()}`,
    name: '',
    status: 'found',
    details: '',
    notes: '',
  }
}

function cleanConnections(connections: WatchlistConnection[]): WatchlistConnection[] {
  return connections.filter(
    (connection) =>
      connection.name.trim() || connection.details.trim() || connection.notes.trim(),
  )
}

function tokenPixels(name: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)
  return Number(value.replace('px', '')) || 0
}

function clampSelectMenu(menu: HTMLElement, trigger: HTMLElement) {
  const selected = menu.querySelector<HTMLElement>('.select-option.selected')
  if (!selected) return

  menu.style.position = 'fixed'
  menu.style.left = ''
  menu.style.top = ''
  menu.style.maxHeight = ''
  menu.style.minWidth = ''
  menu.scrollTop = 0

  const inset = tokenPixels('--space-2')
  const triggerRect = trigger.getBoundingClientRect()
  const selectedOffset = selected.offsetTop
  const availableHeight = window.innerHeight - inset * 2
  let nextTop = triggerRect.top - selectedOffset - inset
  let nextLeft = triggerRect.left

  menu.style.left = `${nextLeft}px`
  menu.style.minWidth = `${triggerRect.width}px`
  menu.style.top = `${nextTop}px`

  let rect = menu.getBoundingClientRect()
  if (rect.right > window.innerWidth - inset) {
    nextLeft -= rect.right - (window.innerWidth - inset)
    menu.style.left = `${Math.max(inset, nextLeft)}px`
    rect = menu.getBoundingClientRect()
  }
  if (rect.height > availableHeight) {
    menu.style.maxHeight = `${availableHeight}px`
    menu.style.top = `${inset}px`
    selected.scrollIntoView({ block: 'nearest' })
    return
  }
  if (rect.top < inset) {
    nextTop += inset - rect.top
  }
  rect = menu.getBoundingClientRect()
  if (rect.bottom > window.innerHeight - inset) {
    nextTop -= rect.bottom - window.innerHeight + inset
  }
  menu.style.top = `${nextTop}px`
}

function ConnectionStatusSelect({
  value,
  onChange,
}: {
  value: ConnectionStatus
  onChange: (status: ConnectionStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = CONNECTION_STATUS_OPTIONS.find((option) => option.key === value) ?? CONNECTION_STATUS_OPTIONS[0]
  const selectedIndex = Math.max(0, CONNECTION_STATUS_OPTIONS.findIndex((option) => option.key === value))

  useLayoutEffect(() => {
    if (open && menuRef.current && triggerRef.current) {
      clampSelectMenu(menuRef.current, triggerRef.current)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function reposition() {
      if (menuRef.current && triggerRef.current) clampSelectMenu(menuRef.current, triggerRef.current)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  return (
    <div className="select-shell connection-status-select" ref={shellRef}>
      <button
        className={`select-trigger ${open ? 'open' : ''}`.trim()}
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        <span>{selected.label}</span>
        <span className="select-chev" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>
      <div
        className={`select-menu ${open ? 'open' : ''}`.trim()}
        role="listbox"
        ref={menuRef}
        style={{ ['--selected-index' as string]: selectedIndex }}
      >
        {CONNECTION_STATUS_OPTIONS.map((option) => (
          <button
            className={`select-option ${option.key === value ? 'selected' : ''}`.trim()}
            type="button"
            role="option"
            aria-selected={option.key === value}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
              if (option.key !== value) onChange(option.key)
            }}
            key={option.key}
          >
            <span>{option.label}</span>
            <span className="select-check" aria-hidden="true">
              {option.key === value ? <CheckIcon /> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ConnectionRows({
  connections,
  onChange,
}: {
  connections: WatchlistConnection[]
  onChange: (connections: WatchlistConnection[]) => void
}) {
  function updateConnection(id: string, patch: Partial<WatchlistConnection>) {
    onChange(
      connections.map((connection) =>
        connection.id === id ? { ...connection, ...patch } : connection,
      ),
    )
  }

  function removeConnection(id: string) {
    onChange(connections.filter((connection) => connection.id !== id))
  }

  return (
    <section className="company-edit-connections" aria-label="Connections">
      <div className="company-section-head">
        <span className="company-edit-notes-label">Connections</span>
        <button
          className="btn ghost"
          type="button"
          onClick={() => onChange([...connections, newConnection()])}
        >
          Add connection
        </button>
      </div>
      {connections.length === 0 ? (
        <p className="company-connections-empty">No networking added yet.</p>
      ) : (
        <div className="connection-list">
          {connections.map((connection) => (
            <article className="connection-row" key={connection.id}>
              <label>
                Name
                <input
                  value={connection.name}
                  placeholder="Name"
                  onChange={(event) => updateConnection(connection.id, { name: event.target.value })}
                />
              </label>
              <label>
                Status
                <ConnectionStatusSelect
                  value={connection.status}
                  onChange={(status) => updateConnection(connection.id, { status })}
                />
              </label>
              <label>
                Details
                <input
                  value={connection.details}
                  placeholder="LinkedIn or detail"
                  onChange={(event) =>
                    updateConnection(connection.id, { details: event.target.value })
                  }
                />
              </label>
              <label className="connection-notes-field">
                Notes
                <textarea
                  value={connection.notes}
                  placeholder="What happened, or what to do next"
                  rows={2}
                  onChange={(event) => updateConnection(connection.id, { notes: event.target.value })}
                />
              </label>
              <button
                className="round-icon connection-remove"
                type="button"
                aria-label="Remove connection"
                data-tooltip="Remove connection"
                onClick={() => removeConnection(connection.id)}
              >
                <XIcon />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function CompanyModal({
  title,
  initial,
  submitLabel,
  showNotes = false,
  onSubmit,
  onClose,
}: {
  title: string
  initial: CompanyModalInitial
  submitLabel: string
  showNotes?: boolean
  onSubmit: (form: CompanyForm) => Promise<string | null>
  onClose: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [careersUrl, setCareersUrl] = useState(initial.careersUrl)
  const [companyNote, setCompanyNote] = useState<unknown>(
    companyNoteFromStorage(initial.networkingNotes ?? null),
  )
  const [connections, setConnections] = useState<WatchlistConnection[]>(
    initial.networkingConnections ?? [],
  )
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
    const next: CompanyForm = { name: name.trim(), careersUrl: careersUrl.trim() }
    if (showNotes) {
      next.networkingNotes = companyNoteToStorage(companyNote)
      next.networkingConnections = cleanConnections(connections)
    }
    const message = await onSubmit(next)
    if (message) {
      setError(message)
      setBusy(false)
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className={`modal ${showNotes ? 'company-edit-modal' : ''}`.trim()} onSubmit={submit}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <div className={showNotes ? 'company-edit-fields' : 'company-form-fields'}>
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
        </div>
        {showNotes ? (
          <>
            <ConnectionRows connections={connections} onChange={setConnections} />
            <section className="company-edit-notes" aria-label="Notes">
              <span className="company-edit-notes-label">Notes</span>
              <NoteEditor
                note={companyNote}
                onChange={(note: StoredNote) => setCompanyNote(note)}
                ariaLabel={`Notes for ${name || 'company'}`}
              />
            </section>
          </>
        ) : null}
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
          Its open roles will no longer show here. You can add the company again anytime.
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

function NetworkingControl({ company }: { company: Company }) {
  if (company.networkingStage === 'none') {
    return null
  }

  const current = NETWORKING_STAGES.find((s) => s.key === company.networkingStage) ?? NETWORKING_STAGES[0]

  return (
    <span className={`net-wrap stage-${company.networkingStage}`}>
      <span className="net-chip" aria-label={current.label} data-tooltip={current.label}>
        <ConnectionIcon />
      </span>
    </span>
  )
}

function CompanyCard({
  company,
  onEdit,
  onRemove,
  onLog,
  onHideRole,
}: {
  company: Company
  onEdit: (company: Company) => void
  onRemove: (company: Company) => void
  onLog: (company: Company, role: Role) => void
  onHideRole: (role: Role) => void
}) {
  const [open, setOpen] = useState(false)
  const hasFreshRole = company.roles.some(isFresh)
  return (
    <article className={open ? 'watch-group open' : 'watch-group'}>
      <div
        className="watch-head clickable-watch-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen((value) => !value)
          }
        }}
      >
        <button
          type="button"
          className="company-toggle"
          tabIndex={-1}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="company-name">{company.name}</span>
          {hasFreshRole ? <span className="role-new-chip">New</span> : null}
        </button>
        <NetworkingControl company={company} />
        <span className="company-spacer" />
        <KebabMenu>
          <button type="button" onClick={() => onEdit(company)}>
            Edit
          </button>
          <button type="button" onClick={() => onRemove(company)}>
            Remove
          </button>
        </KebabMenu>
      </div>
      {open ? (
        <>
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
                </div>
                <LocationLine role={role} showWorkMode={false} />
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
              <button
                className="round-icon hide-role"
                type="button"
                aria-label="Skip"
                data-tooltip="Skip"
                onClick={() => onHideRole(role)}
              >
                <SkipIcon />
              </button>
            </div>
          ))}
          {company.resolutionStatus === 'unresolved' ? (
            <div className="watch-role">
              <div className="role-loc">
                We couldn&apos;t find this company&apos;s job board yet. Add its careers link to help
                us watch it.
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

function QuietRow({
  company,
  onEdit,
  onRemove,
  onRetry,
  retrying,
}: {
  company: Company
  onEdit: (company: Company) => void
  onRemove: (company: Company) => void
  onRetry: (company: Company) => void
  retrying: boolean
}) {
  const hasReconnect = company.resolutionStatus === 'unresolved' && Boolean(company.careersUrl)
  return (
    <article className="watch-group quiet-company">
      <div className="watch-head">
        <div className="company-warning-name">
          {hasReconnect ? (
            <span
              className="round-icon warning-status"
              aria-label="Could not pull roles"
              data-tooltip="Looks like we cannot pull roles from this link. Check that it is correct, or reconnect. Some careers pages may not be supported yet."
            >
              <WarningIcon />
            </span>
          ) : null}
          <div className="company-name">{company.name}</div>
        </div>
        <NetworkingControl company={company} />
        <span className="company-spacer" />
        <KebabMenu>
          {hasReconnect ? (
            <button type="button" disabled={retrying} onClick={() => onRetry(company)}>
              {retrying ? 'Reconnecting…' : 'Reconnect'}
            </button>
          ) : null}
          <button type="button" onClick={() => onEdit(company)}>
            Edit
          </button>
          <button type="button" onClick={() => onRemove(company)}>
            Remove
          </button>
        </KebabMenu>
      </div>
    </article>
  )
}

function SkippedRoleGroups({
  companies,
  onLog,
  onRestoreRole,
}: {
  companies: Company[]
  onLog: (company: Company, role: Role) => void
  onRestoreRole: (role: Role) => void
}) {
  const groups = companies.filter((company) => company.hiddenRoles.length > 0)
  if (groups.length === 0) {
    return <p className="watch-invite">No skipped Watchlist roles right now.</p>
  }
  return (
    <div className="watch-card-list">
      {groups.map((company) => (
        <article className="watch-group board-feed" key={company.id}>
          <div className="watch-hidden-head">
            <div className="company-name">{company.name}</div>
          </div>
          {company.hiddenRoles.map((role) => (
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
                </div>
                <LocationLine role={role} showWorkMode={false} />
                <div className="role-posted">Posted: {formatPostedDate(role.postedAt)}</div>
              </div>
              <button className="text-button" type="button" onClick={() => onRestoreRole(role)}>
                Restore
              </button>
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
        </article>
      ))}
    </div>
  )
}

// `initialCompanies` is whatever the page already fetched during server
// rendering, or null when it could not. Seeding from it means a reload arrives
// with the watchlist on screen rather than a loading line, and the browser
// fetch below is skipped as redundant. Every mutation still calls reload().
export function WatchlistView({
  initialCompanies = null,
}: {
  initialCompanies?: Company[] | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [companies, setCompanies] = useState<Company[] | null>(initialCompanies)
  const [failed, setFailed] = useState(false)
  const [editor, setEditor] = useState<Editor>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [logging, setLogging] = useState<LogApplicationInitial | null>(null)
  const { message: snack, showSnack } = useSnackbar()
  const mode = ['hidden', 'skipped'].includes(searchParams.get('view') ?? '')
    ? 'skipped'
    : 'watchlist'

  function showMode(nextMode: 'watchlist' | 'skipped') {
    const params = new URLSearchParams(searchParams)
    if (nextMode === 'skipped') {
      params.set('view', 'skipped')
    } else {
      params.delete('view')
    }
    const query = params.toString()
    router.push(query ? `/watchlist?${query}` : '/watchlist', { scroll: false })
  }

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
    if (initialCompanies !== null) return
    void reload()
  }, [initialCompanies])

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

  async function setListingStatus(role: Role, status: 'new' | 'irrelevant') {
    const previous = companies
    setCompanies(
      (prev) =>
        prev?.map((company) => {
          const inVisible = company.roles.some((item) => item.id === role.id)
          const inHidden = company.hiddenRoles.some((item) => item.id === role.id)
          if (!inVisible && !inHidden) return company
          return status === 'irrelevant'
            ? {
                ...company,
                roles: company.roles.filter((item) => item.id !== role.id),
                hiddenRoles: inHidden ? company.hiddenRoles : [...company.hiddenRoles, role],
              }
            : {
                ...company,
                roles: inVisible ? company.roles : [...company.roles, role],
                hiddenRoles: company.hiddenRoles.filter((item) => item.id !== role.id),
              }
        }) ?? prev,
    )
    try {
      const response = await fetch(`/api/watchlist/companies/listings/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error(`Update failed: ${response.status}`)
      showSnack({ text: status === 'irrelevant' ? 'Role skipped.' : 'Role restored.' }, 4000)
    } catch {
      setCompanies(previous)
      showSnack({ text: 'Could not update that role. Try again.' }, 4000)
    }
  }

  // Re-attempt resolution for a company we couldn't place on an ATS, useful
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
  // listings) and appears in Pipeline or All applications depending on stage.
  async function onLogged(application: Application) {
    await reload()
    const inPipeline = isPipelineStatus(application.status)
    showSnack(
      inPipeline
        ? { text: 'Logged. You can see it in pipeline.', linkText: 'pipeline', href: '/pipeline' }
        : {
            text: 'Application logged. It moved to All applications.',
            linkText: 'all applications',
            href: '/applications',
          },
      5000,
    )
  }

  const { recent, older, quiet } = useMemo(() => {
    const list = companies ?? []
    const withRoles = list.filter((company) => company.roles.length > 0)
    return {
      recent: withRoles
        .filter((company) => company.roles.some(isFresh))
        .sort((a, b) => companyRoleDate(b) - companyRoleDate(a)),
      older: withRoles
        .filter((company) => !company.roles.some(isFresh))
        .sort((a, b) => companyRoleDate(b) - companyRoleDate(a)),
      quiet: list
        .filter((company) => company.roles.length === 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  }, [companies])

  return (
    <section className="screen" data-screen="watchlist">
      <div className="page-head">
        <div className="job-board-title-wrap">
          <h1>{mode === 'skipped' ? 'Skipped roles' : 'Watchlist'}</h1>
          <KebabMenu menuClassName="board-menu">
            {mode !== 'watchlist' ? (
              <button type="button" onClick={() => showMode('watchlist')}>
                Watchlist
              </button>
            ) : null}
            {mode !== 'skipped' ? (
              <button type="button" onClick={() => showMode('skipped')}>
                Skipped roles
              </button>
            ) : null}
          </KebabMenu>
        </div>
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
        ) : mode === 'skipped' ? (
          <SkippedRoleGroups
            companies={companies}
            onLog={openLog}
            onRestoreRole={(role) => void setListingStatus(role, 'new')}
          />
        ) : (
          <div className="watch-card-list">
            {[...recent, ...older].map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onEdit={(c) => setEditor({ mode: 'edit', company: c })}
                onRemove={(c) => setEditor({ mode: 'remove', company: c })}
                onLog={openLog}
                onHideRole={(role) => void setListingStatus(role, 'irrelevant')}
              />
            ))}
            {quiet.map((company) => (
              <QuietRow
                key={company.id}
                company={company}
                onEdit={(c) => setEditor({ mode: 'edit', company: c })}
                onRemove={(c) => setEditor({ mode: 'remove', company: c })}
                onRetry={retryCompany}
                retrying={retryingId === company.id}
              />
            ))}
          </div>
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
          title="Edit"
          submitLabel="Save"
          initial={{
            name: editor.company.name,
            careersUrl: editor.company.careersUrl ?? '',
            networkingNotes: editor.company.networkingNotes,
            networkingConnections: editor.company.networkingConnections,
          }}
          showNotes
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
