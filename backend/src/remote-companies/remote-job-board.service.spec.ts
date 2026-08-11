import {
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
