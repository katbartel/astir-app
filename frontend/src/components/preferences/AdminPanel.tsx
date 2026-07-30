'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useUser } from '../UserProvider'

type ResolutionStatus = 'pending' | 'resolved' | 'unresolved'
type ReviewStatus = 'reviewed' | 'not_reviewed' | 'to_review'

type RemoteCompany = {
  id: string
  name: string
  careersUrl: string | null
  companyWebsite: string | null
  note: string | null
  reviewStatus: ReviewStatus
  resolutionStatus: ResolutionStatus
  addedByEmail: string | null
  createdAt: string
}

type BulkResultRow = {
  name: string
  status: 'resolved' | 'unresolved' | 'duplicate' | 'invalid'
}

const STATUS_LABEL: Record<ResolutionStatus, string> = {
  resolved: 'Active',
  pending: 'Pending',
  unresolved: 'Not found',
}

type SortKey = 'newest' | 'name' | 'working' | 'not-working'
type ListFilter = 'active' | 'not-found' | 'reviewed' | 'not-reviewed' | 'to-review'

// "Working" = the careers URL resolved. Used to sort resolved vs. the rest.
const workingRank = (company: RemoteCompany) => (company.resolutionStatus === 'resolved' ? 1 : 0)

const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Newest first',
  name: 'Name (A-Z)',
  working: 'Active first',
  'not-working': 'Not found first',
}

const FILTER_LABEL: Record<ListFilter, string> = {
  active: 'Active',
  'not-found': 'Not found',
  reviewed: 'Reviewed',
  'not-reviewed': 'Not reviewed',
  'to-review': 'To review',
}

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  not_reviewed: 'Not reviewed',
  to_review: 'To review',
  reviewed: 'Reviewed',
}

const REVIEW_STATUS_OPTIONS: ReviewStatus[] = ['not_reviewed', 'to_review', 'reviewed']

const FILTER_TO_REVIEW_STATUS: Partial<Record<ListFilter, ReviewStatus>> = {
  reviewed: 'reviewed',
  'not-reviewed': 'not_reviewed',
  'to-review': 'to_review',
}

export function AdminPanel() {
  const user = useUser()
  const [companies, setCompanies] = useState<RemoteCompany[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  // Single-add form.
  const [name, setName] = useState('')
  const [careersUrl, setCareersUrl] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Bulk paste.
  const [bulkText, setBulkText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResultRow[] | null>(null)

  // Re-resolve "Not found" companies (e.g. after a new ATS provider ships).
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  // List search + sort controls.
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [filters, setFilters] = useState<ListFilter[]>([])

  // Inline editing of a company's name / careers URL.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editCompanyWebsite, setEditCompanyWebsite] = useState('')
  const [editNote, setEditNote] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (!user.isAdmin) {
      return
    }
    let cancelled = false
    fetch('/api/remote-companies')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed: ${response.status}`)
        return (await response.json()) as RemoteCompany[]
      })
      .then((data) => {
        if (!cancelled) setCompanies(data)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [user.isAdmin])

  if (!user.isAdmin) {
    return (
      <section className="screen">
        <div className="page-head">
          <h1>Admin Panel</h1>
        </div>
        <div className="prefs-card">
          <p className="watch-invite">You don’t have access to this page.</p>
        </div>
      </section>
    )
  }

  async function refresh() {
    try {
      const response = await fetch('/api/remote-companies')
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      setCompanies((await response.json()) as RemoteCompany[])
    } catch {
      setLoadFailed(true)
    }
  }

  async function addOne(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const response = await fetch('/api/remote-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          careersUrl: careersUrl.trim() || undefined,
          companyWebsite: companyWebsite.trim() || undefined,
          note: note.trim() || undefined,
        }),
      })
      if (response.status === 409) {
        setAddError('That company is already on the list.')
        return
      }
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      const created = (await response.json()) as RemoteCompany
      setCompanies((prev) => [created, ...(prev ?? [])])
      setName('')
      setCareersUrl('')
      setCompanyWebsite('')
      setNote('')
    } catch {
      setAddError('Could not add that company. Try again.')
    } finally {
      setAdding(false)
    }
  }

  async function addBulk() {
    const text = bulkText.trim()
    if (!text || bulkBusy) return
    setBulkBusy(true)
    setBulkResults(null)
    try {
      const response = await fetch('/api/remote-companies/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      const results = (await response.json()) as BulkResultRow[]
      setBulkResults(results)
      setBulkText('')
      await refresh()
    } catch {
      setBulkResults([{ name: 'Something went wrong. Try again.', status: 'invalid' }])
    } finally {
      setBulkBusy(false)
    }
  }

  async function refreshUnresolved() {
    if (refreshing) return
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const response = await fetch('/api/remote-companies/refresh', { method: 'POST' })
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      const result = (await response.json()) as {
        attempted: number
        resolved: number
        unresolved: number
      }
      setRefreshMessage(
        result.attempted === 0
          ? 'Nothing to re-resolve — every company is already resolved.'
          : `${result.resolved} newly resolved · ${result.unresolved} still not found.`,
      )
      await refresh()
    } catch {
      setRefreshMessage('Re-resolve failed. Try again.')
    } finally {
      setRefreshing(false)
    }
  }

  async function retryOne(company: RemoteCompany) {
    if (retryingId) return
    setRetryingId(company.id)
    try {
      const response = await fetch(`/api/remote-companies/${company.id}/resolve`, { method: 'POST' })
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      const updated = (await response.json()) as RemoteCompany
      setCompanies((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? prev)
    } catch {
      setRefreshMessage('Could not re-resolve that company. Try again.')
    } finally {
      setRetryingId(null)
    }
  }

  function startEdit(company: RemoteCompany) {
    setEditingId(company.id)
    setEditName(company.name)
    setEditUrl(company.careersUrl ?? '')
    setEditCompanyWebsite(company.companyWebsite ?? '')
    setEditNote(company.note ?? '')
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function saveEdit(company: RemoteCompany) {
    const trimmed = editName.trim()
    if (!trimmed || savingEdit) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const response = await fetch(`/api/remote-companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          careersUrl: editUrl.trim(),
          companyWebsite: editCompanyWebsite.trim(),
          note: editNote.trim(),
        }),
      })
      if (response.status === 409) {
        setEditError('That company name is already on the list.')
        return
      }
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      const updated = (await response.json()) as RemoteCompany
      setCompanies((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? prev)
      setEditingId(null)
    } catch {
      setEditError('Could not save. Try again.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function remove(company: RemoteCompany) {
    const previous = companies
    setCompanies((prev) => prev?.filter((item) => item.id !== company.id) ?? prev)
    try {
      const response = await fetch(`/api/remote-companies/${company.id}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 204) {
        throw new Error(`Request failed: ${response.status}`)
      }
    } catch {
      setCompanies(previous ?? null)
    }
  }

  async function updateReviewStatus(company: RemoteCompany, reviewStatus: ReviewStatus) {
    if (company.reviewStatus === reviewStatus) return
    setCompanies((prev) =>
      prev?.map((item) => (item.id === company.id ? { ...item, reviewStatus } : item)) ?? prev,
    )
    try {
      const response = await fetch(`/api/remote-companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus }),
      })
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      const updated = (await response.json()) as RemoteCompany
      setCompanies((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? prev)
    } catch {
      setCompanies((prev) =>
        prev?.map((item) =>
          item.id === company.id ? { ...item, reviewStatus: company.reviewStatus } : item,
        ) ?? prev,
      )
    }
  }

  function toggleFilter(filter: ListFilter) {
    setFilters((prev) =>
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter],
    )
  }

  const resultSummary = bulkResults
    ? {
        resolved: bulkResults.filter((row) => row.status === 'resolved').length,
        unresolved: bulkResults.filter((row) => row.status === 'unresolved').length,
        duplicate: bulkResults.filter((row) => row.status === 'duplicate').length,
        invalid: bulkResults.filter((row) => row.status === 'invalid').length,
      }
    : null

  const query = search.trim().toLowerCase()
  const statusFilters = filters.filter((filter) => filter === 'active' || filter === 'not-found')
  const reviewFilters = filters.filter(
    (filter) => filter === 'reviewed' || filter === 'not-reviewed' || filter === 'to-review',
  )
  const visibleCompanies = companies
    ? companies
        .filter(
          (company) =>
            !query ||
            company.name.toLowerCase().includes(query) ||
            (company.careersUrl?.toLowerCase().includes(query) ?? false) ||
            (company.companyWebsite?.toLowerCase().includes(query) ?? false) ||
            (company.note?.toLowerCase().includes(query) ?? false),
        )
        .filter((company) => {
          if (statusFilters.length === 0) return true
          return statusFilters.some((filter) =>
            filter === 'active'
              ? company.resolutionStatus === 'resolved'
              : company.resolutionStatus === 'unresolved',
          )
        })
        .filter((company) => {
          if (reviewFilters.length === 0) return true
          return reviewFilters.some((filter) => FILTER_TO_REVIEW_STATUS[filter] === company.reviewStatus)
        })
        .sort((a, b) => {
          switch (sortKey) {
            case 'name':
              return a.name.localeCompare(b.name)
            case 'working':
              return workingRank(b) - workingRank(a)
            case 'not-working':
              return workingRank(a) - workingRank(b)
            case 'newest':
            default:
              return b.createdAt.localeCompare(a.createdAt)
          }
        })
    : null

  return (
    <section className="screen">
      <div className="page-head">
        <h1>Admin Panel</h1>
      </div>

      <div className="prefs-card">
        <h2 className="prefs-section-title">Remote job board companies</h2>
        <p className="prefs-hint">
          The global, curated list of remote companies. Their matching openings appear on the Remote
          Job Board for every user and are kept off the regular Job Boards feed.
        </p>

        <form onSubmit={addOne}>
          <label>
            Company name
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setAddError(null)
              }}
              maxLength={200}
              placeholder="e.g. GitLab"
            />
          </label>
          <label>
            Careers URL (optional)
            <input
              value={careersUrl}
              onChange={(event) => setCareersUrl(event.target.value)}
              maxLength={2000}
              placeholder="https://…"
            />
          </label>
          <label>
            Company website (optional)
            <input
              value={companyWebsite}
              onChange={(event) => setCompanyWebsite(event.target.value)}
              maxLength={2000}
              placeholder="https://example.com"
            />
          </label>
          <label>
            Note (optional)
            <textarea
              className="prefs-textarea admin-note-field"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={5000}
              rows={3}
              placeholder="Context for this company"
            />
          </label>
          <div className="prefs-actions">
            <button className="btn solid" type="submit" disabled={!name.trim() || adding}>
              {adding ? 'Adding…' : 'Add company'}
            </button>
            {addError ? <span className="prefs-status error">{addError}</span> : null}
          </div>
        </form>
      </div>

      <div className="prefs-card">
        <h2 className="prefs-section-title">Add many</h2>
        <p className="prefs-hint">
          One company per line. Add an optional careers URL after a comma —{' '}
          <code>GitLab, https://job-boards.greenhouse.io/gitlab</code> — or on its own line
          right below the company name.
        </p>
        <label>
          <textarea
            className="prefs-textarea"
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            rows={8}
            placeholder={'GitLab\nAutomattic\nZapier, https://…'}
          />
        </label>
        <div className="prefs-actions">
          <button className="btn solid" type="button" disabled={!bulkText.trim() || bulkBusy} onClick={addBulk}>
            {bulkBusy ? 'Resolving…' : 'Add all'}
          </button>
        </div>
        {resultSummary ? (
          <p className="prefs-status">
            {resultSummary.resolved} resolved · {resultSummary.unresolved} not found ·{' '}
            {resultSummary.duplicate} already listed
            {resultSummary.invalid ? ` · ${resultSummary.invalid} invalid` : ''}
          </p>
        ) : null}
      </div>

      <div className="prefs-card">
        <div className="prefs-section-head">
          <h2 className="prefs-section-title">
            On the list
            {companies
              ? query || filters.length > 0
                ? ` (${visibleCompanies?.length ?? 0} of ${companies.length})`
                : ` (${companies.length})`
              : ''}
          </h2>
          <button
            className="btn"
            type="button"
            disabled={refreshing || !companies?.some((c) => c.resolutionStatus !== 'resolved')}
            onClick={refreshUnresolved}
          >
            {refreshing ? 'Re-resolving…' : 'Re-resolve not found'}
          </button>
        </div>
        {companies && companies.length > 0 ? (
          <div className="admin-list-controls">
            <input
              className="admin-list-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by company, URL, website, or note…"
              aria-label="Search companies"
            />
            <label className="admin-list-sort">
              Sort
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-list-filters" aria-label="Filter companies">
              {(Object.keys(FILTER_LABEL) as ListFilter[]).map((filter) => {
                const active = filters.includes(filter)
                return (
                  <button
                    key={filter}
                    className={`admin-filter-chip${active ? ' on' : ''}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleFilter(filter)}
                  >
                    {FILTER_LABEL[filter]}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <p className="prefs-hint">
          Re-attempts every “Not found” company — use this after a new ATS integration ships so
          companies that couldn’t be matched before get picked up.
        </p>
        {refreshMessage ? <p className="prefs-status">{refreshMessage}</p> : null}
        {loadFailed ? (
          <p className="watch-invite">Couldn’t load the list. Try refreshing.</p>
        ) : companies === null ? (
          <p className="watch-invite">Loading…</p>
        ) : companies.length === 0 ? (
          <p className="watch-invite">No companies yet. Add some above.</p>
        ) : visibleCompanies && visibleCompanies.length === 0 ? (
          <p className="watch-invite">No companies match the current filters.</p>
        ) : (
          <ul className="admin-company-list">
            {visibleCompanies?.map((company) =>
              editingId === company.id ? (
                <li key={company.id} className="admin-company-row editing">
                  <div className="admin-company-edit">
                    <label>
                      Company name
                      <input
                        value={editName}
                        onChange={(event) => {
                          setEditName(event.target.value)
                          setEditError(null)
                        }}
                        maxLength={200}
                      />
                    </label>
                    <label>
                      Careers URL
                      <input
                        value={editUrl}
                        onChange={(event) => setEditUrl(event.target.value)}
                        maxLength={2000}
                        placeholder="https://…"
                      />
                    </label>
                    <label>
                      Company website
                      <input
                        value={editCompanyWebsite}
                        onChange={(event) => setEditCompanyWebsite(event.target.value)}
                        maxLength={2000}
                        placeholder="https://example.com"
                      />
                    </label>
                    <label>
                      Note
                      <textarea
                        className="prefs-textarea admin-note-field"
                        value={editNote}
                        onChange={(event) => setEditNote(event.target.value)}
                        maxLength={5000}
                        rows={3}
                        placeholder="Context for this company"
                      />
                    </label>
                    <div className="prefs-actions">
                      <button
                        className="btn solid"
                        type="button"
                        disabled={!editName.trim() || savingEdit}
                        onClick={() => saveEdit(company)}
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        disabled={savingEdit}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                      {editError ? <span className="prefs-status error">{editError}</span> : null}
                    </div>
                  </div>
                </li>
              ) : (
                <li key={company.id} className="admin-company-row">
                  <div className="admin-company-main">
                    <div className="admin-company-heading">
                      <span className="admin-company-name">{company.name}</span>
                      <span className={`admin-status admin-status-${company.resolutionStatus}`}>
                        {STATUS_LABEL[company.resolutionStatus]}
                      </span>
                      <select
                        className={`admin-review-select admin-review-${company.reviewStatus}`}
                        value={company.reviewStatus}
                        aria-label={`Review status for ${company.name}`}
                        onChange={(event) =>
                          updateReviewStatus(company, event.target.value as ReviewStatus)
                        }
                      >
                        {REVIEW_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {REVIEW_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {company.careersUrl ? (
                      <a
                        className="admin-company-link"
                        href={company.careersUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={company.careersUrl}
                      >
                        {company.careersUrl}
                      </a>
                    ) : (
                      <span className="admin-company-link muted">No careers link</span>
                    )}
                    {company.companyWebsite ? (
                      <a
                        className="admin-company-link"
                        href={company.companyWebsite}
                        target="_blank"
                        rel="noreferrer"
                        title={company.companyWebsite}
                      >
                        Website: {company.companyWebsite}
                      </a>
                    ) : (
                      <span className="admin-company-link muted">No company website</span>
                    )}
                    {company.note ? <span className="admin-company-note">{company.note}</span> : null}
                  </div>
                  <div className="admin-company-actions">
                    <button className="text-button" type="button" onClick={() => startEdit(company)}>
                      Edit
                    </button>
                    {/* Offered on Active rows too: a company can be linked to a
                        board that resolved but has never returned a job, and
                        re-resolving is how it gets re-probed from scratch. */}
                    <button
                      className="text-button"
                      type="button"
                      disabled={retryingId === company.id}
                      onClick={() => retryOne(company)}
                    >
                      {retryingId === company.id ? 'Retrying…' : 'Retry'}
                    </button>
                    <button className="text-button" type="button" onClick={() => remove(company)}>
                      Remove
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </section>
  )
}
