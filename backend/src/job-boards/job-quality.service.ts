import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'

type SnapshotRow = {
  canonicalListings: bigint
  sourceObservations: bigint
  listingsSeenWithin24Hours: bigint
  listingsWithPostedAt: bigint
  medianListingAgeHours: number | null
  crossProviderCollisions: bigint
  crossProviderExtraObservations: bigint
  listingsWithLocation: bigint
  listingsWithWorkMode: bigint
  listingsWithDescription: bigint
  listingsWithContentLanguage: bigint
}

export type JobQualityOverview = {
  current: {
    measuredAt: Date
    canonicalListings: number
    sourceObservations: number
    listingsSeenWithin24Hours: number
    listingsWithPostedAt: number
    medianListingAgeHours: number | null
    crossProviderCollisions: number
    crossProviderExtraObservations: number
    listingsWithLocation: number
    listingsWithWorkMode: number
    listingsWithDescription: number
    listingsWithContentLanguage: number
  } | null
  trend: Array<{
    observedOn: Date
    canonicalListings: number
    listingsSeenWithin24Hours: number
    listingsWithPostedAt: number
    medianListingAgeHours: number | null
    crossProviderCollisions: number
    sourceObservations: number
  }>
  sources: Array<{
    provider: string
    attempts: number
    successfulRuns: number
    lastCheckedAt: Date
    sourceCount: number
    failedSources: number
    normalizedListingsSeen: number
    listingsCreated: number
    staleObservationsSuppressed: number
    latestError: string | null
  }>
}

function asNumber(value: bigint): number {
  return Number(value)
}

@Injectable()
export class JobQualityService {
  constructor(private readonly prisma: PrismaService) {}

  // Keeps one snapshot per UTC calendar day. A later full sync refreshes that
  // day's value, which avoids turning an hourly operational detail into a
  // misleading trend point.
  async captureDailySnapshot(now = new Date()): Promise<void> {
    const [row] = await this.prisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
      WITH per_listing AS (
        SELECT
          l.id,
          COUNT(s.id)::bigint AS source_observations,
          COUNT(DISTINCT s.provider)::bigint AS provider_count
        FROM job_listings l
        LEFT JOIN job_listing_sources s ON s.listing_id = l.id
        GROUP BY l.id
      )
      SELECT
        COUNT(*)::bigint AS "canonicalListings",
        COALESCE(SUM(per_listing.source_observations), 0)::bigint AS "sourceObservations",
        COUNT(*) FILTER (WHERE l.last_seen_at >= NOW() - INTERVAL '24 hours')::bigint AS "listingsSeenWithin24Hours",
        COUNT(*) FILTER (WHERE l.posted_at IS NOT NULL)::bigint AS "listingsWithPostedAt",
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (NOW() - l.posted_at)) / 3600
        ) FILTER (WHERE l.posted_at IS NOT NULL) AS "medianListingAgeHours",
        COUNT(*) FILTER (WHERE per_listing.provider_count > 1)::bigint AS "crossProviderCollisions",
        COALESCE(SUM(per_listing.source_observations - 1) FILTER (WHERE per_listing.provider_count > 1), 0)::bigint AS "crossProviderExtraObservations",
        COUNT(*) FILTER (WHERE l.location IS NOT NULL AND BTRIM(l.location) <> '')::bigint AS "listingsWithLocation",
        COUNT(*) FILTER (WHERE l.work_mode IS NOT NULL)::bigint AS "listingsWithWorkMode",
        COUNT(*) FILTER (WHERE l.description_text IS NOT NULL AND BTRIM(l.description_text) <> '')::bigint AS "listingsWithDescription",
        COUNT(*) FILTER (WHERE l.content_language IS NOT NULL)::bigint AS "listingsWithContentLanguage"
      FROM job_listings l
      JOIN per_listing ON per_listing.id = l.id
    `)
    if (!row) return
    const observedOn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    await this.prisma.jobQualitySnapshot.upsert({
      where: { observedOn },
      update: { measuredAt: now, ...this.snapshotData(row) },
      create: { observedOn, measuredAt: now, ...this.snapshotData(row) },
    })
  }

  async overview(): Promise<JobQualityOverview> {
    const [current, trend, runs] = await Promise.all([
      this.prisma.jobQualitySnapshot.findFirst({ orderBy: { measuredAt: 'desc' } }),
      this.prisma.jobQualitySnapshot.findMany({ orderBy: { observedOn: 'desc' }, take: 14 }),
      this.prisma.jobIngestionRun.findMany({
        where: { completedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
        orderBy: { completedAt: 'desc' },
        select: {
          provider: true,
          jobSourceId: true,
          succeeded: true,
          normalizedListingsSeen: true,
          listingsCreated: true,
          staleObservationsSuppressed: true,
          errorMessage: true,
          completedAt: true,
        },
      }),
    ])
    const byProvider = new Map<
      string,
      {
        provider: string
        attempts: number
        successfulRuns: number
        lastCheckedAt: Date
        sourceCount: number
        failedSources: number
        normalizedListingsSeen: number
        listingsCreated: number
        staleObservationsSuppressed: number
        latestError: string | null
      }
    >()
    const latestSourceRunIds = new Set<string>()
    for (const run of runs) {
      const provider = byProvider.get(run.provider) ?? {
        provider: run.provider,
        attempts: 0,
        successfulRuns: 0,
        lastCheckedAt: run.completedAt,
        sourceCount: 0,
        failedSources: 0,
        normalizedListingsSeen: 0,
        listingsCreated: 0,
        staleObservationsSuppressed: 0,
        latestError: null,
      }
      provider.attempts += 1
      provider.successfulRuns += run.succeeded ? 1 : 0
      provider.normalizedListingsSeen += run.normalizedListingsSeen
      provider.listingsCreated += run.listingsCreated
      provider.staleObservationsSuppressed += run.staleObservationsSuppressed
      if (!provider.latestError && run.errorMessage) provider.latestError = run.errorMessage
      if (!latestSourceRunIds.has(run.jobSourceId)) {
        latestSourceRunIds.add(run.jobSourceId)
        provider.sourceCount += 1
        provider.failedSources += run.succeeded ? 0 : 1
      }
      byProvider.set(run.provider, provider)
    }
    return {
      current: current
        ? {
            measuredAt: current.measuredAt,
            canonicalListings: current.canonicalListings,
            sourceObservations: current.sourceObservations,
            listingsSeenWithin24Hours: current.listingsSeenWithin24Hours,
            listingsWithPostedAt: current.listingsWithPostedAt,
            medianListingAgeHours: current.medianListingAgeHours,
            crossProviderCollisions: current.crossProviderCollisions,
            crossProviderExtraObservations: current.crossProviderExtraObservations,
            listingsWithLocation: current.listingsWithLocation,
            listingsWithWorkMode: current.listingsWithWorkMode,
            listingsWithDescription: current.listingsWithDescription,
            listingsWithContentLanguage: current.listingsWithContentLanguage,
          }
        : null,
      trend: trend.reverse().map((snapshot) => ({
        observedOn: snapshot.observedOn,
        canonicalListings: snapshot.canonicalListings,
        listingsSeenWithin24Hours: snapshot.listingsSeenWithin24Hours,
        listingsWithPostedAt: snapshot.listingsWithPostedAt,
        medianListingAgeHours: snapshot.medianListingAgeHours,
        crossProviderCollisions: snapshot.crossProviderCollisions,
        sourceObservations: snapshot.sourceObservations,
      })),
      sources: [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider)),
    }
  }

  private snapshotData(row: SnapshotRow) {
    return {
      canonicalListings: asNumber(row.canonicalListings),
      sourceObservations: asNumber(row.sourceObservations),
      listingsSeenWithin24Hours: asNumber(row.listingsSeenWithin24Hours),
      listingsWithPostedAt: asNumber(row.listingsWithPostedAt),
      medianListingAgeHours: row.medianListingAgeHours,
      crossProviderCollisions: asNumber(row.crossProviderCollisions),
      crossProviderExtraObservations: asNumber(row.crossProviderExtraObservations),
      listingsWithLocation: asNumber(row.listingsWithLocation),
      listingsWithWorkMode: asNumber(row.listingsWithWorkMode),
      listingsWithDescription: asNumber(row.listingsWithDescription),
      listingsWithContentLanguage: asNumber(row.listingsWithContentLanguage),
    }
  }
}
