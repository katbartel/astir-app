import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service'
import {
  DEFAULT_WATCHLIST_PREFERENCES,
  WatchlistPreferencesInput,
} from '../users/watchlist-defaults'
import { normalizeForIdentity } from './normalized-job'
import { matchesHiringRegions, matchesWorkModes } from './region-matching'

type MatchableListing = {
  id: string
  title: string
  location: string | null
  locations: string[]
  workMode: string | null
}

type Match = {
  listingId: string
  matchedKeywords: string[]
}

type MatchingPreferences = Pick<
  WatchlistPreferencesInput,
  'keywords' | 'excludedKeywords' | 'workModes' | 'hiringRegions'
>

// Ingestion stores every job from every source — the superset across all
// users. This service owns the user-specific half: which listings belong to
// whom. Relations are recomputed from preferences at any time, so preference
// edits and brand-new users never require a re-ingestion.
@Injectable()
export class JobMatchingService {
  private readonly logger = new Logger(JobMatchingService.name)

  constructor(private readonly prisma: PrismaService) {}

  // A listing belongs to a user when the title hits one of their keywords,
  // hits none of their excluded keywords, AND the posting is workable for them
  // (work mode + hiring regions).
  computeMatches(preferences: MatchingPreferences, listings: MatchableListing[]): Match[] {
    const keywords = (
      preferences.keywords.length ? preferences.keywords : DEFAULT_WATCHLIST_PREFERENCES.keywords
    )
      .map((keyword) => ({ keyword, normalized: normalizeForIdentity(keyword) }))
      .filter((entry) => entry.normalized.length > 0)
    // Exclusions are whole-phrase, matched the same way as keywords, and win
    // over any keyword hit (excluding "principal product manager" drops it even
    // though it also contains "product manager").
    const excluded = (preferences.excludedKeywords ?? [])
      .map((keyword) => normalizeForIdentity(keyword))
      .filter((normalized) => normalized.length > 0)
    const matches: Match[] = []
    for (const listing of listings) {
      const title = ` ${normalizeForIdentity(listing.title)} `
      if (excluded.some((normalized) => title.includes(` ${normalized} `))) {
        continue
      }
      const matchedKeywords = keywords
        .filter((entry) => title.includes(` ${entry.normalized} `))
        .map((entry) => entry.keyword)
      if (!matchedKeywords.length) {
        continue
      }
      if (!matchesWorkModes(listing.workMode, preferences.workModes)) {
        continue
      }
      const locations = listing.locations.length
        ? listing.locations
        : listing.location
          ? [listing.location]
          : []
      if (!matchesHiringRegions(locations, preferences.hiringRegions)) {
        continue
      }
      matches.push({ listingId: listing.id, matchedKeywords })
    }
    return matches
  }

  // Recomputes one user's relations: stale rows go, new matches arrive,
  // surviving rows keep their per-user state (status).
  async rematchUser(userId: string): Promise<{ created: number; removed: number }> {
    const [preferences, listings] = await Promise.all([
      this.loadPreferences(userId),
      this.loadListings(),
    ])
    return this.applyMatches(userId, this.computeMatches(preferences, listings))
  }

  // Same recomputation for everyone; ingestion runs this after each sync so
  // fresh listings reach every user.
  async rematchAllUsers(): Promise<number> {
    const [users, listings] = await Promise.all([
      this.prisma.user.findMany({ include: { watchlistPreferences: true } }),
      this.loadListings(),
    ])
    let created = 0
    for (const user of users) {
      const preferences = user.watchlistPreferences ?? DEFAULT_WATCHLIST_PREFERENCES
      const result = await this.applyMatches(user.id, this.computeMatches(preferences, listings))
      created += result.created
    }
    return created
  }

  private async applyMatches(
    userId: string,
    matches: Match[],
  ): Promise<{ created: number; removed: number }> {
    const { count: removed } = await this.prisma.userJobListing.deleteMany({
      where: { userId, listingId: { notIn: matches.map((match) => match.listingId) } },
    })
    const { count: created } = await this.prisma.userJobListing.createMany({
      data: matches.map((match) => ({
        userId,
        listingId: match.listingId,
        matchedKeywords: match.matchedKeywords,
      })),
      skipDuplicates: true,
    })
    if (created || removed) {
      this.logger.log(`Rematched user ${userId}: +${created} / -${removed} listings`)
    }
    return { created, removed }
  }

  private async loadPreferences(userId: string): Promise<MatchingPreferences> {
    const saved = await this.prisma.watchlistPreferences.findUnique({ where: { userId } })
    return saved ?? DEFAULT_WATCHLIST_PREFERENCES
  }

  private loadListings(): Promise<MatchableListing[]> {
    return this.prisma.jobListing.findMany({
      select: { id: true, title: true, location: true, locations: true, workMode: true },
    })
  }
}
