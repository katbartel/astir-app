import { AdzunaProvider } from './adzuna.provider'
import { ArbeitnowProvider } from './arbeitnow.provider'
import { AshbyProvider } from './ashby.provider'
import { BambooHrProvider } from './bamboohr.provider'
import { BlueskyProvider, jobsFromHtml } from './bluesky.provider'
import { BreezyProvider } from './breezy.provider'
import { GreenhouseProvider } from './greenhouse.provider'
import { JobPostingProvider } from './jobposting.provider'
import { JoinProvider } from './join.provider'
import { LeverProvider } from './lever.provider'
import { PersonioProvider } from './personio.provider'
import { PinpointProvider } from './pinpoint.provider'
import { RecruiteeProvider } from './recruitee.provider'
import { SmartRecruitersProvider } from './smartrecruiters.provider'
import { TeamtailorProvider } from './teamtailor.provider'
import { TheMuseProvider } from './themuse.provider'
import { TraffitProvider } from './traffit.provider'
import { WorkableProvider } from './workable.provider'
import { WorkdayProvider } from './workday.provider'

const source = { externalId: 'acme', companyName: 'Acme' }

describe('GreenhouseProvider.normalize', () => {
  const provider = new GreenhouseProvider()

  it('maps the raw board payload into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: 8503792002,
          title: 'Account Executive - Italy',
          absolute_url: 'https://job-boards.greenhouse.io/gitlab/jobs/8503792002',
          company_name: 'GitLab',
          location: { name: 'Remote, Italy' },
          first_published: '2026-04-17T05:58:03-04:00',
        },
        source,
      ),
    ).toEqual({
      provider: 'greenhouse',
      externalId: '8503792002',
      title: 'Account Executive - Italy',
      companyName: 'GitLab',
      location: 'Remote, Italy',
      locations: ['Remote, Italy'],
      workMode: 'Remote',
      url: 'https://job-boards.greenhouse.io/gitlab/jobs/8503792002',
      postedAt: new Date('2026-04-17T05:58:03-04:00'),
    })
  })

  it('falls back to the source company name and drops incomplete jobs', () => {
    const job = provider.normalize(
      { id: 1, title: 'PM', absolute_url: 'https://x.example/1' },
      source,
    )
    expect(job?.companyName).toBe('Acme')
    expect(provider.normalize({ title: 'No id' }, source)).toBeNull()
  })
})

describe('AshbyProvider.normalize', () => {
  const provider = new AshbyProvider()

  it('maps the posting-api payload into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: 'd3bc1ced',
          title: 'Senior / Staff Fullstack Engineer',
          location: 'Europe',
          secondaryLocations: [{ location: 'Berlin' }],
          address: { postalAddress: { addressCountry: 'European Union' } },
          workplaceType: 'Remote',
          jobUrl: 'https://jobs.ashbyhq.com/linear/d3bc1ced',
          publishedAt: '2021-04-27T20:13:45.158+00:00',
        },
        source,
      ),
    ).toEqual({
      provider: 'ashby',
      externalId: 'd3bc1ced',
      title: 'Senior / Staff Fullstack Engineer',
      companyName: 'Acme',
      location: 'Europe',
      locations: ['Europe', 'Berlin', 'European Union'],
      workMode: 'Remote',
      url: 'https://jobs.ashbyhq.com/linear/d3bc1ced',
      postedAt: new Date('2021-04-27T20:13:45.158+00:00'),
    })
  })

  it('maps OnSite workplaceType to the On-Site token', () => {
    const job = provider.normalize(
      { id: '1', title: 'PM', jobUrl: 'https://x.example/1', workplaceType: 'OnSite' },
      source,
    )
    expect(job?.workMode).toBe('On-Site')
  })
})

describe('WorkableProvider.normalize', () => {
  const provider = new WorkableProvider()

  it('maps the widget payload into a normalized job', () => {
    expect(
      provider.normalize(
        {
          title: 'Business Development Account Executive',
          shortcode: '38ABFA8E0D',
          url: 'https://apply.workable.com/j/38ABFA8E0D',
          telecommuting: true,
          city: '',
          country: 'Greece',
          locations: [{ city: 'Athens', country: 'Greece' }],
          published_on: '2026-03-02',
        },
        'Blueground',
      ),
    ).toEqual({
      provider: 'workable',
      externalId: '38ABFA8E0D',
      title: 'Business Development Account Executive',
      companyName: 'Blueground',
      location: 'Greece',
      locations: ['Greece', 'Athens, Greece'],
      workMode: 'Remote',
      url: 'https://apply.workable.com/j/38ABFA8E0D',
      postedAt: new Date('2026-03-02'),
    })
  })

  it('joins city and country and drops jobs without a shortcode', () => {
    const job = provider.normalize(
      { title: 'PM', shortcode: 'A1', url: 'https://x.example/1', city: 'Athens', country: 'Greece' },
      'Blueground',
    )
    expect(job?.location).toBe('Athens, Greece')
    expect(provider.normalize({ title: 'No shortcode' }, 'Blueground')).toBeNull()
  })
})

describe('LeverProvider.normalize', () => {
  const provider = new LeverProvider()

  it('maps the postings payload into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: 'bde27362-0652-4d1a-bb8e-d6100ca20654',
          text: 'Associate Director, Growth',
          hostedUrl: 'https://jobs.lever.co/ro/bde27362-0652-4d1a-bb8e-d6100ca20654',
          categories: { location: 'New York, NY', allLocations: ['New York, NY', 'Remote'] },
          workplaceType: 'hybrid',
          createdAt: 1773176562892,
        },
        source,
      ),
    ).toEqual({
      provider: 'lever',
      externalId: 'bde27362-0652-4d1a-bb8e-d6100ca20654',
      title: 'Associate Director, Growth',
      companyName: 'Acme',
      location: 'New York, NY',
      locations: ['New York, NY', 'Remote'],
      workMode: 'Hybrid',
      url: 'https://jobs.lever.co/ro/bde27362-0652-4d1a-bb8e-d6100ca20654',
      postedAt: new Date(1773176562892),
    })
  })

  it('maps the remote workplaceType and drops jobs without an id', () => {
    const job = provider.normalize(
      { id: '1', text: 'PM', hostedUrl: 'https://x.example/1', workplaceType: 'remote' },
      source,
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.postedAt).toBeNull()
    expect(provider.normalize({ text: 'No id', hostedUrl: 'https://x.example' }, source)).toBeNull()
  })
})

describe('SmartRecruitersProvider.normalize', () => {
  const provider = new SmartRecruitersProvider()

  it('maps the postings payload into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: '744000120624847',
          name: 'Franchisee UK & Ireland',
          company: { identifier: 'McDonaldsCorporation', name: "McDonald's Corporation" },
          location: { city: 'London', region: 'England', country: 'gb', fullLocation: 'London, England, United Kingdom' },
          releasedDate: '2026-04-14T07:57:07.974Z',
        },
        source,
      ),
    ).toEqual({
      provider: 'smartrecruiters',
      externalId: '744000120624847',
      title: 'Franchisee UK & Ireland',
      companyName: "McDonald's Corporation",
      location: 'London, England, United Kingdom',
      locations: ['London, England, United Kingdom'],
      workMode: null,
      url: 'https://jobs.smartrecruiters.com/McDonaldsCorporation/744000120624847',
      postedAt: new Date('2026-04-14T07:57:07.974Z'),
    })
  })

  it('flags remote roles and builds the URL from the source handle when unnamed', () => {
    const job = provider.normalize(
      { id: '1', name: 'PM', location: { city: 'Berlin', remote: true } },
      source,
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.location).toBe('Berlin')
    expect(job?.companyName).toBe('Acme')
    expect(job?.url).toBe('https://jobs.smartrecruiters.com/acme/1')
    expect(provider.normalize({ id: '1' }, source)).toBeNull()
  })
})

describe('RecruiteeProvider.normalize', () => {
  const provider = new RecruiteeProvider()

  it('maps the offers payload into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: 2601504,
          title: 'HSEQ Lead',
          careers_url: 'https://vacancies.recruitee.com/o/hseq-lead',
          city: 'Groningen',
          country: 'Netherlands',
          location: 'Groningen, Groningen, Netherlands',
          locations: [{ name: 'Groningen', city: 'Groningen', state: 'Groningen', country: 'Netherlands' }],
          status: 'published',
          published_at: '2026-05-12 13:01:01 UTC',
          company_name: 'Arc',
        },
        source,
      ),
    ).toEqual({
      provider: 'recruitee',
      externalId: '2601504',
      title: 'HSEQ Lead',
      companyName: 'Arc',
      location: 'Groningen, Groningen, Netherlands',
      locations: ['Groningen, Groningen, Netherlands', 'Groningen'],
      workMode: null,
      url: 'https://vacancies.recruitee.com/o/hseq-lead',
      postedAt: new Date('2026-05-12 13:01:01 UTC'),
    })
  })

  it('maps the remote flag and drops offers without a careers URL', () => {
    const job = provider.normalize(
      { id: 5, title: 'PM', careers_url: 'https://x.recruitee.com/o/pm', city: 'Berlin', country: 'Germany', remote: true },
      source,
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.location).toBe('Berlin, Germany')
    expect(provider.normalize({ id: 5, title: 'No url' }, source)).toBeNull()
  })
})

describe('TeamtailorProvider.normalize', () => {
  const provider = new TeamtailorProvider()

  it('maps the JSON Feed item into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: '3a951f82-c0a2-44e6-a792-dc04e1873e29',
          title: 'Butikschef Skövde',
          url: 'https://life.teamtailor.com/jobs/7969476-butikschef-skovde',
          date_published: '2026-06-25T09:56:08+02:00',
          _jobposting: {
            hiringOrganization: { name: 'Life Sverige' },
            jobLocation: [
              { address: { addressLocality: 'Skövde', addressRegion: 'Väst', addressCountry: 'SE' } },
              { address: { addressLocality: 'Stockholm', addressCountry: 'SE' } },
            ],
            datePosted: '2026-06-25T09:56:08+02:00',
          },
        },
        source,
      ),
    ).toEqual({
      provider: 'teamtailor',
      externalId: '3a951f82-c0a2-44e6-a792-dc04e1873e29',
      title: 'Butikschef Skövde',
      companyName: 'Life Sverige',
      location: 'Skövde, Väst, SE',
      locations: ['Skövde, Väst, SE', 'Stockholm, SE'],
      workMode: null,
      url: 'https://life.teamtailor.com/jobs/7969476-butikschef-skovde',
      postedAt: new Date('2026-06-25T09:56:08+02:00'),
    })
  })

  it('flags telecommute roles, falls back to the source company, and drops jobs without a url', () => {
    const job = provider.normalize(
      {
        id: '1',
        title: 'Staff Engineer',
        url: 'https://x.teamtailor.com/jobs/1',
        _jobposting: { jobLocationType: 'TELECOMMUTE' },
      },
      source,
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.companyName).toBe('Acme')
    expect(job?.location).toBeNull()
    expect(provider.normalize({ id: '1', title: 'No url' }, source)).toBeNull()
  })
})

describe('ArbeitnowProvider.normalize', () => {
  const provider = new ArbeitnowProvider()

  it('maps a feed item into a normalized job', () => {
    expect(
      provider.normalize({
        slug: 'senior-product-manager-berlin-471192',
        company_name: 'Acme GmbH',
        title: 'Senior Product Manager',
        url: 'https://www.arbeitnow.com/jobs/companies/acme/senior-product-manager-berlin-471192',
        location: 'Berlin',
        remote: true,
        created_at: 1783621829,
      }),
    ).toEqual({
      provider: 'arbeitnow',
      externalId: 'senior-product-manager-berlin-471192',
      title: 'Senior Product Manager',
      companyName: 'Acme GmbH',
      location: 'Berlin',
      locations: ['Berlin'],
      workMode: 'Remote',
      url: 'https://www.arbeitnow.com/jobs/companies/acme/senior-product-manager-berlin-471192',
      postedAt: new Date(1783621829 * 1000),
    })
  })

  it('leaves work mode null for on-site roles and drops items missing a company', () => {
    const job = provider.normalize({
      slug: 'pm',
      company_name: 'Acme',
      title: 'PM',
      url: 'https://x.example/pm',
      location: 'Munich',
    })
    expect(job?.workMode).toBeNull()
    expect(job?.postedAt).toBeNull()
    expect(
      provider.normalize({ slug: 'x', title: 'No company', url: 'https://x.example' }),
    ).toBeNull()
  })
})

describe('TheMuseProvider.normalize', () => {
  const provider = new TheMuseProvider()

  it('maps a public-API job into a normalized job', () => {
    expect(
      provider.normalize({
        id: 18113098,
        name: 'Staff Software Engineer',
        company: { name: 'Atlassian' },
        locations: [{ name: 'Flexible / Remote' }, { name: 'London, United Kingdom' }],
        refs: { landing_page: 'https://www.themuse.com/jobs/atlassian/staff-software-engineer' },
        publication_date: '2026-07-08T19:49:40Z',
      }),
    ).toEqual({
      provider: 'themuse',
      externalId: '18113098',
      title: 'Staff Software Engineer',
      companyName: 'Atlassian',
      location: 'Flexible / Remote',
      locations: ['Flexible / Remote', 'London, United Kingdom'],
      workMode: 'Remote',
      url: 'https://www.themuse.com/jobs/atlassian/staff-software-engineer',
      postedAt: new Date('2026-07-08T19:49:40Z'),
    })
  })

  it('leaves work mode null without a remote location and drops jobs missing a landing page', () => {
    const job = provider.normalize({
      id: 1,
      name: 'PM',
      company: { name: 'Acme' },
      locations: [{ name: 'Berlin, Germany' }],
      refs: {},
      publication_date: '2026-07-08T19:49:40Z',
    })
    expect(job).toBeNull()
    const onsite = provider.normalize({
      id: 2,
      name: 'PM',
      company: { name: 'Acme' },
      locations: [{ name: 'Berlin, Germany' }],
      refs: { landing_page: 'https://www.themuse.com/jobs/acme/pm' },
    })
    expect(onsite?.workMode).toBeNull()
    expect(onsite?.location).toBe('Berlin, Germany')
    expect(onsite?.postedAt).toBeNull()
  })
})

describe('PersonioProvider.normalize', () => {
  const provider = new PersonioProvider()

  it('builds the apply URL from the resolved host and position id', () => {
    expect(
      provider.normalize(
        { id: 2481777, name: 'Principal Product Manager', office: 'Berlin', offices: ['Berlin'] },
        source,
        'acme.jobs.personio.com',
      ),
    ).toEqual({
      provider: 'personio',
      externalId: '2481777',
      title: 'Principal Product Manager',
      companyName: 'Acme',
      location: 'Berlin',
      locations: ['Berlin'],
      workMode: null,
      url: 'https://acme.jobs.personio.com/job/2481777?language=en',
      postedAt: null,
    })
  })

  it('flags remote offices and drops positions without a name', () => {
    const job = provider.normalize(
      { id: 5, name: 'PM', offices: ['Remote', 'Munich'] },
      source,
      'acme.jobs.personio.de',
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.location).toBe('Remote')
    expect(job?.postedAt).toBeNull()
    expect(provider.normalize({ id: 5 }, source, 'acme.jobs.personio.de')).toBeNull()
  })
})

describe('JoinProvider.normalize', () => {
  const provider = new JoinProvider()

  it('builds the public job URL from the resolved domain and idParam', () => {
    expect(
      provider.normalize(
        {
          id: 16312205,
          idParam: '16425272-vp-revenue-m-f-d',
          title: 'VP Revenue (m/f/d)',
          createdAt: '2026-06-15T16:44:22.659Z',
          workplaceType: 'HYBRID',
          languageId: 5,
          city: { cityName: 'Berlin', regionName: 'Berlin', countryName: 'Germany' },
          country: { name: 'Germany' },
        },
        source,
        'join',
      ),
    ).toEqual({
      provider: 'join',
      externalId: '16312205',
      title: 'VP Revenue (m/f/d)',
      companyName: 'Acme',
      location: 'Berlin, Germany',
      locations: ['Berlin, Germany'],
      workMode: 'Hybrid',
      url: 'https://join.com/companies/join/16425272-vp-revenue-m-f-d',
      postedAt: new Date('2026-06-15T16:44:22.659Z'),
      contentLanguage: 'en',
    })
  })

  it('flags remote roles, falls back to the country, and drops jobs without an idParam', () => {
    const job = provider.normalize(
      {
        id: 5,
        idParam: '5-pm',
        title: 'PM',
        workplaceType: 'REMOTE',
        languageId: 1,
        country: { name: 'Germany' },
      },
      source,
      'acme',
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.location).toBe('Germany')
    expect(job?.contentLanguage).toBe('de')
    expect(job?.postedAt).toBeNull()
    // An unknown languageId falls through to null rather than a bogus code.
    expect(
      provider.normalize({ id: 6, idParam: '6-x', title: 'X', languageId: 999 }, source, 'acme')
        ?.contentLanguage,
    ).toBeNull()
    expect(
      provider.normalize({ id: 5, title: 'No idParam' }, source, 'acme'),
    ).toBeNull()
  })
})

describe('WorkdayProvider.normalize', () => {
  const provider = new WorkdayProvider()
  const workday = { externalId: 'nvidia:wd5:NVIDIAExternalCareerSite', companyName: 'NVIDIA' }

  it('builds the apply URL from the compound handle and external path', () => {
    expect(
      provider.normalize(
        {
          title: 'Senior ASIC Timing Engineer',
          externalPath: '/job/US-MA-Westford/Senior-ASIC-Timing-Engineer_JR2011363-1',
          locationsText: 'US-MA-Westford',
          bulletFields: ['JR2011363'],
        },
        workday,
      ),
    ).toEqual({
      provider: 'workday',
      externalId: 'JR2011363',
      title: 'Senior ASIC Timing Engineer',
      companyName: 'NVIDIA',
      location: 'US-MA-Westford',
      locations: ['US-MA-Westford'],
      workMode: null,
      url: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-MA-Westford/Senior-ASIC-Timing-Engineer_JR2011363-1',
      postedAt: null,
    })
  })

  it('drops a location count, falls back to the external path for id, and drops incomplete postings', () => {
    const job = provider.normalize(
      { title: 'PM', externalPath: '/job/remote/PM_JR1', locationsText: '3 Locations' },
      workday,
    )
    expect(job?.location).toBeNull()
    expect(job?.locations).toEqual([])
    expect(job?.externalId).toBe('/job/remote/PM_JR1')
    expect(provider.normalize({ title: 'No path' }, workday)).toBeNull()
  })
})

describe('JobPostingProvider.normalize', () => {
  const provider = new JobPostingProvider()
  const page = { externalId: 'https://acme.example/careers', companyName: 'Acme' }

  it('maps a schema.org JobPosting into a normalized job', () => {
    expect(
      provider.normalize(
        {
          '@type': 'JobPosting',
          title: 'Staff Engineer',
          url: 'https://acme.example/jobs/staff-engineer',
          datePosted: '2026-05-01',
          identifier: { value: 'REQ-42' },
          hiringOrganization: { name: 'Acme Inc' },
          inLanguage: 'de-DE',
          jobLocation: [
            { address: { addressLocality: 'Berlin', addressCountry: 'DE' } },
            { address: { addressLocality: 'Munich', addressCountry: { name: 'Germany' } } },
          ],
        },
        page,
      ),
    ).toEqual({
      provider: 'jobposting',
      externalId: 'REQ-42',
      title: 'Staff Engineer',
      companyName: 'Acme Inc',
      location: 'Berlin, DE',
      locations: ['Berlin, DE', 'Munich, Germany'],
      workMode: null,
      url: 'https://acme.example/jobs/staff-engineer',
      postedAt: new Date('2026-05-01'),
      contentLanguage: 'de',
    })
  })

  it('reads inLanguage as a Language object and ignores a plain language name', () => {
    const fromObject = provider.normalize(
      {
        '@type': 'JobPosting',
        title: 'PM',
        url: 'https://acme.example/jobs/pm',
        inLanguage: { name: 'en' },
      },
      page,
    )
    expect(fromObject?.contentLanguage).toBe('en')
    const fromName = provider.normalize(
      {
        '@type': 'JobPosting',
        title: 'PM',
        url: 'https://acme.example/jobs/pm2',
        inLanguage: 'German',
      },
      page,
    )
    expect(fromName?.contentLanguage).toBeNull()
  })

  it('flags telecommute, falls back to the page URL and source company, and drops untitled postings', () => {
    const job = provider.normalize(
      { '@type': 'JobPosting', title: 'PM', jobLocationType: 'TELECOMMUTE' },
      page,
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.companyName).toBe('Acme')
    expect(job?.url).toBe('https://acme.example/careers')
    expect(job?.externalId).toBe('https://acme.example/careers')
    expect(provider.normalize({ '@type': 'JobPosting', url: 'https://acme.example/x' }, page)).toBeNull()
  })
})

describe('TraffitProvider.normalize', () => {
  const provider = new TraffitProvider()

  it('maps a published job post into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: 27,
          url: 'https://infer.traffit.com/public/an/8c5d8ad1?source=career_page',
          application_form: 'https://infer.traffit.com/public/form/a/24298c81?source=career_page',
          valid_start: '2026-07-07 17:08:14',
          advert: { id: 41, name: 'People & Culture Generalist', language: 'en', locations: [] },
          options: { job_type: ['Full time'], _location: 'Poland', _department: 'People & Culture' },
        },
        source,
      ),
    ).toEqual({
      provider: 'traffit',
      externalId: '27',
      title: 'People & Culture Generalist',
      companyName: 'Acme',
      location: 'Poland',
      locations: ['Poland'],
      workMode: null,
      url: 'https://infer.traffit.com/public/an/8c5d8ad1?source=career_page',
      postedAt: new Date('2026-07-07 17:08:14'),
      contentLanguage: 'en',
    })
  })

  it('reads structured locations, flags remote, falls back to the apply form, and drops incomplete posts', () => {
    const job = provider.normalize(
      {
        id: 5,
        application_form: 'https://infer.traffit.com/public/form/a/xyz',
        advert: {
          name: 'Backend Engineer',
          language: 'PL',
          locations: [{ city: 'Kraków', country: 'Poland' }, 'Remote'],
        },
      },
      source,
    )
    expect(job?.workMode).toBe('Remote')
    expect(job?.location).toBe('Kraków, Poland')
    expect(job?.locations).toEqual(['Kraków, Poland', 'Remote'])
    // No public `url`, so the apply-form link stands in.
    expect(job?.url).toBe('https://infer.traffit.com/public/form/a/xyz')
    expect(job?.contentLanguage).toBe('pl')
    expect(job?.postedAt).toBeNull()
    expect(provider.normalize({ id: 5, advert: { name: 'No url' } }, source)).toBeNull()
    expect(
      provider.normalize({ advert: { name: 'No id' }, url: 'https://x.traffit.com/a' }, source),
    ).toBeNull()
  })
})

describe('AdzunaProvider', () => {
  const provider = new AdzunaProvider()

  it('maps a search result into a normalized job', () => {
    expect(
      provider.normalize({
        id: '5008254793',
        title: 'Senior Product Manager (Remote)',
        created: '2026-07-08T09:00:00Z',
        redirect_url: 'https://www.adzuna.de/land/ad/5008254793',
        company: { display_name: 'Resourcify' },
        location: { display_name: 'Berlin, Germany', area: ['Germany', 'Berlin'] },
      }),
    ).toEqual({
      provider: 'adzuna',
      externalId: '5008254793',
      title: 'Senior Product Manager (Remote)',
      companyName: 'Resourcify',
      location: 'Berlin, Germany',
      locations: ['Berlin, Germany'],
      // Inferred from "(Remote)" in the title — Adzuna has no remote flag.
      workMode: 'Remote',
      url: 'https://www.adzuna.de/land/ad/5008254793',
      postedAt: new Date('2026-07-08T09:00:00Z'),
    })
  })

  it('leaves work mode null on-site and drops results missing a redirect URL or company', () => {
    const job = provider.normalize({
      id: '1',
      title: 'PM',
      created: '2026-07-08T09:00:00Z',
      redirect_url: 'https://www.adzuna.de/land/ad/1',
      company: { display_name: 'Acme' },
      location: { display_name: 'Munich, Germany' },
    })
    expect(job?.workMode).toBeNull()
    expect(provider.normalize({ id: '1', title: 'No url', company: { display_name: 'Acme' } })).toBeNull()
    expect(
      provider.normalize({ id: '1', title: 'No company', redirect_url: 'https://x.example/1' }),
    ).toBeNull()
  })

  it('is disabled without credentials and enabled once both are set', () => {
    const priorId = process.env.ADZUNA_APP_ID
    const priorKey = process.env.ADZUNA_APP_KEY
    delete process.env.ADZUNA_APP_ID
    delete process.env.ADZUNA_APP_KEY
    expect(provider.isEnabled()).toBe(false)
    process.env.ADZUNA_APP_ID = 'id'
    expect(provider.isEnabled()).toBe(false)
    process.env.ADZUNA_APP_KEY = 'key'
    expect(provider.isEnabled()).toBe(true)
    if (priorId === undefined) delete process.env.ADZUNA_APP_ID
    else process.env.ADZUNA_APP_ID = priorId
    if (priorKey === undefined) delete process.env.ADZUNA_APP_KEY
    else process.env.ADZUNA_APP_KEY = priorKey
  })

  it('fetches nothing when unconfigured', async () => {
    const priorId = process.env.ADZUNA_APP_ID
    const priorKey = process.env.ADZUNA_APP_KEY
    delete process.env.ADZUNA_APP_ID
    delete process.env.ADZUNA_APP_KEY
    await expect(provider.fetchListings()).resolves.toEqual([])
    if (priorId !== undefined) process.env.ADZUNA_APP_ID = priorId
    if (priorKey !== undefined) process.env.ADZUNA_APP_KEY = priorKey
  })
})

describe('BambooHrProvider', () => {
  const provider = new BambooHrProvider()

  it('extracts the account handle from a careers URL and ignores platform hosts', () => {
    expect(provider.handleFromUrl('https://beehiiv.bamboohr.com/careers')).toBe('beehiiv')
    expect(provider.handleFromUrl('https://beehiiv.bamboohr.com/careers/58')).toBe('beehiiv')
    expect(provider.handleFromUrl('https://staticfe.bamboohr.com/resources/x.png')).toBeNull()
    expect(provider.handleFromUrl('https://example.com/careers')).toBeNull()
  })

  it('builds the public job URL from the handle and id', () => {
    expect(
      provider.normalize(
        {
          id: 58,
          jobOpeningName: 'Senior Product Marketing Manager (global)',
          atsLocation: { city: 'Berlin', province: null, country: 'Germany' },
          isRemote: null,
        },
        { externalId: 'beehiiv', companyName: 'beehiiv' },
      ),
    ).toEqual({
      provider: 'bamboohr',
      externalId: '58',
      title: 'Senior Product Marketing Manager (global)',
      companyName: 'beehiiv',
      location: 'Berlin, Germany',
      locations: ['Berlin, Germany'],
      workMode: null,
      url: 'https://beehiiv.bamboohr.com/careers/58',
      postedAt: null,
    })
  })

  it('marks remote roles and drops incomplete jobs', () => {
    const remote = provider.normalize(
      { id: 1, jobOpeningName: 'Engineer', isRemote: true },
      { externalId: 'beehiiv', companyName: 'beehiiv' },
    )
    expect(remote?.workMode).toBe('Remote')
    expect(remote?.location).toBeNull()
    expect(
      provider.normalize({ jobOpeningName: 'No id' }, { externalId: 'x', companyName: 'X' }),
    ).toBeNull()
  })
})

describe('PinpointProvider', () => {
  const provider = new PinpointProvider()

  it('extracts the account handle from a careers URL and ignores platform hosts', () => {
    expect(provider.handleFromUrl('https://safetywing.pinpointhq.com/')).toBe('safetywing')
    expect(provider.handleFromUrl('https://safetywing.pinpointhq.com/en/postings/abc')).toBe(
      'safetywing',
    )
    expect(provider.handleFromUrl('https://app.pinpointhq.com/x')).toBeNull()
  })

  it('maps a posting into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: '411131',
          title: 'Global B2B Insurance Partner',
          url: 'https://safetywing.pinpointhq.com/en/postings/0bff0bfe',
          location: { name: 'Remote' },
          workplace_type: 'remote',
          published_at: '2026-05-01T00:00:00Z',
        },
        { externalId: 'safetywing', companyName: 'Safetywing' },
      ),
    ).toEqual({
      provider: 'pinpoint',
      externalId: '411131',
      title: 'Global B2B Insurance Partner',
      companyName: 'Safetywing',
      location: 'Remote',
      locations: ['Remote'],
      workMode: 'Remote',
      url: 'https://safetywing.pinpointhq.com/en/postings/0bff0bfe',
      postedAt: new Date('2026-05-01T00:00:00Z'),
    })
  })

  it('maps workplace types and drops incomplete postings', () => {
    const hybrid = provider.normalize(
      { id: 2, title: 'PM', url: 'https://x.pinpointhq.com/postings/2', workplace_type: 'hybrid' },
      { externalId: 'x', companyName: 'X' },
    )
    expect(hybrid?.workMode).toBe('Hybrid')
    expect(
      provider.normalize(
        { id: 3, title: 'No url' },
        { externalId: 'x', companyName: 'X' },
      ),
    ).toBeNull()
  })
})

describe('AshbyProvider.normalizeGraphql', () => {
  const provider = new AshbyProvider()

  it('maps a GraphQL brief and synthesizes the hosted job URL', () => {
    expect(
      provider.normalizeGraphql(
        {
          id: 'c7509615-34bb-4ca8-b6a0-adbdb63f6c1a',
          title: 'Account Executive',
          locationName: 'San Francisco, CA',
          workplaceType: 'Hybrid',
          secondaryLocations: [{ locationName: 'New York, NY' }, { locationName: 'Los Angeles, CA' }],
        },
        { externalId: 'whatnot', companyName: 'Whatnot' },
      ),
    ).toEqual({
      provider: 'ashby',
      externalId: 'c7509615-34bb-4ca8-b6a0-adbdb63f6c1a',
      title: 'Account Executive',
      companyName: 'Whatnot',
      location: 'San Francisco, CA',
      locations: ['San Francisco, CA', 'New York, NY', 'Los Angeles, CA'],
      workMode: 'Hybrid',
      url: 'https://jobs.ashbyhq.com/whatnot/c7509615-34bb-4ca8-b6a0-adbdb63f6c1a',
      postedAt: null,
    })
  })

  it('maps remote/null workplace types and drops incomplete postings', () => {
    expect(
      provider.normalizeGraphql(
        { id: '1', title: 'Remote Eng', workplaceType: 'Remote' },
        { externalId: 'whatnot', companyName: 'Whatnot' },
      )?.workMode,
    ).toBe('Remote')
    expect(
      provider.normalizeGraphql(
        { id: '2', title: 'Unknown mode', workplaceType: null as unknown as undefined },
        { externalId: 'whatnot', companyName: 'Whatnot' },
      )?.workMode,
    ).toBeNull()
    expect(
      provider.normalizeGraphql({ title: 'No id' }, { externalId: 'whatnot', companyName: 'Whatnot' }),
    ).toBeNull()
  })
})

describe('BreezyProvider', () => {
  const provider = new BreezyProvider()

  it('extracts the account handle from a careers URL and ignores platform hosts', () => {
    expect(provider.handleFromUrl('https://cal-com.breezy.hr/')).toBe('cal-com')
    expect(provider.handleFromUrl('https://cal-com.breezy.hr/p/0b1f47fd2534-chief-of-staff')).toBe(
      'cal-com',
    )
    expect(provider.handleFromUrl('https://www.breezy.hr/')).toBeNull()
    expect(provider.handleFromUrl('https://example.com/careers')).toBeNull()
  })

  it('maps a position into a normalized job', () => {
    expect(
      provider.normalize(
        {
          id: '0b1f47fd2534',
          name: 'Chief of Staff to Head of GTM',
          url: 'https://cal-com.breezy.hr/p/0b1f47fd2534-chief-of-staff',
          published_date: '2026-07-02T09:24:20.573Z',
          location: { name: 'New York, NY', is_remote: true, remote_details: { value: 'hybrid' } },
          locations: [{ name: 'New York, NY' }, { name: 'Remote (US)' }],
        },
        { externalId: 'cal-com', companyName: 'cal.com' },
      ),
    ).toEqual({
      provider: 'breezy',
      externalId: '0b1f47fd2534',
      title: 'Chief of Staff to Head of GTM',
      companyName: 'cal.com',
      location: 'New York, NY',
      locations: ['New York, NY', 'Remote (US)'],
      workMode: 'Hybrid',
      url: 'https://cal-com.breezy.hr/p/0b1f47fd2534-chief-of-staff',
      postedAt: new Date('2026-07-02T09:24:20.573Z'),
    })
  })

  it('maps remote types and drops incomplete positions', () => {
    const remote = provider.normalize(
      {
        id: '5',
        name: 'Engineer',
        url: 'https://x.breezy.hr/p/5',
        location: { name: 'Anywhere', remote_details: { value: 'remote' } },
      },
      { externalId: 'x', companyName: 'X' },
    )
    expect(remote?.workMode).toBe('Remote')
    expect(
      provider.normalize({ id: '6', name: 'No url' }, { externalId: 'x', companyName: 'X' }),
    ).toBeNull()
  })
})

describe('BlueskyProvider', () => {
  const provider = new BlueskyProvider()

  it('canonicalizes any bsky.social careers URL and ignores everything else', () => {
    expect(provider.handleFromUrl('https://bsky.social/about/join')).toBe(
      'https://bsky.social/about/join',
    )
    expect(provider.handleFromUrl('https://bsky.social/careers')).toBe(
      'https://bsky.social/about/join',
    )
    expect(provider.handleFromUrl('https://jobs.gem.com/bluesky')).toBeNull()
    expect(provider.handleFromUrl('https://example.com/bsky.social.fake')).toBeNull()
  })

  it('extracts props.pageProps.jobs from the Next.js data blob and shrugs off bad shapes', () => {
    const html =
      '<html><script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({ props: { pageProps: { jobs: [{ id: 'a', title: 'Eng' }] } } }) +
      '</script></html>'
    expect(jobsFromHtml(html)).toEqual([{ id: 'a', title: 'Eng' }])
    expect(jobsFromHtml('<html>no blob</html>')).toEqual([])
    expect(
      jobsFromHtml('<script id="__NEXT_DATA__">{not json}</script>'),
    ).toEqual([])
  })

  it('maps a posting and infers work mode from location fields', () => {
    expect(
      provider.normalize(
        {
          id: 'am9icG9zdDphhWUr1pfGGKre7yshW0Dg',
          title: 'Senior Backend Developer, Platform/Infrastructure',
          department: 'Engineering',
          location: 'United States - Remote',
          locationType: 'Remote (overlap with PST)',
          employmentType: 'Full-time',
          applyUrl: 'https://jobs.gem.com/bluesky/am9icG9zdDphhWUr1pfGGKre7yshW0Dg',
          updatedAt: '2026-07-22T01:03:01.299Z',
        },
        { externalId: 'https://bsky.social/about/join', companyName: 'Bluesky' },
      ),
    ).toEqual({
      provider: 'bluesky',
      externalId: 'am9icG9zdDphhWUr1pfGGKre7yshW0Dg',
      title: 'Senior Backend Developer, Platform/Infrastructure',
      companyName: 'Bluesky',
      location: 'United States - Remote',
      locations: ['United States - Remote'],
      workMode: 'Remote',
      url: 'https://jobs.gem.com/bluesky/am9icG9zdDphhWUr1pfGGKre7yshW0Dg',
      postedAt: new Date('2026-07-22T01:03:01.299Z'),
    })
  })

  it('drops postings missing an id, title, or apply URL', () => {
    const source = { externalId: 'https://bsky.social/about/join', companyName: 'Bluesky' }
    expect(provider.normalize({ id: 'x', title: 'No apply' }, source)).toBeNull()
    expect(
      provider.normalize({ title: 'No id', applyUrl: 'https://jobs.gem.com/bluesky/x' }, source),
    ).toBeNull()
  })
})
