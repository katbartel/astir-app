import { Injectable, Logger } from '@nestjs/common'
import { User, WatchlistPreferences } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'
import { JobMatchingService } from '../job-boards/job-matching.service'
import { DEFAULT_WATCHLIST_PREFERENCES, WatchlistPreferencesInput } from './watchlist-defaults'

export { DEFAULT_WATCHLIST_PREFERENCES } from './watchlist-defaults'
export type { WatchlistPreferencesInput } from './watchlist-defaults'

export type GoogleProfileInput = {
  googleId: string
  email: string
  name: string
  avatarUrl: string | null
}

export type ProfileUpdateInput = {
  name?: string
  avatarUrl?: string | null
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobMatching: JobMatchingService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }

  updateProfile(id: string, input: ProfileUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
    })
  }

  async getWatchlistPreferences(userId: string): Promise<WatchlistPreferencesInput> {
    const saved = await this.prisma.watchlistPreferences.findUnique({ where: { userId } })
    if (!saved) {
      return DEFAULT_WATCHLIST_PREFERENCES
    }
    return {
      keywords: saved.keywords,
      excludedKeywords: saved.excludedKeywords,
      workModes: saved.workModes,
      contractTypes: saved.contractTypes,
      terms: saved.terms,
      languages: saved.languages,
      industryNoGos: saved.industryNoGos,
      hiringRegions: saved.hiringRegions,
    }
  }

  async saveWatchlistPreferences(
    userId: string,
    input: WatchlistPreferencesInput,
  ): Promise<WatchlistPreferences> {
    const saved = await this.prisma.watchlistPreferences.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    })
    // Changed preferences change which listings belong to this user, so the
    // m:n rows are recomputed right away rather than waiting for the next
    // ingestion cycle. A failure must not undo the successful save.
    try {
      await this.jobMatching.rematchUser(userId)
    } catch (error) {
      this.logger.warn(`Job rematch after preferences save failed: ${String(error)}`)
    }
    return saved
  }

  async upsertFromGoogleProfile(profile: GoogleProfileInput): Promise<User> {
    // Name and avatar belong to the user once the account exists (editable
    // under Preferences), so re-logins must not overwrite them. The Google
    // photo only backfills an avatar that is currently empty.
    const existing = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
    })
    if (!existing) {
      const created = await this.prisma.user.create({
        data: {
          googleId: profile.googleId,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        },
      })
      // A brand-new user is matched against the already-ingested listings
      // immediately; ingestion itself is user-agnostic, so no new pull is
      // needed. Never let this block the login.
      try {
        await this.jobMatching.rematchUser(created.id)
      } catch (error) {
        this.logger.warn(`Job match for new user failed: ${String(error)}`)
      }
      return created
    }
    return this.prisma.user.update({
      where: { googleId: profile.googleId },
      data: {
        email: profile.email,
        ...(existing.avatarUrl === null ? { avatarUrl: profile.avatarUrl } : {}),
      },
    })
  }
}
