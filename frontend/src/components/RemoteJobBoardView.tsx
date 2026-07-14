'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Application } from '@/lib/applications'
import { formatPostedDate, isPipelineStatus } from '@/lib/applications'
import { KebabMenu } from './applications/KebabMenu'
import { LogApplicationModal, type LogApplicationInitial } from './applications/LogApplicationModal'
import { Snackbar, useSnackbar } from './applications/useSnackbar'
import { OpenIcon, PlusIcon } from './icons'

type ListingStatus = 'new' | 'irrelevant'

// Shape of GET /api/remote-job-board/listings (JobBoardListing on the backend).
type Listing = {
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
}

type SortKey = 'newest' | 'discovered' | 'company'

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'discovered', label: 'Recently added' },
  { key: 'company', label: 'Company' },
]

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000

// "New" means posted at the source within the last 48h. Listings without a
// provider posting date get no label (we don't fall back to when we pulled it in).
function isFresh(listing: Listing): boolean {
  if (!listing.postedAt) return false
  return Date.now() - new Date(listing.postedAt).getTime() < NEW_WINDOW_MS
}

// "Newest" means the provider's posting date when it exists, falling back to
// when we first saw the listing.
function listedAt(listing: Listing): number {
  return new Date(listing.postedAt ?? listing.firstSeenAt).getTime()
}

// The same role posted across regions is folded into one row: show the primary
// location with a "+N" chip for the rest. Providers deliver extras either as
// separate array entries or a ";"-joined string, so flatten both.
function locationParts(listing: Listing): string[] {
  const raw = listing.locations.length > 0 ? listing.locations : listing.location ? [listing.location] : []
  return raw
    .flatMap((value) => value.split(';'))
    .map((value) => value.trim())
    .filter(Boolean)
}

function MetaLine({ listing }: { listing: Listing }) {
  const parts = locationParts(listing)
  const primary = parts[0] ?? null
  const extra = Math.max(0, parts.length - 1)
  return (
    <div className="role-loc">
      {listing.companyName}
      {primary ? (
        <>
          {' · '}
          {primary}
          {extra > 0 ? <span className="more-cities">+{extra}</span> : null}
        </>
      ) : null}
      {/* A single-location row can show its work mode; when several regions are
          folded the modes vary, so we drop it (mirrors the Watchlist). */}
      {extra === 0 && listing.workMode ? ` · ${listing.workMode}` : null}
      {listing.contentLanguage ? ` · ${listing.contentLanguage.toUpperCase()}` : null}
    </div>
  )
}

function sortListings(listings: Listing[], sort: SortKey): Listing[] {
  const sorted = [...listings]
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => listedAt(b) - listedAt(a))
    case 'discovered':
      return sorted.sort(
        (a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime(),
      )
    case 'company':
      return sorted.sort(
        (a, b) => a.companyName.localeCompare(b.companyName) || listedAt(b) - listedAt(a),
      )
  }
}

function ListingRow({
  listing,
  onLog,
  onSetStatus,
}: {
  listing: Listing
  onLog: (listing: Listing) => void
  onSetStatus: (listing: Listing, status: ListingStatus) => void
}) {
  const isIrrelevant = listing.status === 'irrelevant'
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
            data-tooltip="Open posting"
          >
            <OpenIcon />
          </a>
          {isFresh(listing) ? <span className="role-new-chip">New</span> : null}
        </div>
        <MetaLine listing={listing} />
        <div className="role-posted">Posted: {formatPostedDate(listing.postedAt)}</div>
        {listing.providers.includes('adzuna') ? (
          // Adzuna's terms require attribution wherever its listings appear.
          <div className="role-attribution">
            <a href="https://www.adzuna.com/" target="_blank" rel="noreferrer">
              Jobs by Adzuna
            </a>
          </div>
        ) : null}
      </div>
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
      </KebabMenu>
    </div>
  )
}

export function RemoteJobBoardView() {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [sort, setSort] = useState<SortKey>('newest')
  const [quietOpen, setQuietOpen] = useState(false)
  const [logging, setLogging] = useState<LogApplicationInitial | null>(null)
  const { message: snack, showSnack } = useSnackbar()

  useEffect(() => {
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
  }, [])

  const sorted = useMemo(() => sortListings(listings ?? [], sort), [listings, sort])
  const relevant = useMemo(() => sorted.filter((listing) => listing.status !== 'irrelevant'), [sorted])
  const irrelevant = useMemo(() => sorted.filter((listing) => listing.status === 'irrelevant'), [sorted])

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
      status: 'Applied',
    })
  }

  // Logging an application removes the listing from the board and points the
  // user on to wherever it landed.
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
      <div className="page-head">
        <h1>Job board</h1>
        <div className="option-toggles" role="group" aria-label="Sort listings">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`option-toggle${sort === option.key ? ' on' : ''}`}
              aria-pressed={sort === option.key}
              onClick={() => setSort(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="watchlist">
        {failed ? (
          <p className="watch-invite">The remote board is resting for a moment. Try again soon.</p>
        ) : listings === null ? (
          <p className="watch-invite">Gathering remote openings…</p>
        ) : sorted.length === 0 ? (
          <p className="watch-invite">
            No remote roles matching your keywords yet. New openings appear here as the curated
            companies are checked.
          </p>
        ) : (
          <>
            {relevant.length > 0 ? (
              <article className="watch-group board-feed">
                {relevant.map((listing) => (
                  <ListingRow
                    listing={listing}
                    key={listing.id}
                    onLog={openLog}
                    onSetStatus={setListingStatus}
                  />
                ))}
              </article>
            ) : (
              <p className="watch-invite">
                Nothing in your main list right now — everything below is marked irrelevant.
              </p>
            )}
            {irrelevant.length > 0 ? (
              <div className="quiet-section">
                <button
                  type="button"
                  className="quiet-toggle"
                  aria-expanded={quietOpen}
                  onClick={() => setQuietOpen((open) => !open)}
                >
                  {irrelevant.length === 1
                    ? '1 marked irrelevant'
                    : `${irrelevant.length} marked irrelevant`}
                </button>
                {quietOpen ? (
                  <article className="watch-group board-feed">
                    {irrelevant.map((listing) => (
                      <ListingRow
                        listing={listing}
                        key={listing.id}
                        onLog={openLog}
                        onSetStatus={setListingStatus}
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
