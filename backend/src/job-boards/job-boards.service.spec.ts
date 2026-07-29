import { PrismaService } from '../database/prisma.service'
import { JobBoardsService } from './job-boards.service'
import { companyKey } from './normalized-job'

type Row = {
  listing: {
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
    sources: Array<{ provider: string; jobSourceId: string | null }>
  }
  matchedKeywords: string[]
  status: string
}

function row(
  id: string,
  companyName: string,
  dates: { postedAt?: string | null; firstSeenAt?: string; jobSourceId?: string } = {},
): Row {
  return {
    listing: {
      id,
      title: 'Senior Product Manager',
      companyName,
      location: 'Berlin, DE',
      locations: ['Berlin, DE'],
      workMode: 'Remote',
      contentLanguage: null,
      url: `https://example.com/${id}`,
      postedAt: dates.postedAt ? new Date(dates.postedAt) : null,
      firstSeenAt: new Date(dates.firstSeenAt ?? '2026-07-01T00:00:00Z'),
      sources: [{ provider: 'arbeitnow', jobSourceId: dates.jobSourceId ?? null }],
    },
    matchedKeywords: ['Product Manager'],
    status: 'new',
  }
}

function makeService(options: {
  rows: Row[]
  watchlist?: string[]
  appliedListingIds?: string[]
  // JobSource ids backing the global remote-company list; their listings are
  // excluded from the regular Job Board.
  remoteSourceIds?: string[]
}): JobBoardsService {
  const prisma = {
    userJobListing: { findMany: jest.fn().mockResolvedValue(options.rows) },
    watchlistCompany: {
      findMany: jest
        .fn()
        .mockResolvedValue((options.watchlist ?? []).map((name) => ({ nameKey: companyKey(name) }))),
    },
    watchlistPreferences: {
      findUnique: jest.fn().mockResolvedValue({
        hiringRegions: ['Poland', 'Germany', 'EU'],
      }),
    },
    remoteCompany: {
      findMany: jest
        .fn()
        .mockResolvedValue((options.remoteSourceIds ?? []).map((jobSourceId) => ({ jobSourceId }))),
    },
    application: {
      findMany: jest
        .fn()
        .mockResolvedValue((options.appliedListingIds ?? []).map((listingId) => ({ listingId }))),
    },
  } as unknown as PrismaService
  return new JobBoardsService(prisma)
}

describe('JobBoardsService.listForUser exclusions', () => {
  it('returns listings not on the watchlist or in applications', async () => {
    const service = makeService({ rows: [row('a', 'Acme'), row('b', 'Globex')] })
    const listings = await service.listForUser('u1')
    expect(listings.map((listing) => listing.id)).toEqual(['a', 'b'])
  })

  it('hides a listing whose company is on the watchlist (watchlist takes precedence)', async () => {
    const service = makeService({
      rows: [row('a', 'Resourcify'), row('b', 'Globex')],
      // Watchlist stores a different casing/spacing; matching is by companyKey.
      watchlist: ['  resourcify '],
    })
    const listings = await service.listForUser('u1')
    expect(listings.map((listing) => listing.id)).toEqual(['b'])
  })

  it('hides a listing backed by a remote-company source (it lives on the Remote Job Board)', async () => {
    const service = makeService({
      rows: [row('a', 'Acme', { jobSourceId: 'src-remote' }), row('b', 'Globex')],
      remoteSourceIds: ['src-remote'],
    })
    const listings = await service.listForUser('u1')
    expect(listings.map((listing) => listing.id)).toEqual(['b'])
  })

  it('hides a listing the user has logged an application for', async () => {
    const service = makeService({
      rows: [row('a', 'Acme'), row('b', 'Globex')],
      appliedListingIds: ['b'],
    })
    const listings = await service.listForUser('u1')
    expect(listings.map((listing) => listing.id)).toEqual(['a'])
  })

  it('orders newest-first by posting date, undated listings falling back to first-seen', async () => {
    const service = makeService({
      rows: [
        row('old', 'Acme', { postedAt: '2026-06-01T00:00:00Z' }),
        row('new', 'Globex', { postedAt: '2026-07-05T00:00:00Z' }),
        // No posting date -> ranked by when we first saw it (2026-07-08).
        row('undated', 'Initech', { postedAt: null, firstSeenAt: '2026-07-08T00:00:00Z' }),
      ],
    })
    const listings = await service.listForUser('u1')
    expect(listings.map((listing) => listing.id)).toEqual(['undated', 'new', 'old'])
  })

  it('folds the same role across regions into one listing', async () => {
    const poland = row('poland', 'Docplanner', {
      postedAt: '2026-07-24T00:00:00Z',
      firstSeenAt: '2026-07-24T08:00:00Z',
    })
    poland.listing.title = 'Senior Product Manager - Marketplace (100% Remote within Poland)'
    poland.listing.location = 'Warsaw, Poland'
    poland.listing.locations = ['Warsaw, Poland', 'Krakow, Poland', 'Gdansk, Poland']

    const spain = row('spain', 'Docplanner', {
      postedAt: '2026-07-24T00:00:00Z',
      firstSeenAt: '2026-07-24T09:00:00Z',
    })
    spain.listing.title = 'Senior Product Manager - Marketplace (100% Remote within Spain)'
    spain.listing.location = 'Barcelona, Spain'
    spain.listing.locations = ['Barcelona, Spain', 'Madrid, Spain', 'Valencia, Spain']

    const service = makeService({ rows: [poland, spain] })
    const listings = await service.listForUser('u1')

    expect(listings).toHaveLength(1)
    expect(listings[0].id).toBe('poland')
    expect(listings[0].locations).toEqual([
      'Warsaw, Poland',
      'Krakow, Poland',
      'Gdansk, Poland',
      'Barcelona, Spain',
      'Madrid, Spain',
      'Valencia, Spain',
    ])
  })
})
