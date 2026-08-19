'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Application } from '@/lib/applications'
import { isPipelineStatus } from '@/lib/applications'
import { STAGE_IDS } from '@/lib/stages'
import { useUser } from './UserProvider'
import { KebabMenu } from './applications/KebabMenu'
import { LogApplicationModal, type LogApplicationInitial } from './applications/LogApplicationModal'
import { Snackbar, useSnackbar } from './applications/useSnackbar'
import { CalendarIcon, ChevronDownIcon, FlameIcon, OpenIcon, PlusIcon, SearchIcon } from './icons'

type ListingStatus = 'new' | 'irrelevant'

type WatchlistPreferences = {
  hiringRegions: string[]
}

// Shape of GET /api/remote-job-board/listings (JobBoardListing on the backend).
export type Listing = {
  id: string
  title: string
  companyName: string
  location: string | null
  // Every region the same role is posted in; folded into one row (e.g.
  // "Remote (Europe) +4").
  locations: string[]
  workMode: string | null
  // ISO 639-1 code of the language the ad is written in (e.g. 'en', 'de'), when
  // the provider exposes it; null otherwise.
  contentLanguage: string | null
  url: string
  postedAt: string | null
  firstSeenAt: string
  providers: string[]
  matchedKeywords: string[]
  status: string
  remotePolicyStatus: string | null
  classificationVisible: boolean
  locationFit: {
    label: string
    details?: string[]
    uncertain: boolean
  }
  typeFit: {
    label: 'Fully remote' | 'Remote, occasional presence' | 'Uncertain'
    uncertain: boolean
  }
  reasonCodes: string[]
}

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000
const RECENCY_WINDOW_MS = 168 * 60 * 60 * 1000
const UNDATED_AGE_FLOOR_MS = 48 * 60 * 60 * 1000
const JOB_BOARD_STORAGE_KEY = 'astir.v1.jobBoard'

// "New" means posted at the source within the last 48h. Listings without a
// provider posting date get no label (we don't fall back to when we pulled it in).
function isFresh(listing: Listing): boolean {
  if (!listing.postedAt) return false
  return Date.now() - new Date(listing.postedAt).getTime() < NEW_WINDOW_MS
}

function effectiveAgeMs(listing: Listing): number {
  const date = new Date(listing.postedAt ?? listing.firstSeenAt).getTime()
  const age = Math.max(0, Date.now() - date)
  return listing.postedAt ? age : Math.max(UNDATED_AGE_FLOOR_MS, age)
}

function isMostRecent(listing: Listing): boolean {
  return effectiveAgeMs(listing) <= RECENCY_WINDOW_MS
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchesCompanySearch(listing: Listing, query: string): boolean {
  const terms = query.split(/\s+/).filter(Boolean)
  const words = normalizeSearch(listing.companyName).split(/\s+/).filter(Boolean)
  return terms.every((term) => words.some((word) => word.startsWith(term)))
}

function formatRegionList(regions: string[] | null): string {
  if (regions === null) {
    return 'your selected countries'
  }
  if (regions.length === 0) {
    return 'Europe'
  }
  const normalized = regions.map((region) => (region === 'EU' ? 'the EU' : region))
  if (normalized.length === 1) {
    return normalized[0]
  }
  if (normalized.length === 2) {
    return `${normalized[0]} or ${normalized[1]}`
  }
  return `${normalized.slice(0, -1).join(', ')} or ${normalized[normalized.length - 1]}`
}

function relativeDate(value: string | null | undefined): string {
  if (!value) return ''
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return ''
  const ageMs = Math.max(0, Date.now() - time)
  const hourMs = 60 * 60 * 1000
  const dayMs = 24 * hourMs
  if (ageMs < hourMs) return 'today'
  if (ageMs < dayMs) {
    const hours = Math.max(1, Math.floor(ageMs / hourMs))
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  const days = Math.floor(ageMs / dayMs)
  if (days === 0) return 'today'
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function MetaLine({ listing }: { listing: Listing }) {
  const locationDetails = listing.locationFit.details ?? []
  const primaryLocation = locationDetails[0] ?? listing.locationFit.label
  const extraLocationCount = Math.max(0, locationDetails.length - 1)
  const hiddenLocations = locationDetails.slice(1).join(', ')
  const dateLabel = listing.postedAt ? 'Posted:' : 'Appeared:'
  const dateValue = relativeDate(listing.postedAt ?? listing.firstSeenAt)
  return (
    <div className="role-loc">
      <span className="meta-key">Company:</span>{' '}
      <span className="meta-value">{listing.companyName}</span>
      <span className="meta-separator"> · </span>
      <span className="meta-key">Location:</span>{' '}
      <span
        className={listing.locationFit.uncertain ? 'meta-value meta-value-uncertain' : 'meta-value'}
        data-tooltip={
          listing.locationFit.uncertain
            ? 'Astir was unable to confirm hiring location. Please review the job description.'
            : undefined
        }
      >
        {primaryLocation}
        {extraLocationCount > 0 ? (
          <span className="more-cities" data-tooltip={`Also posted in ${hiddenLocations}.`}>
            +{extraLocationCount}
          </span>
        ) : null}
      </span>
      <span className="meta-separator"> · </span>
      <span className="meta-key">Type:</span>{' '}
      <span
        className={listing.typeFit.uncertain ? 'meta-value meta-value-uncertain' : 'meta-value'}
        data-tooltip={
          listing.typeFit.label === 'Remote, occasional presence'
            ? 'This role is remote, but occasional presence, like an offsite, is mentioned in the description.'
            : listing.typeFit.uncertain
              ? 'Astir was unable to confirm whether this role is fully remote. Please review the job description.'
              : undefined
        }
      >
        {listing.typeFit.label}
      </span>
      <span className="meta-separator"> · </span>
      <span
        className={listing.postedAt ? 'meta-key' : 'meta-key meta-value-uncertain'}
        data-tooltip={
          listing.postedAt
            ? undefined
            : 'Astir only knows when this role first appeared on the board.'
        }
      >
        {dateLabel}
      </span>{' '}
      <span className="meta-value">{dateValue}</span>
      {listing.contentLanguage ? (
        <>
          <span className="meta-separator"> · </span>
          <span className="meta-key">Language:</span>{' '}
          <span className="meta-value">{listing.contentLanguage.toUpperCase()}</span>
        </>
      ) : null}
    </div>
  )
}

function sortListings(listings: Listing[]): Listing[] {
  return [...listings].sort((a, b) => effectiveAgeMs(a) - effectiveAgeMs(b))
}

function ListingSection({
  title,
  icon = 'calendar',
  listings,
  emptyCopy,
  onLog,
  onSetStatus,
  showDiagnostics,
}: {
  title: string
  icon?: 'calendar' | 'flame'
  listings: Listing[]
  emptyCopy?: string
  onLog: (listing: Listing) => void
  onSetStatus: (listing: Listing, status: ListingStatus) => void
  showDiagnostics: boolean
}) {
  return (
    <section className="board-section" aria-label={title}>
      <div className="board-section-head">
        <span className="board-section-icon" aria-hidden="true">
          {icon === 'flame' ? <FlameIcon /> : <CalendarIcon />}
        </span>
        <span>{title}</span>
      </div>
      {listings.length > 0 ? (
        <article className="watch-group board-feed">
          {listings.map((listing) => (
            <ListingRow
              listing={listing}
              key={listing.id}
              onLog={onLog}
              onSetStatus={onSetStatus}
              showDiagnostics={showDiagnostics}
            />
          ))}
        </article>
      ) : emptyCopy ? (
        <p className="board-empty">{emptyCopy}</p>
      ) : null}
    </section>
  )
}

function SearchResults({
  listings,
  onLog,
  onSetStatus,
  showDiagnostics,
}: {
  listings: Listing[]
  onLog: (listing: Listing) => void
  onSetStatus: (listing: Listing, status: ListingStatus) => void
  showDiagnostics: boolean
}) {
  if (listings.length === 0) {
    return <p className="board-empty">No matching roles right now.</p>
  }
  return (
    <article className="watch-group board-feed">
      {listings.map((listing) => (
        <ListingRow
          listing={listing}
          key={listing.id}
          onLog={onLog}
          onSetStatus={onSetStatus}
          showDiagnostics={showDiagnostics}
        />
      ))}
    </article>
  )
}

function readableReason(reason: string): string {
  if (reason.startsWith('country:')) return reason.replace('country:', 'Country:')
  if (reason.startsWith('cluster:')) return reason.replace('cluster:', 'Region cluster:')
  if (reason.startsWith('no location stated')) return 'No location stated, assuming Europe'
  if (reason.startsWith('also names non-European location')) {
    return reason.replace('also names non-European location(s):', 'Also names non-European:')
  }
  const labels: Record<string, string> = {
    'worldwide/global': 'Worldwide or global wording',
    'Europe/EMEA': 'Europe or EMEA wording',
    'EU': 'EU wording',
    'EEA/Schengen': 'EEA or Schengen wording',
    'location present but not recognized': 'Location not recognized',
    'description missing': 'Description missing',
    'description mentions regular presence': 'Description mentions regular presence',
    'description mentions occasional presence': 'Description mentions occasional presence',
    'description mentions fully remote': 'Description mentions fully remote',
    'description location clues': 'Description has location clues',
    'description review clues': 'Description has review clues',
    'regular presence required': 'Regular presence required',
    'restricted outside Europe': 'Restricted outside Europe',
    'outside selected countries': 'Outside selected countries',
    'non-European tag with review clue': 'Non-European tag with review clue',
    'company remote policy marked uncertain': 'Company remote policy marked uncertain',
  }
  return labels[reason] ?? reason
}

function AdminDiagnosticsMenuSection({
  listing,
  reviewOnly,
}: {
  listing: Listing
  reviewOnly: boolean
}) {
  if (!listing.reasonCodes.length) return null
  const uniqueReasons = [...new Set(listing.reasonCodes.map(readableReason))]
  return (
    <div className="role-qa-note" role="note" aria-label="QA notes">
      <span className="role-qa-title">{reviewOnly ? 'Not applicable QA' : 'QA notes'}</span>
      {uniqueReasons.map((reason) => (
        <span className="role-qa-reason" key={reason}>
          {reason}
        </span>
      ))}
    </div>
  )
}

function ListingRow({
  listing,
  onLog,
  onSetStatus,
  reviewOnly = false,
  showDiagnostics = false,
}: {
  listing: Listing
  onLog: (listing: Listing) => void
  onSetStatus: (listing: Listing, status: ListingStatus) => void
  reviewOnly?: boolean
  showDiagnostics?: boolean
}) {
  const isIrrelevant = listing.status === 'irrelevant'
  const opensFoldedPosting = (listing.locationFit.details?.length ?? 0) > 1
  const hasDiagnostics = showDiagnostics && listing.reasonCodes.length > 0
  return (
    <div className="watch-role">
      <div className="role-main">
        <div className="role-title-line">
          <span className="role-name" title={listing.title}>
            {listing.title}
          </span>
          <a
            className="round-icon small"
            href={listing.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open posting"
            data-tooltip={
              opensFoldedPosting
                ? 'Opens one posting. Other locations may have separate links.'
                : 'Open posting'
            }
          >
            <OpenIcon />
          </a>
          {isFresh(listing) ? <span className="role-new-chip">New</span> : null}
        </div>
        <MetaLine listing={listing} />
        {listing.providers.includes('adzuna') ? (
          // Adzuna's terms require attribution wherever its listings appear.
          <div className="role-attribution">
            <a href="https://www.adzuna.com/" target="_blank" rel="noreferrer">
              Jobs by Adzuna
            </a>
          </div>
        ) : null}
      </div>
      {!reviewOnly ? (
        <>
          <button
            className="round-icon add-application"
            type="button"
            aria-label="Log application"
            data-tooltip="Log application"
            onClick={() => onLog(listing)}
          >
            <PlusIcon />
          </button>
          <KebabMenu menuClassName="board-menu">
            {isIrrelevant ? (
              <button type="button" onClick={() => onSetStatus(listing, 'new')}>
                Back to relevant
              </button>
            ) : (
              <button type="button" onClick={() => onSetStatus(listing, 'irrelevant')}>
                Mark as irrelevant
              </button>
            )}
            {hasDiagnostics ? (
              <AdminDiagnosticsMenuSection listing={listing} reviewOnly={reviewOnly} />
            ) : null}
          </KebabMenu>
        </>
      ) : hasDiagnostics ? (
        <KebabMenu menuClassName="board-menu">
          <AdminDiagnosticsMenuSection listing={listing} reviewOnly={reviewOnly} />
        </KebabMenu>
      ) : null}
    </div>
  )
}

// `initialListings` is whatever the page already fetched during server
// rendering, or null when it could not. Seeding from it means a reload arrives
// with the openings on screen rather than "Gathering openings…", and the browser
// fetch below is skipped as redundant.
export function RemoteJobBoardView({
  initialListings = null,
}: {
  initialListings?: Listing[] | null
}) {
  const user = useUser()
  const [listings, setListings] = useState<Listing[] | null>(initialListings)
  const [notApplicableListings, setNotApplicableListings] = useState<Listing[] | null>(null)
  const [mode, setMode] = useState<'board' | 'not-applicable'>('board')
  const [failed, setFailed] = useState(false)
  const [quietOpen, setQuietOpen] = useState(false)
  const [olderOpen, setOlderOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hiringRegions, setHiringRegions] = useState<string[] | null>(null)
  const [logging, setLogging] = useState<LogApplicationInitial | null>(null)
  const { message: snack, showSnack } = useSnackbar()

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(JOB_BOARD_STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as { olderOpen?: boolean }
      setOlderOpen(parsed.olderOpen === true)
    } catch {
      setOlderOpen(false)
    }
  }, [])

  useEffect(() => {
    if (initialListings !== null) return
    let cancelled = false
    fetch('/api/remote-job-board/listings')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Listings request failed: ${response.status}`)
        }
        return (await response.json()) as Listing[]
      })
      .then((data) => {
        if (!cancelled) {
          setListings(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [initialListings])

  useEffect(() => {
    if (!user.isAdmin || mode !== 'not-applicable' || notApplicableListings !== null) return
    let cancelled = false
    fetch('/api/remote-job-board/not-applicable-listings')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Listings request failed: ${response.status}`)
        }
        return (await response.json()) as Listing[]
      })
      .then((data) => {
        if (!cancelled) {
          setNotApplicableListings(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [mode, notApplicableListings, user.isAdmin])

  useEffect(() => {
    let cancelled = false
    fetch('/api/users/me/watchlist-preferences')
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as WatchlistPreferences
      })
      .then((preferences) => {
        if (!cancelled && preferences) {
          setHiringRegions(preferences.hiringRegions)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHiringRegions(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = useMemo(() => sortListings(listings ?? []), [listings])
  const sortedNotApplicable = useMemo(
    () => sortListings(notApplicableListings ?? []),
    [notApplicableListings],
  )
  const showQaNotes = user.email === 'bartel.katarzyna@gmail.com'
  const relevant = useMemo(() => sorted.filter((listing) => listing.status !== 'irrelevant'), [sorted])
  const irrelevant = useMemo(() => sorted.filter((listing) => listing.status === 'irrelevant'), [sorted])
  const searchQuery = normalizeSearch(search.trim())
  const searching = searchQuery.length > 0
  const searchResults = useMemo(
    () => (searchQuery ? relevant.filter((listing) => matchesCompanySearch(listing, searchQuery)) : []),
    [relevant, searchQuery],
  )
  const mostRecent = useMemo(
    () => relevant.filter((listing) => isMostRecent(listing)),
    [relevant],
  )
  const older = useMemo(
    () => relevant.filter((listing) => !isMostRecent(listing)),
    [relevant],
  )
  const reviewMode = mode === 'not-applicable'
  const loading = reviewMode ? notApplicableListings === null : listings === null

  // Mark a listing irrelevant (it drops to the quiet section below) or bring it
  // back to the main feed. Optimistic: flip the local status first, then PATCH;
  // revert if the request fails. The listing is never deleted either way.
  async function setListingStatus(listing: Listing, status: ListingStatus) {
    const previous = listing.status
    if (previous === status) return
    setListings((prev) =>
      prev?.map((item) => (item.id === listing.id ? { ...item, status } : item)) ?? prev,
    )
    try {
      const response = await fetch(`/api/remote-job-board/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        throw new Error(`Update failed: ${response.status}`)
      }
      showSnack(
        status === 'irrelevant'
          ? { text: 'Marked irrelevant. Find it below your main list.' }
          : { text: 'Back in your main list.' },
        4000,
      )
    } catch {
      setListings((prev) =>
        prev?.map((item) => (item.id === listing.id ? { ...item, status: previous } : item)) ?? prev,
      )
      showSnack({ text: 'Could not update that listing. Try again.' }, 4000)
    }
  }

  function openLog(listing: Listing) {
    setLogging({
      listingId: listing.id,
      company: listing.companyName,
      role: listing.title,
      link: listing.url,
      status: STAGE_IDS.applied,
    })
  }

  function clearSearch() {
    setSearch('')
  }

  function toggleOlder() {
    setOlderOpen((open) => {
      const next = !open
      try {
        const stored = window.localStorage.getItem(JOB_BOARD_STORAGE_KEY)
        const parsed = stored ? (JSON.parse(stored) as Record<string, unknown>) : {}
        window.localStorage.setItem(
          JOB_BOARD_STORAGE_KEY,
          JSON.stringify({ ...parsed, olderOpen: next }),
        )
      } catch {
        // The saved preference is only a convenience.
      }
      return next
    })
  }

  // Logging an application removes the listing from the board and points the
  // user on to wherever it was saved.
  function onLogged(application: Application, listingId: string | null) {
    if (listingId) {
      setListings((prev) => prev?.filter((listing) => listing.id !== listingId) ?? prev)
    }
    showSnack(
      isPipelineStatus(application.status)
        ? { text: 'Logged. You can see it in pipeline.', linkText: 'pipeline', href: '/pipeline' }
        : {
            text: 'Logged. Find it in all applications.',
            linkText: 'all applications',
            href: '/applications',
          },
      5000,
    )
  }

  return (
    <section className="screen" data-screen="remote-job-board">
      <div className="board-hero">
        <div className="job-board-title-wrap">
          <h1>Job board</h1>
          {user.isAdmin ? (
            <KebabMenu menuClassName="board-menu">
              <button type="button" onClick={() => setMode('board')}>
                Current board
              </button>
              <button type="button" onClick={() => setMode('not-applicable')}>
                Not applicable jobs
              </button>
            </KebabMenu>
          ) : null}
        </div>
        {!reviewMode ? (
          <label className="board-search">
            <span className="board-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              type="text"
              role="searchbox"
              value={search}
              placeholder="Company"
              aria-label="Search companies"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  clearSearch()
                }
              }}
            />
          </label>
        ) : null}
        <p className="board-intro">
          Remote roles hiring in {formatRegionList(hiringRegions)}.{' '}
          <Link href="/preferences/watchlist">Change preferences</Link> to limit or broaden your
          search. Postings stay on the board for ninety days.
        </p>
      </div>
      <div className="watchlist">
        {failed ? (
          <p className="watch-invite">The remote board is paused for a moment. Try again soon.</p>
        ) : loading ? (
          <p className="watch-invite">Gathering remote openings…</p>
        ) : reviewMode ? (
          sortedNotApplicable.length === 0 ? (
            <p className="watch-invite">No hidden roles to review right now.</p>
          ) : (
            <article className="watch-group board-feed">
              {sortedNotApplicable.map((listing) => (
                <ListingRow
                  listing={listing}
                  key={listing.id}
                  onLog={openLog}
                  onSetStatus={setListingStatus}
                  reviewOnly
                  showDiagnostics={showQaNotes}
                />
              ))}
            </article>
          )
        ) : sorted.length === 0 ? (
          <p className="watch-invite">
            No remote roles matching your keywords yet. New openings appear here as the curated
            companies are checked.
          </p>
        ) : (
          <>
            {searching ? (
              <SearchResults
                listings={searchResults}
                onLog={openLog}
                onSetStatus={setListingStatus}
                showDiagnostics={showQaNotes}
              />
            ) : (
              <>
                <ListingSection
                  title="Most recent"
                  icon="flame"
                  listings={mostRecent}
                  emptyCopy="No recent roles matching your keywords right now."
                  onLog={openLog}
                  onSetStatus={setListingStatus}
                  showDiagnostics={showQaNotes}
                />
                {older.length > 0 ? (
                  <div className={olderOpen ? 'quiet-section open' : 'quiet-section'}>
                    <button
                      type="button"
                      className="quiet-toggle"
                      aria-expanded={olderOpen}
                      onClick={toggleOlder}
                    >
                      <span className="quiet-chevron" aria-hidden="true">
                        <ChevronDownIcon />
                      </span>
                      Older
                    </button>
                    {olderOpen ? (
                      <ListingSection
                        title="Older"
                        listings={older}
                        onLog={openLog}
                        onSetStatus={setListingStatus}
                        showDiagnostics={showQaNotes}
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
            {!searching && irrelevant.length > 0 ? (
              <div className="quiet-section">
                <button
                  type="button"
                  className="quiet-toggle"
                  aria-expanded={quietOpen}
                  onClick={() => setQuietOpen((open) => !open)}
                >
                  Marked irrelevant
                </button>
                {quietOpen ? (
                  <article className="watch-group board-feed">
                    {irrelevant.map((listing) => (
                      <ListingRow
                        listing={listing}
                        key={listing.id}
                        onLog={openLog}
                        onSetStatus={setListingStatus}
                        showDiagnostics={showQaNotes}
                      />
                    ))}
                  </article>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
      {logging ? (
        <LogApplicationModal
          initial={logging}
          fromJobBoard
          onClose={() => setLogging(null)}
          onSaved={(application) => onLogged(application, logging.listingId ?? null)}
        />
      ) : null}
      <Snackbar message={snack} />
    </section>
  )
}
