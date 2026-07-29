'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Application,
  type Status,
  createApplication,
  deleteApplication,
  normalizeMode,
  normalizeStatus,
  plainDate,
  todayKey,
} from '@/lib/applications'
import { compactLocationLabel, displayLocationParts } from '@/lib/location-display'
import { STAGE_IDS, useStageConfig } from '@/lib/stages'
import { applicationsToCsv, parseApplicationsCsv } from '@/lib/applications-csv'
import { KebabMenu } from './applications/KebabMenu'
import { LogApplicationModal, type LogApplicationInitial } from './applications/LogApplicationModal'
import { StageFilter } from './applications/StageFilter'
import { StageSelect } from './applications/StageSelect'
import { useApplications } from './applications/useApplications'
import { ChevronDownIcon, OpenIcon, SearchIcon } from './icons'
import { PageSkeleton } from './PageSkeleton'

type ColumnKey = 'company' | 'role' | 'stage' | 'location' | 'type' | 'posted' | 'applied' | 'menu'
type Column = { key: ColumnKey; label: string; sortable?: boolean }
type SortKey = 'company' | 'role' | 'stage'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

const COLUMNS: Column[] = [
  { key: 'company', label: 'Company', sortable: true },
  { key: 'role', label: 'Role', sortable: true },
  { key: 'stage', label: 'Stage', sortable: true },
  { key: 'applied', label: 'Applied' },
  { key: 'location', label: 'Location' },
  { key: 'type', label: 'Type' },
  { key: 'posted', label: 'Posted' },
  { key: 'menu', label: '' },
]

const WIDTHS_KEY = 'astir.applicationTableWidths'
const menuColumnStyle = { width: 'calc(var(--menu-trigger) + var(--space-4))' } as const

function tableValue(value: string | null | undefined) {
  return value ? value : '—'
}

function countText(count: number) {
  return count === 1 ? '1 application' : `${count} applications`
}

// Header label: the total on its own ("82 applications"), or "56 of 82
// applications" when a filter/search narrows the list — so the visible count is
// never mistaken for the total.
function applicationsCountLabel(shown: number, total: number) {
  return shown === total ? countText(total) : `${shown} of ${countText(total)}`
}

// Collapse a possibly multi-value location into a compact label plus the full
// list for the hover tooltip. "Germany,Austria,Finland" becomes "Germany +2"
// with all three revealed on hover; a single value is shown as-is.
function locationCell(
  location: string | null | undefined,
  locations: string[] | undefined,
) {
  return compactLocationLabel(displayLocationParts(locations ?? [], location))
}

export function ApplicationsView() {
  const { applications, failed, changeStage, reload, showSnack, overlay } = useApplications()
  const { rankOf } = useStageConfig()
  const importInput = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<Set<Status>>(new Set())
  const [sort, setSort] = useState<Sort>({ key: 'company', dir: 'asc' })
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [logging, setLogging] = useState(false)
  const [editing, setEditing] = useState<LogApplicationInitial | null>(null)
  const [deleting, setDeleting] = useState<Application | null>(null)
  const resizing = useRef<{ key: string; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WIDTHS_KEY)
      if (saved) setWidths(JSON.parse(saved) as Record<string, number>)
    } catch {
      // ignore malformed cache
    }
  }, [])

  const all = applications ?? []
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return all
      .filter((application) =>
        needle
          ? `${application.company} ${application.role}`.toLowerCase().includes(needle)
          : true,
      )
      .filter((application) =>
        stageFilter.size === 0 ? true : stageFilter.has(normalizeStatus(application.status)),
      )
      .sort((a, b) => {
        let result = 0
        if (sort.key === 'stage') result = rankOf(a.status) - rankOf(b.status)
        else if (sort.key === 'role') result = a.role.localeCompare(b.role)
        else result = a.company.localeCompare(b.company)
        if (result === 0) {
          result = a.company.localeCompare(b.company) || a.role.localeCompare(b.role)
        }
        return sort.dir === 'desc' ? -result : result
      })
  }, [all, query, rankOf, stageFilter, sort])

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    )
  }

  function colWidth(key: ColumnKey): React.CSSProperties | undefined {
    if (key === 'menu') return menuColumnStyle
    return widths[key] ? { width: `${widths[key]}px` } : undefined
  }

  function startResize(key: ColumnKey, event: React.PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    const header = (event.target as HTMLElement).closest('th')
    if (!header) return
    resizing.current = { key, startX: event.clientX, startWidth: header.getBoundingClientRect().width }
    document.body.classList.add('resizing-table')

    const minWidth =
      Number(
        getComputedStyle(document.documentElement)
          .getPropertyValue('--table-column-min')
          .replace('px', ''),
      ) || 0

    function onMove(moveEvent: PointerEvent) {
      const state = resizing.current
      if (!state) return
      const next = Math.max(minWidth, state.startWidth + moveEvent.clientX - state.startX)
      setWidths((current) => ({ ...current, [state.key]: Math.round(next) }))
    }
    function onUp() {
      resizing.current = null
      document.body.classList.remove('resizing-table')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setWidths((current) => {
        try {
          window.localStorage.setItem(WIDTHS_KEY, JSON.stringify(current))
        } catch {
          // ignore quota / disabled storage
        }
        return current
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function openEdit(application: Application) {
    setEditing({
      id: application.id,
      listingId: application.listingId,
      company: application.company,
      role: application.role,
      link: application.link ?? '',
      status: application.status,
      appliedDate: application.appliedDate,
      note: application.note,
    })
  }

  async function confirmDelete() {
    if (!deleting) return
    await deleteApplication(deleting.id)
    setDeleting(null)
    await reload()
  }

  function exportCsv() {
    const csv = applicationsToCsv(all)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `applications-${todayKey()}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  async function importCsv(file: File) {
    let parsed
    try {
      parsed = parseApplicationsCsv(await file.text())
    } catch {
      showSnack({ text: 'Could not read that file. Export a CSV to see the expected columns.' }, 5000)
      return
    }
    if (parsed.rows.length === 0) {
      showSnack({ text: 'No rows to import. Each row needs at least a company or role.' }, 5000)
      return
    }
    const results = await Promise.allSettled(parsed.rows.map((row) => createApplication(row)))
    const added = results.filter((result) => result.status === 'fulfilled').length
    const failed = results.length - added
    await reload()
    const notes: string[] = []
    if (added) notes.push(`Imported ${countText(added)}`)
    if (failed) notes.push(`${failed} couldn't be added`)
    if (parsed.incomplete) notes.push(`${parsed.incomplete} had missing info, added as incomplete`)
    showSnack({ text: `${notes.join(' — ')}.` }, 5000)
  }

  async function onImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await importCsv(file)
  }

  if (!failed && applications === null) {
    return <PageSkeleton variant="applications" />
  }

  return (
    <section className="screen applications-screen" data-screen="applications">
      <Link className="crumb" href="/pipeline">
        Pipeline
      </Link>
      <div className="applications-head">
        <div className="applications-title-row">
          <h1>All applications</h1>
          <button className="btn ghost" type="button" onClick={() => setLogging(true)}>
            Log application
          </button>
        </div>
        <div className="applications-meta">
          <div className="applications-count-search">
            <div className="applications-count">{applicationsCountLabel(rows.length, all.length)}</div>
            <div className={`applications-search ${searchOpen ? 'open' : ''}`.trim()}>
              <button
                className="round-icon"
                type="button"
                aria-label="Search"
                data-tooltip="Search"
                onClick={() => setSearchOpen((open) => !open)}
              >
                <SearchIcon />
              </button>
              <input
                type="search"
                autoComplete="off"
                placeholder="Search"
                hidden={!searchOpen}
                aria-hidden={!searchOpen}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="applications-tools">
            <StageFilter selected={stageFilter} onChange={setStageFilter} />
            <KebabMenu menuClassName="application-menu">
              <button type="button" onClick={() => importInput.current?.click()}>
                Import from CSV
              </button>
              <button type="button" onClick={exportCsv}>
                Export to CSV
              </button>
            </KebabMenu>
            <input
              ref={importInput}
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void onImportChange(event)}
            />
          </div>
        </div>
      </div>
      <div className="applications-table-wrap">
        <table className="applications-table">
          <colgroup>
            {COLUMNS.map((column) => (
              <col data-col={column.key} style={colWidth(column.key)} key={column.key} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  className={`${column.sortable ? 'sortable' : ''}${sort.key === column.key ? ' active-sort' : ''}`.trim()}
                  data-column={column.key}
                  style={colWidth(column.key)}
                  key={column.key}
                >
                  {column.sortable ? (
                    <button type="button" onClick={() => toggleSort(column.key as SortKey)}>
                      <span>{column.label}</span>
                      {sort.key === column.key ? (
                        <span className={`sort-indicator ${sort.dir}`} aria-hidden="true">
                          <ChevronDownIcon />
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <span>{column.label ? <span>{column.label}</span> : null}</span>
                  )}
                  {column.key !== 'menu' ? (
                    <span
                      className="column-resizer"
                      aria-hidden="true"
                      onPointerDown={(event) => startResize(column.key, event)}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-empty">
                  No applications here yet.
                </td>
              </tr>
            ) : (
              rows.map((application) => {
                const openUrl = application.link || application.posting?.url || ''
                const location = locationCell(
                  application.posting?.location,
                  application.posting?.locations,
                )
                return (
                  <tr key={application.id}>
                    <td>
                      <span
                        className="cell-text"
                        data-tooltip={application.company || undefined}
                      >
                        {tableValue(application.company)}
                      </span>
                    </td>
                    <td>
                      <span className="table-role">
                        <span
                          className="cell-text"
                          data-tooltip={application.role || undefined}
                        >
                          {tableValue(application.role)}
                        </span>
                        {openUrl ? (
                          <a
                            className="round-icon small"
                            href={openUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open posting"
                            data-tooltip="Open posting"
                          >
                            <OpenIcon />
                          </a>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <StageSelect
                        className="stage-select"
                        value={application.status}
                        onChange={(status: Status) =>
                          void changeStage(application, status, 'applications')
                        }
                      />
                    </td>
                    <td>
                      <span className="cell-text">
                        {tableValue(plainDate(application.appliedDate))}
                      </span>
                    </td>
                    <td>
                      <span className="cell-text" data-tooltip={location.tooltip}>
                        {location.display}
                      </span>
                    </td>
                    <td>
                      <span className="cell-text">
                        {application.posting?.workMode
                          ? normalizeMode(application.posting.workMode)
                          : '—'}
                      </span>
                    </td>
                    <td>
                      <span className="cell-text">
                        {tableValue(plainDate(application.posting?.postedAt))}
                      </span>
                    </td>
                    <td>
                      <KebabMenu menuClassName="application-menu">
                        <button type="button" onClick={() => openEdit(application)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => setDeleting(application)}>
                          Delete
                        </button>
                      </KebabMenu>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {logging ? (
        <LogApplicationModal
          initial={{ status: STAGE_IDS.applied }}
          onClose={() => setLogging(false)}
          onSaved={(_application, isNew) => {
            void reload()
            if (isNew) showSnack({ text: 'Application logged.' })
          }}
        />
      ) : null}

      {editing ? (
        <LogApplicationModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      ) : null}

      {deleting ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setDeleting(null)}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="deleteApplicationTitle">
            <div className="modal-head">
              <h2 id="deleteApplicationTitle">Delete this application?</h2>
            </div>
            <div className="modal-copy">
              This removes the application and its notes. There is no undo.
            </div>
            <div className="modal-actions">
              <button className="btn ghost" type="button" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button className="btn solid" type="button" onClick={() => void confirmDelete()}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {overlay}
    </section>
  )
}
