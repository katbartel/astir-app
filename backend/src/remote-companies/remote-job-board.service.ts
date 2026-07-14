import { Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { UserSettableListingStatus } from '../job-boards/dto/update-listing.dto'
import { JobMatchingService } from '../job-boards/job-matching.service'
import { companyKey } from '../job-boards/normalized-job'
import { FoldableOpening, foldOpenings } from '../job-boards/opening-folding'
import { DEFAULT_WATCHLIST_PREFERENCES } from '../users/watchlist-defaults'

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
}

// Postings older than this drop off the board — same rationale and window as
// the regular Job Boards feed.
const MAX_LISTING_AGE_DAYS = 90

// Serves the per-user Remote Job Board feed: openings from the global curated
// remote-company list, matched to the requesting user's keywords and forced to
// remote-only regardless of their work-mode preference (the board itself is
// the remote filter). Matches are computed on the fly from JobListing rather
// than persisted, so this list never touches the UserJobListing table the
// regular Job Board uses.
@Injectable()
export class RemoteJobBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: JobMatchingService,
  ) {}

  async listForUser(userId: string): Promise<RemoteJobBoardListing[]> {
    const sourceIds = await this.remoteCompanySourceIds()
    if (!sourceIds.length) {
      return []
    }

    const cutoff = new Date(Date.now() - MAX_LISTING_AGE_DAYS * 24 * 60 * 60 * 1000)
    const [listings, preferences, watchlistKeys, appliedListingIds, irrelevantIds] =
      await Promise.all([
        this.prisma.jobListing.findMany({
          where: {
            sources: { some: { jobSourceId: { in: sourceIds } } },
            OR: [{ postedAt: null }, { postedAt: { gte: cutoff } }],
          },
          include: { sources: { select: { provider: true } } },
        }),
        this.matchingPreferences(userId),
        this.watchlistCompanyKeys(userId),
        this.appliedListingIds(userId),
        this.irrelevantListingIds(userId),
      ])

    // Keyword + region matching, but pin work mode to remote so the board is
    // genuinely remote even for a user who normally filters to onsite/hybrid.
    const matches = new Map(
      this.matching
        .computeMatches(preferences, listings)
        .map((match) => [match.listingId, match.matchedKeywords]),
    )

    // Candidate postings, before folding: matched, and not on the user's own
    // watchlist (that takes precedence). Applied ones are dropped by foldOpenings
    // at the group level, so the same role applied to in one region disappears
    // entirely — matching the Watchlist's behaviour.
    const candidates: FoldableOpening[] = listings
      .filter(
        (listing) =>
          matches.has(listing.id) && !watchlistKeys.has(companyKey(listing.companyName)),
      )
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        companyName: listing.companyName,
        url: listing.url,
        location: listing.location,
        locations: listing.locations,
        workMode: listing.workMode,
        contentLanguage: listing.contentLanguage,
        postedAt: listing.postedAt,
        firstSeenAt: listing.firstSeenAt,
        matchedKeywords: matches.get(listing.id) ?? [],
        providers: [...new Set(listing.sources.map((source) => source.provider))],
      }))

    return foldOpenings(candidates, preferences.hiringRegions, appliedListingIds)
      .map((opening) => ({
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
        // Folded openings are keyed by a representative posting id; a user who
        // marked that row irrelevant sees it tucked into the quiet section.
        status: irrelevantIds.has(opening.id) ? 'irrelevant' : 'new',
      }))
      .sort((a, b) => this.effectiveDate(b) - this.effectiveDate(a))
  }

  // Mark a remote-board listing irrelevant (drops it into the quiet section) or
  // bring it back ({ status: 'new' }). The Remote Job Board computes its feed on
  // the fly, so unlike the regular board there is no pre-seeded UserJobListing
  // row — we upsert one. Remote-company listings never appear on the regular Job
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
  }

  private effectiveDate(listing: RemoteJobBoardListing): number {
    return (listing.postedAt ?? listing.firstSeenAt).getTime()
  }

  private async irrelevantListingIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userJobListing.findMany({
      where: { userId, status: 'irrelevant' },
      select: { listingId: true },
    })
    return new Set(rows.map((row) => row.listingId))
  }

  private async remoteCompanySourceIds(): Promise<string[]> {
    const rows = await this.prisma.remoteCompany.findMany({
      where: { jobSourceId: { not: null } },
      select: { jobSourceId: true },
    })
    return [...new Set(rows.map((row) => row.jobSourceId).filter((id): id is string => id !== null))]
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

  private async watchlistCompanyKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.watchlistCompany.findMany({
      where: { userId },
      select: { nameKey: true },
    })
    return new Set(rows.map((row) => row.nameKey))
  }

  private async appliedListingIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.application.findMany({
      where: { userId, listingId: { not: null } },
      select: { listingId: true },
    })
    return new Set(rows.map((row) => row.listingId).filter((id): id is string => id !== null))
  }
}
