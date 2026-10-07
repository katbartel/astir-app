import { PrismaService } from '../database/prisma.service'
import { JobMatchingService } from '../job-boards/job-matching.service'
import {
  RemoteJobBoardService,
  applyRemotePolicyStatus,
  preferredRemoteBoardUrl,
  toRemoteBoardMatchableListing,
} from './remote-job-board.service'
import { classifyRemoteBoardListing } from './remote-board-classification'

describe('toRemoteBoardMatchableListing', () => {
  it('treats a plain Remote remote-board location as unknown for region matching', () => {
    expect(
      toRemoteBoardMatchableListing({
        id: 'renew-pm',
        title: 'renew - Senior Product Manager',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
      }),
    ).toEqual({
      id: 'renew-pm',
      title: 'renew - Senior Product Manager',
      location: null,
      locations: [],
      workMode: 'Remote',
    })
  })

  it('keeps region-bearing remote locations intact', () => {
    const listing = {
      id: 'remote-eu',
      title: 'Senior Product Manager',
      location: 'Remote - Europe',
      locations: ['Remote - Europe'],
      workMode: 'Remote',
    }

    expect(toRemoteBoardMatchableListing(listing)).toBe(listing)
  })
})

describe('preferredRemoteBoardUrl', () => {
  it('prefers the curated company source URL over an aggregator fallback', () => {
    expect(
      preferredRemoteBoardUrl(
        'https://www.arbeitnow.com/jobs/companies/scholarshipowl/remote-growth-product-manager-berlin-43111',
        [
          {
            jobSourceId: 'arbeitnow',
            url: 'https://www.arbeitnow.com/jobs/companies/scholarshipowl/remote-growth-product-manager-berlin-43111',
            lastSeenAt: new Date('2026-08-05T21:34:28Z'),
            jobSource: { lastSyncedAt: new Date('2026-08-05T21:34:28Z') },
          },
          {
            jobSourceId: 'scholarshipowl',
            url: 'https://careers.scholarshipowl.com/o/growth-product-manager-4',
            lastSeenAt: new Date('2026-08-06T09:13:49Z'),
            jobSource: { lastSyncedAt: new Date('2026-08-06T09:13:49Z') },
          },
        ],
        new Set(['scholarshipowl']),
      ),
    ).toBe('https://careers.scholarshipowl.com/o/growth-product-manager-4')
  })
})

describe('applyRemotePolicyStatus', () => {
  it('marks the type uncertain when an admin marks the company remote policy uncertain', () => {
    const classification = classifyRemoteBoardListing(
      { location: 'Remote - Europe', locations: ['Remote - Europe'], workMode: 'Remote' },
      ['Germany'],
    )

    expect(applyRemotePolicyStatus(classification, 'uncertain')).toMatchObject({
      visible: true,
      location: { label: 'Europe', uncertain: false },
      type: { label: 'Uncertain', uncertain: true },
      reasonCodes: expect.arrayContaining(['company remote policy marked uncertain']),
    })
  })
})

describe('classifyRemoteBoardListing', () => {
  it('shows a clear European remote role as fully remote', () => {
    expect(
      classifyRemoteBoardListing(
        { location: 'Remote - Europe', locations: ['Remote - Europe'], workMode: 'Remote' },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Europe', uncertain: false },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('keeps a curated role with no location as location-uncertain', () => {
    expect(
      classifyRemoteBoardListing(
        { location: null, locations: [], workMode: 'Remote' },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Uncertain', uncertain: true },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('keeps unknown work mode as type-uncertain', () => {
    expect(
      classifyRemoteBoardListing(
        { location: 'Remote - Europe', locations: ['Remote - Europe'], workMode: null },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Europe', uncertain: false },
      type: { label: 'Uncertain', uncertain: true },
    })
  })

  it('filters hybrid and on-site roles', () => {
    for (const workMode of ['Hybrid', 'On-Site']) {
      expect(
        classifyRemoteBoardListing(
          { location: 'Remote - Europe', locations: ['Remote - Europe'], workMode },
          ['Germany'],
        ).visible,
      ).toBe(false)
    }
  })

  it('filters country-specific roles outside the selected countries', () => {
    expect(
      classifyRemoteBoardListing(
        { location: 'Remote - Germany', locations: ['Remote - Germany'], workMode: 'Remote' },
        ['Poland'],
      ),
    ).toMatchObject({
      visible: false,
      location: { label: 'Germany', uncertain: false },
    })
  })

  it('filters a bare non-European tag when there is no European evidence', () => {
    expect(
      classifyRemoteBoardListing(
        { location: 'Remote - US', locations: ['Remote - US'], workMode: 'Remote' },
        ['Germany'],
      ).visible,
    ).toBe(false)
  })

  it('does not let generic global remote wording rescue a non-European tag', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote - United States',
          locations: ['Remote - United States'],
          workMode: 'Remote',
          descriptionText:
            'We are a globally distributed company. This is a global remote role on our product team.',
        },
        ['Germany'],
      ).visible,
    ).toBe(false)
  })

  it('keeps a non-European tag for review when the description mentions contractor work', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote - United States',
          locations: ['Remote - United States'],
          workMode: 'Remote',
          descriptionText: 'This contractor role works with a remote product team.',
        },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Uncertain', uncertain: true },
    })
  })

  it('keeps a non-European tag for review when the description mentions European hours', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote - United States',
          locations: ['Remote - United States'],
          workMode: 'Remote',
          descriptionText: 'The team needs overlap with CET working hours.',
        },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Uncertain', uncertain: true },
    })
  })

  it('keeps clear European countries when a folded role also has non-European variants', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Poland',
          locations: ['Poland', 'Greece', 'Spain', 'Ireland', 'United States', 'Canada'],
          workMode: 'Remote',
        },
        ['Poland', 'Germany', 'EU'],
      ),
    ).toMatchObject({
      visible: true,
      location: {
        label: 'Poland +3',
        details: ['Poland', 'Greece', 'Ireland', 'Spain'],
        uncertain: false,
      },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('filters an explicitly restricted non-European role', () => {
    expect(
      classifyRemoteBoardListing(
        { location: 'US only', locations: ['US only'], workMode: 'Remote' },
        ['Germany'],
      ).visible,
    ).toBe(false)
  })

  it('lets a clear European description override a bad non-European tag', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote - US',
          locations: ['Remote - US'],
          workMode: 'Remote',
          descriptionText: 'This remote role is open to candidates based anywhere in Europe.',
        },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Europe', uncertain: false },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('resolves Sourcegraph-style almost-anywhere wording with Europe listed', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote',
          locations: ['Remote'],
          workMode: 'Remote',
          descriptionText:
            'While we hire almost anywhere in the world, we have a preference for someone to reside in the following locations for this role. However, if you feel qualified, we welcome you to apply regardless of location. No matter what, working hours must overlap with EST for at least 20 hours/week.\n\nPreferred locations:\n\nEST\nEurope',
        },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Anywhere', uncertain: false },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('treats choose-where-you-live wording as anywhere when the provider only says remote', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: null,
          locations: [],
          workMode: 'Remote',
          descriptionText: 'Benefits include a fully remote team, choose where you live.',
        },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Anywhere', uncertain: false },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('does not treat past retreat locations as hiring countries or occasional presence', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote',
          locations: ['Remote'],
          workMode: 'Remote',
          descriptionText:
            'We are a fully remote, global team. Freedom and flexibility. We are a 100% distributed team working from around the world. Our team members can work from wherever they want in the world, as long as they show up on our weekly all hands meeting on Zoom. The perks include an annual company retreat in epic locations. Past trips: Paris, Morocco, Tulum, Iceland.',
        },
        ['France', 'Iceland'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Anywhere', uncertain: false, details: undefined },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('keeps a provider country location over generic choose-where-you-live wording', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote - Germany',
          locations: ['Remote - Germany'],
          workMode: 'Remote',
          descriptionText: 'Benefits include a fully remote team, choose where you live.',
        },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      location: { label: 'Germany', uncertain: false },
      type: { label: 'Fully remote', uncertain: false },
    })
  })

  it('keeps provider countries over company scale and generic flexibility copy', () => {
    const result = classifyRemoteBoardListing(
      {
        location: 'Spain',
        locations: ['Spain', 'Poznań', 'Warsaw', 'Biskupiec', 'Barcelona', 'Madrid'],
        workMode: null,
        descriptionText:
          'At Docplanner Group, we are the world largest healthcare platform with doctors across 13 countries. Remote work and flexible hours are available. The extent of flexibility depends on your role and team. You are welcome at any of our hubs in Barcelona, Warsaw, Curitiba, Rio de Janeiro, Mexico City, Bogotá, Munich, Rome or Bologna. To apply, you must already have the legal right to work in your country of residence or the location of the role.',
      },
      ['Poland', 'Spain'],
    )

    expect(result).toMatchObject({
      visible: true,
      location: { label: 'Poland +1', details: ['Poland', 'Spain'], uncertain: false },
    })
    expect(result.location.label).not.toBe('Anywhere')
  })

  it('filters a role when the description requires regular office presence', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote - Europe',
          locations: ['Remote - Europe'],
          workMode: 'Remote',
          descriptionText: 'This is a hybrid role with two days per week in the office.',
        },
        ['Germany'],
      ).visible,
    ).toBe(false)
  })

  it('badges occasional presence from the description', () => {
    expect(
      classifyRemoteBoardListing(
        {
          location: 'Remote - Europe',
          locations: ['Remote - Europe'],
          workMode: 'Remote',
          descriptionText: 'We are remote first and meet at an annual offsite.',
        },
        ['Germany'],
      ),
    ).toMatchObject({
      visible: true,
      type: { label: 'Remote, occasional presence', uncertain: false },
    })
  })
})

describe('RemoteJobBoardService detail loading', () => {
  const now = new Date('2026-09-14T12:00:00Z')
  type TestListing = {
    id: string
    title: string
    descriptionText: string
    companyName: string
    location: string | null
    locations: string[]
    workMode: string | null
    contentLanguage: string | null
    url: string
    postedAt: Date
    firstSeenAt: Date
    sources: Array<{
      provider: string
      jobSourceId: string
      url: string
      lastSeenAt: Date
      jobSource: { lastSyncedAt: Date }
    }>
  }

  function listing(id: string, title = 'Product Manager', descriptionText = 'Fully remote.'): TestListing {
    return {
      id, title, descriptionText, companyName: id, location: 'Europe', locations: ['Europe'],
      workMode: 'Remote', contentLanguage: null, url: `https://example.com/${id}`,
      postedAt: now, firstSeenAt: now,
      sources: [{ provider: 'ashby', jobSourceId: 'curated', url: `https://example.com/${id}`,
        lastSeenAt: now, jobSource: { lastSyncedAt: now } }],
    }
  }

  function setup(
    rows: ReturnType<typeof listing>[],
    keywords = ['product manager'],
    hiringRegions = ['Poland'],
  ) {
    const findMany = jest.fn(async (query) => {
      const ids: string[] | undefined = query.where.id?.in
      const selected = ids ? rows.filter((row) => ids.includes(row.id)) : rows
      return selected.map((row) => Object.fromEntries(
        Object.entries(row).filter(([key]) => query.select[key]),
      ))
    })
    const prisma = {
      jobListing: { findMany },
      remoteCompany: { findMany: jest.fn().mockResolvedValue([
        { jobSourceId: 'curated', remotePolicyStatus: 'verified' },
      ]) },
      watchlistPreferences: { findUnique: jest.fn().mockResolvedValue({
        keywords, excludedKeywords: ['principal'], hiringRegions,
      }) },
      application: { findMany: jest.fn().mockResolvedValue([]) },
      userJobListing: { findMany: jest.fn().mockResolvedValue([{ listingId: 'skipped' }]) },
    } as unknown as PrismaService
    return { service: new RemoteJobBoardService(prisma, new JobMatchingService(prisma)), findMany }
  }

  it('loads descriptions only after exact keyword matching, preserving exclusions and skipped status', async () => {
    const { service, findMany } = setup([
      listing('skipped', 'Próduct-Manager'),
      listing('excluded', 'Principal Product Manager'),
      listing('unrelated', 'Engineer'),
    ])
    const result = await service.listForUser('user')
    expect(result).toEqual([expect.objectContaining({ id: 'skipped', status: 'irrelevant' })])
    expect(findMany.mock.calls[0][0].select.descriptionText).toBeUndefined()
    expect(findMany.mock.calls[0][0].select.sources).toBeUndefined()
    expect(findMany.mock.calls[1][0].where.id.in).toEqual(['skipped'])
  })

  it('still uses descriptions to separate visible and admin review roles', async () => {
    const { service } = setup([
      listing('remote'),
      listing('office', 'Product Manager', 'This role requires 2 days per week in the office.'),
    ])
    expect((await service.listForUser('user')).map((row) => row.id)).toEqual(['remote'])
    expect((await service.listNotApplicableForUser('user')).map((row) => row.id)).toEqual(['office'])
  })

  it('keeps missing work mode uncertain instead of defaulting to fully remote', async () => {
    const { service } = setup([
      { ...listing('unknown'), workMode: null, descriptionText: '' },
    ])

    expect(await service.listForUser('user')).toEqual([
      expect.objectContaining({
        id: 'unknown',
        workMode: null,
        typeFit: { label: 'Uncertain', uncertain: true },
      }),
    ])
  })

  it('keeps hybrid Workday rows off the visible board', async () => {
    const { service } = setup([
      {
        ...listing('blackline'),
        location: 'Pleasanton',
        locations: ['Pleasanton'],
        workMode: 'Hybrid',
        descriptionText: '',
      },
    ], ['product manager'], [])

    expect(await service.listForUser('user')).toEqual([])
  })

  it('does not load details when no titles match', async () => {
    const { service, findMany } = setup([listing('unrelated', 'Engineer')])
    expect(await service.listForUser('user')).toEqual([])
    expect(findMany).toHaveBeenCalledTimes(1)
  })
})
