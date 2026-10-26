import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { UserSettableListingStatus } from '../job-boards/dto/update-listing.dto'
import { JobMatchingService } from '../job-boards/job-matching.service'
import { normalizeForIdentity } from '../job-boards/normalized-job'
import { FoldableOpening, foldOpenings } from '../job-boards/opening-folding'
import { DEFAULT_WATCHLIST_PREFERENCES } from '../users/watchlist-defaults'
import { classifyRemoteBoardListing } from './remote-board-classification'

const UNDATED_AGE_FLOOR_MS = 48 * 60 * 60 * 1000
const MAX_LISTING_AGE_DAYS = 90
const REMOTE_BOARD_PAGE_SIZE = 20
const FEED_CACHE_TTL_MS = 30 * 1000

// Like a JobBoardListing, but carries every location the folded opening is
// available in (the same role posted across regions is bundled into one row).
export type RemoteJobBoardListing = {
  id: string
  title: string
  companyName: string
  location: string | null
  locations: string[]
  workMode: string | null
  contentLanguage: string | null
  url: string
  postedAt: Date | null
  firstSeenAt: Date
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

export type RemoteJobBoardPage = {
  listings: RemoteJobBoardListing[]
  nextCursor: string | null
}

type CachedFeed = {
  expiresAt: number
  listings: RemoteJobBoardListing[]
}

type ListingSourceFreshness = {
  lastSeenAt: Date
  url?: string
  jobSourceId?: string | null
  jobSource: { lastSyncedAt: Date | null } | null
}

type RemoteBoardMatchableListing = {
  id: string
  title: string
  location: string | null
  locations: string[]
  workMode: string | null
}

function sourceStillCurrent(source: ListingSourceFreshness): boolean {
  return !source.jobSource?.lastSyncedAt || source.lastSeenAt >= source.jobSource.lastSyncedAt
}

export function applyRemotePolicyStatus(
  classification: ReturnType<typeof classifyRemoteBoardListing>,
  remotePolicyStatus: string | null | undefined,
): ReturnType<typeof classifyRemoteBoardListing> {
  if (remotePolicyStatus !== 'uncertain') {
    return classification
  }
  return {
    ...classification,
    type: { label: 'Uncertain', uncertain: true },
    reasonCodes: [...classification.reasonCodes, 'company remote policy marked uncertain'],
  }
}

export function preferredRemoteBoardUrl(
  fallbackUrl: string,
  sources: ListingSourceFreshness[],
  remoteSourceIds: Set<string>,
): string {
  return (
    sources.find((source) => source.jobSourceId && remoteSourceIds.has(source.jobSourceId))?.url ??
    fallbackUrl
  )
}

function isPlainRemoteLocation(location: string): boolean {
  return normalizeForIdentity(location) === 'remote'
}

export function toRemoteBoardMatchableListing(
  listing: RemoteBoardMatchableListing,
): RemoteBoardMatchableListing {
  const locations = listing.locations.length
    ? listing.locations
    : listing.location
      ? [listing.location]
      : []
  const onlyPlainRemote =
    locations.length > 0 &&
    locations.every(isPlainRemoteLocation) &&
    normalizeForIdentity(listing.workMode ?? '') === 'remote'

  if (!onlyPlainRemote) {
    return listing
  }

  return { ...listing, location: null, locations: [] }
}

// Serves the per-user Remote Job Board feed: openings from the global curated
// remote-company list, matched to the requesting user's keywords and forced to
// remote-only regardless of their work-mode preference (the board itself is
// the remote filter). Matches are computed on the fly from JobListing rather
// than persisted, so this list never touches the UserJobListing table the
// regular Job Board uses.
@Injectable()
export class RemoteJobBoardService {
  private readonly logger = new Logger(RemoteJobBoardService.name)
  private readonly feedCache = new Map<string, CachedFeed>()
  private readonly pendingFeeds = new Map<string, Promise<RemoteJobBoardListing[]>>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: JobMatchingService,
  ) {}

  async listForUser(userId: string): Promise<RemoteJobBoardListing[]> {
    return this.cachedFeedForUser(userId, true)
  }

  async listNotApplicableForUser(userId: string): Promise<RemoteJobBoardListing[]> {
    return this.cachedFeedForUser(userId, false)
  }

  async listPageForUser(userId: string, cursor?: string): Promise<RemoteJobBoardPage> {
    const offset = this.pageOffset(cursor)
    const listings = await this.cachedFeedForUser(userId, true)
    const page = listings.slice(offset, offset + REMOTE_BOARD_PAGE_SIZE)
    const nextOffset = offset + page.length
    return {
      listings: page,
      nextCursor: nextOffset < listings.length ? String(nextOffset) : null,
    }
  }

  private async listForUserByClassification(
    userId: string,
    visible: boolean,
  ): Promise<RemoteJobBoardListing[]> {
    const startedAt = Date.now()
    const remoteCompanies = await this.remoteCompanySources()
    const sourcesLoadedAt = Date.now()
    const sourceIds = remoteCompanies.map((company) => company.jobSourceId)
    if (!sourceIds.length) {
      this.logger.log(
        `Remote board ${visible ? 'visible' : 'hidden'} list finished in ${Date.now() - startedAt}ms: no curated sources`,
      )
      return []
    }
    const remotePolicyBySourceId = new Map(
      remoteCompanies.map((company) => [company.jobSourceId, company.remotePolicyStatus]),
    )

    // Match lightweight fields first so unrelated descriptions and source
    // relations never need to leave the database.
    const [matchableListings, preferences, appliedListingIds, irrelevantIds] =
      await Promise.all([
        this.prisma.jobListing.findMany({
          where: {
            sources: { some: { jobSourceId: { in: sourceIds } } },
            OR: [{ postedAt: null }, { postedAt: { gte: this.listingAgeCutoff() } }],
          },
          select: { id: true, title: true, location: true, locations: true, workMode: true },
        }),
        this.matchingPreferences(userId),
        this.appliedListingIds(userId),
        this.irrelevantListingIds(userId),
      ])
    const queryLoadedAt = Date.now()

    // Keyword + region matching, but pin work mode to remote so the board is
    // genuinely remote even for a user who normally filters to onsite/hybrid.
    const matches = new Map(
      this.matching
        .computeMatches(
          { ...preferences, hiringRegions: [] },
          matchableListings.map(toRemoteBoardMatchableListing),
        )
        .map((match) => [match.listingId, match.matchedKeywords]),
    )
    const matchedAt = Date.now()

    const listings = matches.size
      ? await this.prisma.jobListing.findMany({
          where: {
            id: { in: [...matches.keys()] },
            sources: { some: { jobSourceId: { in: sourceIds } } },
            OR: [{ postedAt: null }, { postedAt: { gte: this.listingAgeCutoff() } }],
          },
          select: {
            id: true,
            title: true,
            companyName: true,
            location: true,
            locations: true,
            workMode: true,
            descriptionText: true,
            contentLanguage: true,
            url: true,
            postedAt: true,
            firstSeenAt: true,
            sources: {
              select: {
                provider: true,
                jobSourceId: true,
                url: true,
                lastSeenAt: true,
                jobSource: { select: { lastSyncedAt: true } },
              },
            },
          },
        })
      : []
    const detailsLoadedAt = Date.now()
    const remoteSourceIds = new Set(sourceIds)

    // Candidate postings, before folding: matched and classified as plausible
    // for the board. Watched companies still stay visible here. Applied ones
    // are dropped by foldOpenings at the group level, so the same role applied
    // to in one region disappears entirely, matching the Watchlist's behaviour.
    const candidates: FoldableOpening[] = listings
      .filter((listing) => {
        if (!matches.has(listing.id) || !listing.sources.some(sourceStillCurrent)) {
          return false
        }
        const remotePolicyStatus = listing.sources
          .map((source) => remotePolicyBySourceId.get(source.jobSourceId ?? ''))
          .find((status) => status === 'uncertain')
        return applyRemotePolicyStatus(
          classifyRemoteBoardListing(listing, preferences.hiringRegions),
          remotePolicyStatus,
        ).visible === visible
      })
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        companyName: listing.companyName,
        url: preferredRemoteBoardUrl(listing.url, listing.sources, remoteSourceIds),
        location: listing.location,
        locations: listing.locations,
        workMode: listing.workMode,
        contentLanguage: listing.contentLanguage,
        descriptionText: listing.descriptionText,
        remotePolicyStatus:
          listing.sources
            .map((source) => remotePolicyBySourceId.get(source.jobSourceId ?? ''))
            .find((status) => status === 'uncertain') ?? null,
        postedAt: listing.postedAt,
        firstSeenAt: listing.firstSeenAt,
        matchedKeywords: matches.get(listing.id) ?? [],
        providers: [...new Set(listing.sources.map((source) => source.provider))],
      }))
    const classifiedAt = Date.now()

    const result = foldOpenings(candidates, preferences.hiringRegions, appliedListingIds)
      .map((opening) => {
        const classification = applyRemotePolicyStatus(
          classifyRemoteBoardListing(opening, preferences.hiringRegions),
          opening.remotePolicyStatus,
        )
        return {
          id: opening.id,
          title: opening.title,
          companyName: opening.companyName,
          location: opening.location,
          locations: opening.locations,
          workMode: opening.workMode,
          contentLanguage: opening.contentLanguage,
          url: opening.url,
          postedAt: opening.postedAt,
          firstSeenAt: opening.firstSeenAt,
          providers: opening.providers ?? [],
          matchedKeywords: opening.matchedKeywords,
          remotePolicyStatus: opening.remotePolicyStatus ?? null,
          // Folded openings are keyed by a representative posting id; a user who
          // marked that row irrelevant sees it tucked into the quiet section.
          status: irrelevantIds.has(opening.id) ? 'irrelevant' : 'new',
          classificationVisible: classification.visible,
          locationFit: classification.location,
          typeFit: classification.type,
          reasonCodes: classification.reasonCodes,
        }
      })
      .sort((a, b) => this.effectiveAgeMs(a) - this.effectiveAgeMs(b))
    const finishedAt = Date.now()
    this.logger.log(
      `Remote board ${visible ? 'visible' : 'hidden'} list finished in ${finishedAt - startedAt}ms ` +
        `(sources ${sourcesLoadedAt - startedAt}ms, query ${queryLoadedAt - sourcesLoadedAt}ms, ` +
        `matching ${matchedAt - queryLoadedAt}ms, details ${detailsLoadedAt - matchedAt}ms, ` +
        `classification ${classifiedAt - detailsLoadedAt}ms, ` +
        `folding ${finishedAt - classifiedAt}ms, listings ${matchableListings.length}, ` +
        `details ${listings.length}, candidates ${candidates.length}, ` +
        `returned ${result.length})`,
    )
    return result
  }

  // Mark a remote-board listing irrelevant (drops it into the quiet section) or
  // bring it back ({ status: 'new' }). The Remote Job Board computes its feed on
  // the fly, so unlike the regular board there is no pre-seeded UserJobListing
  // row, so we upsert one. Remote-company listings never appear on the regular Job
  // Board (it filters them out), so these rows can't leak across boards. A stale
  // click on an id that no longer exists is a no-op rather than a 500.
  async setStatus(
    userId: string,
    listingId: string,
    status: UserSettableListingStatus,
  ): Promise<void> {
    const listing = await this.prisma.jobListing.findUnique({
      where: { id: listingId },
      select: { id: true },
    })
    if (!listing) {
      return
    }
    await this.prisma.userJobListing.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId, status },
      update: { status },
    })
    this.clearCachedFeeds(userId)
  }

  private async cachedFeedForUser(
    userId: string,
    visible: boolean,
  ): Promise<RemoteJobBoardListing[]> {
    const key = `${userId}:${visible ? 'visible' : 'hidden'}`
    const now = Date.now()
    const cached = this.feedCache.get(key)
    if (cached && cached.expiresAt > now) {
      return cached.listings
    }

    const pending = this.pendingFeeds.get(key)
    if (pending) {
      return pending
    }

    const request = this.listForUserByClassification(userId, visible)
      .then((listings) => {
        this.feedCache.set(key, { listings, expiresAt: Date.now() + FEED_CACHE_TTL_MS })
        return listings
      })
      .finally(() => {
        this.pendingFeeds.delete(key)
      })
    this.pendingFeeds.set(key, request)
    return request
  }

  private clearCachedFeeds(userId: string): void {
    this.feedCache.delete(`${userId}:visible`)
    this.feedCache.delete(`${userId}:hidden`)
  }

  private listingAgeCutoff(): Date {
    return new Date(Date.now() - MAX_LISTING_AGE_DAYS * 24 * 60 * 60 * 1000)
  }

  private pageOffset(cursor: string | undefined): number {
    if (!cursor || !/^\d+$/.test(cursor)) {
      return 0
    }
    const offset = Number(cursor)
    return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0
  }

  private effectiveAgeMs(listing: RemoteJobBoardListing): number {
    const date = (listing.postedAt ?? listing.firstSeenAt).getTime()
    const age = Math.max(0, Date.now() - date)
    return listing.postedAt ? age : Math.max(UNDATED_AGE_FLOOR_MS, age)
  }

  private async irrelevantListingIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userJobListing.findMany({
      where: { userId, status: 'irrelevant' },
      select: { listingId: true },
    })
    return new Set(rows.map((row) => row.listingId))
  }

  private async remoteCompanySources(): Promise<
    { jobSourceId: string; remotePolicyStatus: string }[]
  > {
    const rows = await this.prisma.remoteCompany.findMany({
      where: { jobSourceId: { not: null } },
      select: { jobSourceId: true, remotePolicyStatus: true },
    })
    const bySourceId = new Map<string, { jobSourceId: string; remotePolicyStatus: string }>()
    for (const row of rows) {
      if (row.jobSourceId) {
        bySourceId.set(row.jobSourceId, {
          jobSourceId: row.jobSourceId,
          remotePolicyStatus: row.remotePolicyStatus,
        })
      }
    }
    return [...bySourceId.values()]
  }

  private async matchingPreferences(userId: string) {
    const saved = await this.prisma.watchlistPreferences.findUnique({ where: { userId } })
    const base = saved ?? DEFAULT_WATCHLIST_PREFERENCES
    return {
      keywords: base.keywords,
      excludedKeywords: base.excludedKeywords,
      hiringRegions: base.hiringRegions,
      // The board is remote-only by definition; override whatever the user's
      // saved work-mode preference is.
      workModes: ['Remote'],
    }
  }

  private async appliedListingIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.application.findMany({
      where: { userId, listingId: { not: null } },
      select: { listingId: true },
    })
    return new Set(rows.map((row) => row.listingId).filter((id): id is string => id !== null))
  }
}
