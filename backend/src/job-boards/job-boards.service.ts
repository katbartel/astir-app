import { Injectable } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import { DEFAULT_WATCHLIST_PREFERENCES } from '../users/watchlist-defaults'
import { UserSettableListingStatus } from './dto/update-listing.dto'
import { companyKey } from './normalized-job'
import { FoldableOpening, foldOpenings } from './opening-folding'

export type JobBoardListing = {
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

// Postings older than this drop off the board: aggregators keep echoing
// long-open reqs (a still-listed role posted over a year ago), and those read
// as stale noise next to fresh openings. A posting with no known date is kept
// — several ATS providers (Personio, Workday, the JobPosting reader) expose no
// posting date, and "unknown age" is not the same as "old".
const MAX_LISTING_AGE_DAYS = 90

@Injectable()
export class JobBoardsService {
  constructor(private readonly prisma: PrismaService) {}

  // The Watchlist takes precedence over the Job Board: a listing drops off the
  // board once its company is on the user's watchlist (its openings show there
  // instead) or the user has logged an application for it (it lives on Pipeline
  // / All applications now). Mirrors how WatchlistView hides applied roles.
  // Listings from the global remote-company list are also excluded — they live
  // exclusively on the Remote Job Board.
  async listForUser(userId: string): Promise<JobBoardListing[]> {
    const cutoff = new Date(Date.now() - MAX_LISTING_AGE_DAYS * 24 * 60 * 60 * 1000)
    const [rows, preferences, watchlistKeys, appliedListingIds, remoteSourceIds] = await Promise.all([
      this.prisma.userJobListing.findMany({
        where: {
          userId,
          status: { not: 'dismissed' },
          // Keep fresh postings and undated ones; drop anything demonstrably old.
          listing: { OR: [{ postedAt: null }, { postedAt: { gte: cutoff } }] },
        },
        include: {
          listing: {
            include: { sources: { select: { provider: true, jobSourceId: true } } },
          },
        },
      }),
      this.matchingPreferences(userId),
      this.watchlistCompanyKeys(userId),
      this.appliedListingIds(userId),
      this.remoteCompanySourceIds(),
    ])
    const statusById = new Map(rows.map((row) => [row.listing.id, row.status]))
    const candidates: FoldableOpening[] = rows
      .filter(
        (row) =>
          !appliedListingIds.has(row.listing.id) &&
          !watchlistKeys.has(companyKey(row.listing.companyName)) &&
          !row.listing.sources.some(
            (source) => source.jobSourceId && remoteSourceIds.has(source.jobSourceId),
          ),
      )
      .map((row) => ({
        id: row.listing.id,
        title: row.listing.title,
        companyName: row.listing.companyName,
        url: row.listing.url,
        location: row.listing.location,
        locations: row.listing.locations,
        workMode: row.listing.workMode,
        contentLanguage: row.listing.contentLanguage,
        postedAt: row.listing.postedAt,
        firstSeenAt: row.listing.firstSeenAt,
        providers: [...new Set(row.listing.sources.map((source) => source.provider))],
        matchedKeywords: row.matchedKeywords,
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
        status: statusById.get(opening.id) ?? 'new',
      }))
      // Newest first by real posting date; undated postings fall back to when
      // we first saw them, so a just-ingested but ancient aggregator req can't
      // masquerade as fresh at the top of the feed.
      .sort((a, b) => this.effectiveDate(b) - this.effectiveDate(a))
  }

  // Set the user's status on a listing — e.g. 'irrelevant' to drop it into the
  // quiet section, or 'new' to bring it back to the main feed. Both values are
  // still returned by listForUser (only 'dismissed' is hidden), so the frontend
  // splits the feed on status. updateMany is a no-op when the relation is gone
  // (the listing stopped matching preferences), so a stale click can't 500.
  async setStatus(
    userId: string,
    listingId: string,
    status: UserSettableListingStatus,
  ): Promise<void> {
    await this.prisma.userJobListing.updateMany({
      where: { userId, listingId },
      data: { status },
    })
  }

  private effectiveDate(listing: JobBoardListing): number {
    return (listing.postedAt ?? listing.firstSeenAt).getTime()
  }

  private async matchingPreferences(userId: string) {
    const saved = await this.prisma.watchlistPreferences.findUnique({ where: { userId } })
    const base = saved ?? DEFAULT_WATCHLIST_PREFERENCES
    return {
      hiringRegions: base.hiringRegions,
    }
  }

  // Normalized company keys of everything on the user's watchlist, so their
  // openings surface on the Watchlist rather than the Job Board.
  private async watchlistCompanyKeys(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.watchlistCompany.findMany({
      where: { userId },
      select: { nameKey: true },
    })
    return new Set(rows.map((row) => row.nameKey))
  }

  // JobSource ids backing the global remote-company list, so their listings
  // stay off the regular Job Board (they belong to the Remote Job Board).
  private async remoteCompanySourceIds(): Promise<Set<string>> {
    const rows = await this.prisma.remoteCompany.findMany({
      where: { jobSourceId: { not: null } },
      select: { jobSourceId: true },
    })
    return new Set(rows.map((row) => row.jobSourceId).filter((id): id is string => id !== null))
  }

  // Listing ids the user has already logged an application for, so those drop
  // off the Job Board (they live on Pipeline / All applications now).
  private async appliedListingIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.application.findMany({
      where: { userId, listingId: { not: null } },
      select: { listingId: true },
    })
    return new Set(rows.map((row) => row.listingId).filter((id): id is string => id !== null))
  }
}
