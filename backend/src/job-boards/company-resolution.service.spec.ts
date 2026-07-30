import { JobSource } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'
import { CompanyResolutionService } from './company-resolution.service'
import { NormalizedJob } from './normalized-job'
import { AtsProvider, JobBoardSourceRef } from './providers/job-board-provider'

// A stand-in ATS. `postings` maps a handle to what its board returns, so a
// handle can be present-but-empty (the case several real ATS APIs produce for
// tenants they've never heard of) as distinct from absent.
class FakeAts implements AtsProvider {
  readonly kind = 'ats' as const
  readonly fetched: string[] = []

  constructor(
    readonly provider: string,
    private readonly postings: Record<string, number>,
    private readonly host = `${provider}.example`,
  ) {}

  handleFromUrl(url: string): string | null {
    const match = url.match(new RegExp(`${this.host}/([a-z0-9-]+)`, 'i'))
    return match ? match[1] : null
  }

  candidateHandles(companyName: string): string[] {
    return [companyName.toLowerCase().replace(/[^a-z0-9]+/g, '')]
  }

  // Mirrors the real providers' weakest check: the board answers, so the shape
  // is fine — but that says nothing about it holding any job.
  verifyHandle(handle: string): Promise<boolean> {
    return Promise.resolve(handle in this.postings)
  }

  fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    this.fetched.push(source.externalId)
    const count = this.postings[source.externalId] ?? 0
    return Promise.resolve(
      Array.from({ length: count }, (_unused, index) => ({
        provider: this.provider,
        externalId: `${source.externalId}-${index}`,
        title: 'Product Manager',
        companyName: source.companyName,
        location: null,
        locations: [],
        workMode: null,
        url: `https://${this.host}/${source.externalId}/${index}`,
        postedAt: null,
      })),
    )
  }
}

function fakePrisma(existing: JobSource | null) {
  const upserts: { provider: string; externalId: string }[] = []
  const prisma = {
    jobSource: {
      findFirst: jest.fn(() => Promise.resolve(existing)),
      upsert: jest.fn((args: { create: { provider: string; externalId: string } }) => {
        upserts.push({ provider: args.create.provider, externalId: args.create.externalId })
        return Promise.resolve({ id: 'src-new', ...args.create } as unknown as JobSource)
      }),
    },
  }
  return { prisma: prisma as unknown as PrismaService, upserts, raw: prisma }
}

describe('CompanyResolutionService', () => {
  it('rejects a guessed handle whose board has no postings and keeps probing', async () => {
    // "smart" verifies anything (the SmartRecruiters failure mode) but is empty;
    // the real board is on the provider probed after it.
    const smart = new FakeAts('smart', { finom: 0 })
    const lever = new FakeAts('lever', { finom: 12 })
    const { prisma, upserts } = fakePrisma(null)

    const source = await new CompanyResolutionService(prisma, [smart, lever]).resolveToSource(
      'Finom',
      null,
    )

    expect(source).not.toBeNull()
    expect(upserts).toEqual([{ provider: 'lever', externalId: 'finom' }])
  })

  it('gives up rather than latching onto an empty guessed board', async () => {
    const smart = new FakeAts('smart', { finom: 0 })
    const { prisma, upserts } = fakePrisma(null)

    const source = await new CompanyResolutionService(prisma, [smart]).resolveToSource('Finom', null)

    expect(source).toBeNull()
    expect(upserts).toEqual([])
  })

  it('accepts a handle taken from a careers URL even when the board is empty today', async () => {
    // The company's own URL is proof of which board is theirs; an empty board
    // fills up once they post, and must not be discarded here.
    const lever = new FakeAts('lever', { pnlfin: 0 })
    const { prisma, upserts } = fakePrisma(null)

    const source = await new CompanyResolutionService(prisma, [lever]).resolveToSource(
      'Finom',
      'https://lever.example/pnlfin',
    )

    expect(source).not.toBeNull()
    expect(upserts).toEqual([{ provider: 'lever', externalId: 'pnlfin' }])
    // No evidence fetch: the URL already settled it.
    expect(lever.fetched).toEqual([])
  })

  it('reuses the source already linked to the company key by default', async () => {
    const lever = new FakeAts('lever', { finom: 12 })
    const stale = { id: 'src-stale', provider: 'smart', externalId: 'finom' } as JobSource
    const { prisma, upserts } = fakePrisma(stale)

    const source = await new CompanyResolutionService(prisma, [lever]).resolveToSource('Finom', null)

    expect(source).toBe(stale)
    expect(upserts).toEqual([])
  })

  it('re-probes instead of reusing the linked source when forced', async () => {
    const lever = new FakeAts('lever', { finom: 12 })
    const stale = { id: 'src-stale', provider: 'smart', externalId: 'finom' } as JobSource
    const { prisma, upserts, raw } = fakePrisma(stale)

    const source = await new CompanyResolutionService(prisma, [lever]).resolveToSource(
      'Finom',
      null,
      { force: true },
    )

    expect(raw.jobSource.findFirst).not.toHaveBeenCalled()
    expect(source).not.toBe(stale)
    expect(upserts).toEqual([{ provider: 'lever', externalId: 'finom' }])
  })
})
