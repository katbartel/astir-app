import { AdzunaProvider } from './adzuna.provider'
import { ArbeitnowProvider } from './arbeitnow.provider'
import { AshbyProvider } from './ashby.provider'
import { BambooHrProvider } from './bamboohr.provider'
import { BlueskyProvider, jobsFromHtml } from './bluesky.provider'
import { BreezyProvider } from './breezy.provider'
import {
  CareerPageProvider,
  deelJobsFromHtml,
  jobsFromCareerPageHtml,
  lumenaltaJobsFromHtml,
  tigerDataJobsFromPayload,
} from './careerpage.provider'
import { ComeetProvider, comeetJobsFromHtml } from './comeet.provider'
import { GemProvider } from './gem.provider'
import { GreenhouseProvider, greenhouseEuJobsFromHtml } from './greenhouse.provider'
import { JazzHrProvider, jazzHrJobsFromHtml } from './jazzhr.provider'
import { JobPostingProvider } from './jobposting.provider'
import { JoinProvider } from './join.provider'
import { LeverProvider } from './lever.provider'
import { McKinseyProvider } from './mckinsey.provider'
import { PersonioProvider } from './personio.provider'
import { PinpointProvider } from './pinpoint.provider'
import { RecruiteeProvider } from './recruitee.provider'
import { RipplingProvider, ripplingJobsFromApi, ripplingJobsFromHtml } from './rippling.provider'
import { SmartRecruitersProvider } from './smartrecruiters.provider'
import { TeamtailorProvider } from './teamtailor.provider'
import { TheMuseProvider } from './themuse.provider'
import { TraffitProvider } from './traffit.provider'
import { WorkableProvider } from './workable.provider'
import { WorkdayProvider } from './workday.provider'
import { ZohoRecruitProvider, zohoRecruitJobsFromHtml } from './zohorecruit.provider'

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

  it('extracts EU Greenhouse handles and jobs from the rendered board payload', () => {
    expect(provider.handleFromUrl('https://job-boards.eu.greenhouse.io/creativefabrica')).toBe(
      'eu:creativefabrica',
    )
    const html = `<script>window.__remixContext = {"state":{"loaderData":{"routes/$url_token":{"jobPosts":{"data":[{"id":4933376101,"title":"Senior Data Analyst","location":"Remote","absolute_url":"https://job-boards.eu.greenhouse.io/creativefabrica/jobs/4933376101","published_at":"2026-07-21T04:55:48-04:00"}]}}}}};</script>`
    expect(greenhouseEuJobsFromHtml(html, { externalId: 'eu:creativefabrica', companyName: 'Creative Fabrica' })).toEqual([
      {
        provider: 'greenhouse',
        externalId: '4933376101',
        title: 'Senior Data Analyst',
        companyName: 'Creative Fabrica',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: 'https://job-boards.eu.greenhouse.io/creativefabrica/jobs/4933376101',
        postedAt: new Date('2026-07-21T04:55:48-04:00'),
      },
    ])
  })
})

describe('AshbyProvider.normalize', () => {
  const provider = new AshbyProvider()

  it('preserves dotted org handles from Ashby URLs', () => {
    expect(provider.handleFromUrl('https://jobs.ashbyhq.com/doxy.me')).toBe('doxy.me')
    expect(provider.handleFromUrl('https://api.ashbyhq.com/posting-api/job-board/doxy.me')).toBe(
      'doxy.me',
    )
  })

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

  it('joins city and country and drops jobs without any id', () => {
    const job = provider.normalize(
      { title: 'PM', shortcode: 'A1', url: 'https://x.example/1', city: 'Athens', country: 'Greece' },
      'Blueground',
    )
    expect(job?.location).toBe('Athens, Greece')
    expect(provider.normalize({ title: 'No shortcode' }, 'Blueground')).toBeNull()
  })

  it('recognizes and maps public Workable company-page jobs', () => {
    expect(
      provider.handleFromUrl('https://jobs.workable.com/company/72NtGFPramsp9SiaoUitKh/jobs-at-onthegosystems'),
    ).toBe('company:72NtGFPramsp9SiaoUitKh/jobs-at-onthegosystems')
    expect(
      provider.normalize(
        {
          id: '521f4bbc-6af5-42fb-b384-b958492506f7',
          title: 'Data Analyst - AI Translation Quality',
          url: 'https://jobs.workable.com/view/b9aEQr2Ga7T5ckfX5cHDuk/remote-data-analyst',
          location: { locationStr: 'Warsaw, Masovian Voivodeship, Poland' },
          locationsText: 'Remote Warsaw, Masovian Voivodeship, Poland',
          published: '2026-07-27T12:00:00.000Z',
        },
        'OnTheGoSystems',
      ),
    ).toEqual({
      provider: 'workable',
      externalId: '521f4bbc-6af5-42fb-b384-b958492506f7',
      title: 'Data Analyst - AI Translation Quality',
      companyName: 'OnTheGoSystems',
      location: 'Warsaw, Masovian Voivodeship, Poland',
      locations: ['Warsaw, Masovian Voivodeship, Poland', 'Remote Warsaw, Masovian Voivodeship, Poland'],
      workMode: 'Remote',
      url: 'https://jobs.workable.com/view/b9aEQr2Ga7T5ckfX5cHDuk/remote-data-analyst',
      postedAt: new Date('2026-07-27T12:00:00.000Z'),
    })
  })
})

describe('LeverProvider.normalize', () => {
  const provider = new LeverProvider()

  it('preserves dotted board handles from Lever URLs', () => {
    expect(provider.handleFromUrl('https://jobs.lever.co/Smile.io')).toBe('Smile.io')
    expect(provider.handleFromUrl('https://jobs.lever.co/ro/bde27362-0652')).toBe('ro')
  })

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

  it('recognizes configured Teamtailor vanity domains', () => {
    expect(provider.handleFromUrl('https://careers.akeneo.com/jobs')).toBe('careers.akeneo.com')
    expect(provider.handleFromUrl('https://careers.cafeyn.co/jobs')).toBe('careers.cafeyn.co')
    expect(provider.handleFromUrl('https://careers.dare.global/jobs')).toBe('careers.dare.global')
    expect(provider.handleFromUrl('https://careers.flexciton.com/jobs')).toBe('careers.flexciton.com')
    expect(provider.handleFromUrl('https://careers.mnemonic.io/jobs')).toBe('careers.mnemonic.io')
    expect(provider.handleFromUrl('https://careers.viaplaygroup.com/jobs')).toBe('careers.viaplaygroup.com')
    expect(provider.handleFromUrl('https://career.bannerflow.com/jobs')).toBe('career.bannerflow.com')
    expect(provider.handleFromUrl('https://career.optiveum.com/jobs')).toBe('career.optiveum.com')
    expect(provider.handleFromUrl('https://jobs.efficy.com/jobs')).toBe('jobs.efficy.com')
    expect(provider.handleFromUrl('https://teamtailor.kilo.co/jobs')).toBe('teamtailor.kilo.co')
  })
})

describe('JazzHrProvider', () => {
  const provider = new JazzHrProvider()

  it('extracts the ApplyToJob handle from a careers URL', () => {
    expect(provider.handleFromUrl('https://busbud.applytojob.com/apply')).toBe('busbud')
    expect(provider.handleFromUrl('https://example.com/apply')).toBeNull()
  })

  it('extracts jobs from ApplyToJob list markup', () => {
    expect(
      jazzHrJobsFromHtml(
        '<h3 class="list-group-item-heading"><a href="https://busbud.applytojob.com/apply/KcdYScqq1Y/Senior-FullStack-Developer--Chile">Senior Full-Stack Developer - Chile</a></h3><ul class="list-inline list-group-item-text"><li><i class="fa fa-map-marker"></i>Remote</li></ul>',
        { externalId: 'busbud', companyName: 'Busbud' },
      ),
    ).toEqual([
      {
        provider: 'jazzhr',
        externalId: 'jazzhr:Senior-FullStack-Developer--Chile',
        title: 'Senior Full-Stack Developer - Chile',
        companyName: 'Busbud',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: 'https://busbud.applytojob.com/apply/KcdYScqq1Y/Senior-FullStack-Developer--Chile',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
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

  it('uses Personio date fields when the feed carries them', () => {
    const job = provider.normalize(
      { id: 6, name: 'PM', office: 'Berlin', published_at: '2026-07-26T10:00:00Z' },
      source,
      'acme.jobs.personio.com',
    )
    expect(job?.postedAt).toEqual(new Date('2026-07-26T10:00:00Z'))
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

  it('keeps paginating when Workday only reports total on the first page', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 21,
          jobPostings: Array.from({ length: 20 }, (_, index) => ({
            title: `Role ${index}`,
            externalPath: `/job/London/Role-${index}_JR${index}`,
            locationsText: 'London',
            bulletFields: [`JR${index}`],
          })),
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 0,
          jobPostings: [
            {
              title: 'Role 20',
              externalPath: '/job/London/Role-20_JR20',
              locationsText: 'London',
              bulletFields: ['JR20'],
            },
          ],
        }),
      } as Response)

    await expect(
      provider.fetchListings({
        externalId: 'blackline:wd108:BlackLineCareers',
        companyName: 'BlackLine',
      }),
    ).resolves.toHaveLength(21)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    fetchMock.mockRestore()
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

  it('fills missing list data from detail page structured data', () => {
    expect(
      provider.normalize(
        { id: 43, jobOpeningName: 'Technical Product Manager', isRemote: null },
        { externalId: 'slite', companyName: 'Slite' },
        {
          location: 'Remote',
          locations: ['Remote', 'Europe'],
          workMode: 'Remote',
          postedAt: new Date('2026-07-24T00:00:00Z'),
        },
      ),
    ).toEqual({
      provider: 'bamboohr',
      externalId: '43',
      title: 'Technical Product Manager',
      companyName: 'Slite',
      location: 'Remote',
      locations: ['Remote', 'Europe'],
      workMode: 'Remote',
      url: 'https://slite.bamboohr.com/careers/43',
      postedAt: new Date('2026-07-24T00:00:00Z'),
    })
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

describe('GemProvider', () => {
  const provider = new GemProvider()

  it('extracts the board path from Gem careers URLs', () => {
    expect(provider.handleFromUrl('https://jobs.gem.com/roamless')).toBe('roamless')
    expect(provider.handleFromUrl('https://jobs.gem.com/roamless/job-id')).toBe('roamless')
    expect(provider.handleFromUrl('https://example.com/roamless')).toBeNull()
  })

  it('maps a Gem posting', () => {
    expect(
      provider.normalize(
        {
          extId: 'am9icG9zdDqSNoY4eCddmgZ09M8pDXR7',
          title: 'Influencer Marketing Manager',
          locations: [
            { name: 'Turkey', city: '', isoCountry: 'TUR', isRemote: true },
            { name: 'Istanbul ', city: 'Istanbul', isoCountry: 'TUR', isRemote: true },
          ],
          job: { locationType: 'REMOTE', employmentType: 'FULL_TIME' },
        },
        { externalId: 'roamless', companyName: 'Roamless' },
      ),
    ).toEqual({
      provider: 'gem',
      externalId: 'am9icG9zdDqSNoY4eCddmgZ09M8pDXR7',
      title: 'Influencer Marketing Manager',
      companyName: 'Roamless',
      location: 'Turkey',
      locations: ['Turkey', 'Istanbul'],
      workMode: 'Remote',
      url: 'https://jobs.gem.com/roamless/am9icG9zdDqSNoY4eCddmgZ09M8pDXR7',
      postedAt: null,
    })
  })
})

describe('CareerPageProvider', () => {
  const provider = new CareerPageProvider()

  it('only claims known static career pages', () => {
    expect(provider.handleFromUrl('https://www.cerbos.dev/join-us')).toBe('https://www.cerbos.dev/join-us')
    expect(provider.handleFromUrl('https://career.luxoft.com/jobs')).toBe('https://career.luxoft.com/jobs')
    expect(provider.handleFromUrl('https://lumenalta.com/remote-jobs')).toBe('https://lumenalta.com/remote-jobs')
    expect(provider.handleFromUrl('https://liveblocks.io/careers')).toBe('https://liveblocks.io/careers')
    expect(provider.handleFromUrl('https://www.sketch.com/careers/')).toBe('https://www.sketch.com/careers/')
    expect(provider.handleFromUrl('https://bobsled.com/company#open-positions')).toBe(
      'https://bobsled.com/company#open-positions',
    )
    expect(provider.handleFromUrl('https://jobs.renesas.com/altium-careers')).toBe(
      'https://jobs.renesas.com/altium-careers',
    )
    expect(provider.handleFromUrl('https://jobs.experian.com/jobs')).toBe('https://jobs.experian.com/jobs')
    expect(provider.handleFromUrl('https://jobs.deel.com/cardo')).toBe('https://jobs.deel.com/cardo')
    expect(provider.handleFromUrl('https://status.app/jobs')).toBe('https://status.app/jobs')
    expect(provider.handleFromUrl('https://helply.com/careers')).toBe('https://helply.com/careers')
    expect(provider.handleFromUrl('https://www.scalerrs.co/careers')).toBe('https://www.scalerrs.co/careers')
    expect(provider.handleFromUrl('https://levity.ai/en/about#jobs')).toBe('https://levity.ai/en/about#jobs')
    expect(provider.handleFromUrl('https://jobs.bendingspoons.com/')).toBe('https://jobs.bendingspoons.com/')
    expect(provider.handleFromUrl('https://www.veed.io/careers')).toBe('https://www.veed.io/careers')
    expect(provider.handleFromUrl('https://www.tigerdata.com/careers')).toBe('https://www.tigerdata.com/careers')
    expect(provider.handleFromUrl('https://www.getbumpa.com/career')).toBe('https://www.getbumpa.com/career')
    expect(provider.handleFromUrl('https://www.xogito.com/jobs/')).toBe('https://www.xogito.com/jobs/')
    expect(provider.handleFromUrl('https://tuple.app/jobs')).toBe('https://tuple.app/jobs')
    expect(provider.handleFromUrl('https://www.ynab.com/careers#openings')).toBe(
      'https://www.ynab.com/careers#openings',
    )
    expect(provider.handleFromUrl('https://www.getharvest.com/careers')).toBe('https://www.getharvest.com/careers')
    expect(provider.handleFromUrl('https://meetedgar.com/careers')).toBe('https://meetedgar.com/careers')
    expect(provider.handleFromUrl('https://jobs.mimo.org/')).toBe('https://jobs.mimo.org/')
    expect(provider.handleFromUrl('https://careers.promaton.com/')).toBe('https://careers.promaton.com/')
    expect(provider.handleFromUrl('https://example.com/careers')).toBeNull()
  })

  it('verifies known empty career pages so they can be tracked before roles exist', async () => {
    await expect(provider.verifyHandle('https://tuple.app/jobs')).resolves.toBe(true)
    await expect(provider.verifyHandle('https://www.ynab.com/careers#openings')).resolves.toBe(true)
    await expect(provider.verifyHandle('https://example.com/careers')).resolves.toBe(false)
  })

  it('extracts the Cerbos open role from the rendered careers page', () => {
    expect(
      jobsFromCareerPageHtml(
        'Current Open Roles Senior Front End Engineer (Remote) At Cerbos, we are seeking an experienced engineer.',
        { externalId: 'https://www.cerbos.dev/join-us', companyName: 'Cerbos' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'cerbos:senior-front-end-engineer-remote',
        title: 'Senior Front End Engineer (Remote)',
        companyName: 'Cerbos',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: 'https://www.cerbos.dev/join-us',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Liveblocks roles from its static careers page', () => {
    expect(
      jobsFromCareerPageHtml(
        '<section id="open-roles"><p class="font-medium text-marketing">GTM Growth Lead</p><p class="text-marketing-subtle">Remote</p><a href="/careers/gtm-growth-lead">View role</a></section>',
        { externalId: 'https://liveblocks.io/careers', companyName: 'Liveblocks' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'liveblocks:gtm-growth-lead',
        title: 'GTM Growth Lead',
        companyName: 'Liveblocks',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: 'https://liveblocks.io/careers/gtm-growth-lead',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Sketch roles from its static careers page', () => {
    expect(
      jobsFromCareerPageHtml(
        '<div class="grid-table__item job"><a href="https://sketch-hq.notion.site/Open-application" class="job__column job__position"><span>Open application</span></a><div class="job__column job__department">Any team</div><div class="job__column job__commitment">Full time</div><div class="job__column job_timezone">European Union / United States</div></div>',
        { externalId: 'https://www.sketch.com/careers/', companyName: 'Sketch' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'sketch:open-application',
        title: 'Open application',
        companyName: 'Sketch',
        location: 'European Union / United States',
        locations: ['European Union / United States'],
        workMode: null,
        url: 'https://sketch-hq.notion.site/Open-application',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Attrax roles from rendered vacancy tiles', () => {
    expect(
      jobsFromCareerPageHtml(
        '<div class="attrax-vacancy-tile attrax-vacancy-tile--germany attrax-vacancy-tile--altium" data-jobid="6257"><a aria-level="3" class="attrax-vacancy-tile__title attrax-vacancy-tile__item attrax-button" href="/job/staff-strategic-account-manager-w-m-d-in-munich-germany-jid-6257" role="heading" tabindex="0">Staff Strategic Account Manager (w/m/d)</a><div class="attrax-vacancy-tile__location-freetext attrax-vacancy-tile__item"><p class="attrax-vacancy-tile__item-label">Location</p><p class="attrax-vacancy-tile__item-value">Munich, Germany</p></div><div class="attrax-vacancy-tile__option-role-type attrax-vacancy-tile__item"><p class="attrax-vacancy-tile__option-role-type-label attrax-vacancy-tile__item-label">Role Type</p><div class="attrax-vacancy-tile__option-role-type-valueset attrax-vacancy-tile__item-valueset"><p class="attrax-vacancy-tile__item-value">Hybrid</p></div></div></div>',
        { externalId: 'https://jobs.renesas.com/altium-careers', companyName: 'Altium' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'attrax:6257',
        title: 'Staff Strategic Account Manager (w/m/d)',
        companyName: 'Altium',
        location: 'Munich, Germany',
        locations: ['Munich, Germany'],
        workMode: 'Hybrid',
        url: 'https://jobs.renesas.com/job/staff-strategic-account-manager-w-m-d-in-munich-germany-jid-6257',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Bobsled roles from rendered Ashby links', () => {
    expect(
      jobsFromCareerPageHtml(
        '<a href="https://jobs.ashbyhq.com/Bobsled/fdda4ddc-27a1-427c-81d5-77f7ec445271" rel="noopener" class="block py-6"><div><h4 class="text-xl text-midnight">AI Engineer</h4></div><p class="mt-1 text-[#868494]">Remote (US)</p></a>',
        { externalId: 'https://bobsled.com/company#open-positions', companyName: 'Bobsled' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'bobsled:fdda4ddc-27a1-427c-81d5-77f7ec445271',
        title: 'AI Engineer',
        companyName: 'Bobsled',
        location: 'Remote (US)',
        locations: ['Remote (US)'],
        workMode: 'Remote',
        url: 'https://jobs.ashbyhq.com/Bobsled/fdda4ddc-27a1-427c-81d5-77f7ec445271',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Deel roles from embedded job posting data', () => {
    expect(
      deelJobsFromHtml(
        '\\"jobPostings\\":[{\\"id\\":\\"831471ea-bbe3-4ccb-8e2a-5e7172e9abb7\\",\\"title\\":\\"Applied AI Manager\\",\\"createdAt\\":\\"2026-03-30T13:35:53.861Z\\",\\"job\\":{\\"jobLocations\\":[{\\"location\\":{\\"name\\":\\"London\\"}}]}}]',
        { externalId: 'https://jobs.deel.com/cardo', companyName: 'Cardo AI' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'deel:831471ea-bbe3-4ccb-8e2a-5e7172e9abb7',
        title: 'Applied AI Manager',
        companyName: 'Cardo AI',
        location: 'London',
        locations: ['London'],
        workMode: null,
        url: 'https://jobs.deel.com/cardo/job-details/831471ea-bbe3-4ccb-8e2a-5e7172e9abb7/overview',
        postedAt: new Date('2026-03-30T13:35:53.861Z'),
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Luxoft roles from listing cards', () => {
    expect(
      jobsFromCareerPageHtml(
        '<a href="/jobs/senior-front-end-developer-26210" class="jobs__list__job"><div class="jobs__list__job__details"><h2 class="subtitle-l text-rich-black">Senior Front-End Developer</h2><p class="body-m-regular text-dark-gray">Front-end React</p><div class="jobs__list__job__details__tags__location text-rich-black"><p class="body-s-regular">Wroclaw</p><p class="body-s-regular">Poland</p></div></div></a>',
        { externalId: 'https://career.luxoft.com/jobs', companyName: 'Luxoft' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'luxoft:senior-front-end-developer-26210',
        title: 'Senior Front-End Developer',
        companyName: 'Luxoft',
        location: 'Wroclaw',
        locations: ['Wroclaw', 'Poland'],
        workMode: null,
        url: 'https://career.luxoft.com/jobs/senior-front-end-developer-26210',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Lumenalta roles from embedded client job data', () => {
    expect(
      lumenaltaJobsFromHtml(
        '\\"jobsData\\":{\\"country\\":\\"DE\\",\\"clientJobs\\":[{\\"_id\\":\\"68dee35f8c9481db144ea376\\",\\"slug\\":\\"ai-engineer-ai-engineer-551\\",\\"name\\":\\"Senior AI Engineer\\",\\"seniority_level\\":\\"Senior\\"}],\\"companyJobs\\":[]}',
        { externalId: 'https://lumenalta.com/remote-jobs', companyName: 'Lumenalta' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'lumenalta:68dee35f8c9481db144ea376',
        title: 'Senior AI Engineer',
        companyName: 'Lumenalta',
        location: 'Remote',
        locations: ['Remote', 'Europe'],
        workMode: 'Remote',
        url: 'https://lumenalta.com/jobs/ai-engineer-ai-engineer-551',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('treats Status.app as a known career page even with no open roles', async () => {
    await expect(provider.verifyHandle('https://status.app/jobs')).resolves.toBe(true)
    expect(
      jobsFromCareerPageHtml(
        '<div id="open-roles"><span class="font-sans text-15 font-semibold">No open roles</span></div>',
        { externalId: 'https://status.app/jobs', companyName: 'Status.app' },
      ),
    ).toEqual([])
  })

  it('extracts Helply roles from its rendered careers page', () => {
    expect(
      jobsFromCareerPageHtml(
        '<h3 class="font-serif">Account Executive</h3><div class="flex flex-wrap gap-1.5"><span>Full time</span><span>Remote</span><span>Sales</span></div><h3 class="font-serif">Full Stack Engineer (AI focus)</h3><div class="flex flex-wrap gap-1.5"><span>Full time</span><span>Remote</span><span>Engineering</span></div>',
        { externalId: 'https://helply.com/careers', companyName: 'Helply' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'helply:account-executive',
        title: 'Account Executive',
        companyName: 'Helply',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: 'https://helply.com/careers',
        postedAt: null,
        contentLanguage: 'en',
      },
      {
        provider: 'careerpage',
        externalId: 'helply:full-stack-engineer-ai-focus',
        title: 'Full Stack Engineer (AI focus)',
        companyName: 'Helply',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: 'https://helply.com/careers',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Scalerrs roles from its Webflow careers page', () => {
    expect(
      jobsFromCareerPageHtml(
        '<div role="listitem" class="careers_job_item w-dyn-item"><div class="careers_job_card"><div class="careers_job_text_wrap"><div class="careers_job_tag_list"><div class="tag_text u-text-style-tiny">Remote (Global)</div><div class="tag_text u-text-style-tiny">Full Time</div></div><div class="u-text-style-h4">Senior SEO Strategist</div></div><div class="careers_job-button-wrapper"><a href="https://airtable.com/app/form" class="clickable_link w-inline-block">Apply Now</a></div></div></div>',
        { externalId: 'https://www.scalerrs.co/careers', companyName: 'Scalerrs' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'scalerrs:senior-seo-strategist',
        title: 'Senior SEO Strategist',
        companyName: 'Scalerrs',
        location: 'Remote (Global)',
        locations: ['Remote (Global)'],
        workMode: 'Remote',
        url: 'https://airtable.com/app/form',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Levity roles from Notion job links on its about page', () => {
    expect(
      jobsFromCareerPageHtml(
        '<a href="https://levityai.notion.site/Solutions-Engineer-3339127bc66580568c36f6fa9221fd66?source=copy_link" target="_blank" class="flex flex-col md:flex-row items-center gap-2 md:gap-4 px-6 md:px-10.5 py-6 not-last:border-b border-subtle transition-colors hover:bg-neutral-2"><h3 class="text-lg w-full">Solutions Engineer</h3><div class="flex justify-between md:justify-end gap-6 w-full"><span class="text-tag text-secondary">Remote, Germany</span><span class="button button--secondary">Read more</span></div></a>',
        { externalId: 'https://levity.ai/en/about#jobs', companyName: 'Levity' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'levity:solutions-engineer:3339127bc66580568c36f6fa9221fd66',
        title: 'Solutions Engineer',
        companyName: 'Levity',
        location: 'Remote, Germany',
        locations: ['Remote, Germany'],
        workMode: 'Remote',
        url: 'https://levityai.notion.site/Solutions-Engineer-3339127bc66580568c36f6fa9221fd66?source=copy_link',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Bending Spoons roles from Next data', () => {
    expect(
      jobsFromCareerPageHtml(
        '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"list":[{"id":"6686d0e2a65ca3994b3a415b","jobTitle":"UX/UI designer","status":"active","availableAsRemoteInDefaultCountries":true,"officeLocations":[{"title":"Milan (Italy)","country":{"name":"Italy"}},{"title":"London (UK)","country":{"name":"United Kingdom"}}]},{"id":"hidden","jobTitle":"Draft role","status":"draft","officeLocations":[]}]}}}</script>',
        { externalId: 'https://jobs.bendingspoons.com/', companyName: 'Bending Spoons' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'bendingspoons:6686d0e2a65ca3994b3a415b',
        title: 'UX/UI designer',
        companyName: 'Bending Spoons',
        location: 'Milan (Italy)',
        locations: ['Milan (Italy)', 'London (UK)', 'Italy', 'United Kingdom', 'Remote eligible countries'],
        workMode: 'Remote',
        url: 'https://jobs.bendingspoons.com/positions/6686d0e2a65ca3994b3a415b',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts VEED roles from Next data', () => {
    expect(
      jobsFromCareerPageHtml(
        '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"jobPostings":[{"id":"123","title":"Senior Product Manager, AI Editing","locations":[{"name":"Amsterdam - Hybrid","country":{"name":"Netherlands"}},{"name":"London - Hybrid","country":{"name":"United Kingdom"}}],"function":{"name":"Product"}}]}}}</script>',
        { externalId: 'https://www.veed.io/careers', companyName: 'VEED' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'veed:123',
        title: 'Senior Product Manager, AI Editing',
        companyName: 'VEED',
        location: 'Amsterdam - Hybrid',
        locations: ['Amsterdam - Hybrid', 'Netherlands', 'London - Hybrid', 'United Kingdom'],
        workMode: 'Hybrid',
        url: 'https://www.veed.io/careers',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Tiger Data roles from its jobs API', () => {
    expect(
      tigerDataJobsFromPayload(
        {
          jobs: [
            {
              id: '2f739405-6cb3-4487-8551-d6727a2bc308',
              title: 'Business Development Representative (Barcelona)',
              locationName: 'Spain Full-time',
              locationExternalName: null,
              workplaceType: 'Remote',
              publishedDate: '2026-06-11',
              externalLink:
                'https://www.tigerdata.com/careers?ashby_jid=2f739405-6cb3-4487-8551-d6727a2bc308',
              isListed: true,
            },
            {
              id: 'hidden',
              title: 'Draft role',
              isListed: false,
            },
          ],
        },
        { externalId: 'https://www.tigerdata.com/careers', companyName: 'Timescale' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'tigerdata:2f739405-6cb3-4487-8551-d6727a2bc308',
        title: 'Business Development Representative (Barcelona)',
        companyName: 'Timescale',
        location: 'Spain Full-time',
        locations: ['Spain Full-time'],
        workMode: 'Remote',
        url: 'https://www.tigerdata.com/careers?ashby_jid=2f739405-6cb3-4487-8551-d6727a2bc308',
        postedAt: new Date('2026-06-11'),
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Bumpa roles from Next data', () => {
    expect(
      jobsFromCareerPageHtml(
        '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"positions":[{"sys":{"id":"6oPg2iseyweigYkQ1wIiov","createdAt":"2026-07-24T10:40:18.103Z"},"fields":{"title":"Product Marketing Associate","link":"https://getbumpa.seamlesshiring.com/job/view/9978?application_source=Direct URL","department":"Product","type":"Full time, Remote","slug":"product-marketing-associate"}}]}}}</script>',
        { externalId: 'https://www.getbumpa.com/career', companyName: 'Bumpa' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'bumpa:6oPg2iseyweigYkQ1wIiov',
        title: 'Product Marketing Associate',
        companyName: 'Bumpa',
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: 'https://getbumpa.seamlesshiring.com/job/view/9978?application_source=Direct URL',
        postedAt: new Date('2026-07-24T10:40:18.103Z'),
        contentLanguage: 'en',
      },
    ])
  })

  it('extracts Europe-relevant Xogito roles from the WordPress jobs page', () => {
    expect(
      jobsFromCareerPageHtml(
        '<div class="position"><div class="position-container"><div class="position-listing"><div class="listing-title"><a href="https://www.xogito.com/jobs/forward-deployed-engineer-python-ref-111-06/">Forward Deployed Engineer (Python) &#8211; REF 111 &#8211; 06</a><ul class="listing-tags"><li>Full Time</li><li>Permanent</li><li>remote</li><li>Europe and South America,&nbsp;Remote,&nbsp;Remote in Europe,&nbsp;Remote in Europe and South America</li></ul></div></div></div></div><div class="clearfix"></div><div class="position"><div class="position-container"><div class="position-listing"><div class="listing-title"><a href="https://www.xogito.com/jobs/react-native-developer-ref-81-30/">React Native Developer &#8211; REF 81- 30</a><ul class="listing-tags"><li>Full Time</li><li>Permanent</li><li>remote</li><li>Remote,&nbsp;Remote in South America</li></ul></div></div></div></div><div class="clearfix"></div>',
        { externalId: 'https://www.xogito.com/jobs/', companyName: 'Xogito group' },
      ),
    ).toEqual([
      {
        provider: 'careerpage',
        externalId: 'xogito:forward-deployed-engineer-python-ref-111-06',
        title: 'Forward Deployed Engineer (Python) - REF 111 - 06',
        companyName: 'Xogito group',
        location: 'Europe and South America, Remote, Remote in Europe, Remote in Europe and South America',
        locations: ['Europe and South America, Remote, Remote in Europe, Remote in Europe and South America'],
        workMode: 'Remote',
        url: 'https://www.xogito.com/jobs/forward-deployed-engineer-python-ref-111-06/',
        postedAt: null,
        contentLanguage: 'en',
      },
    ])
  })
})

describe('ComeetProvider', () => {
  const provider = new ComeetProvider()

  it('extracts the company slug and uid from Comeet URLs', () => {
    expect(provider.handleFromUrl('https://www.comeet.com/jobs/scylladb/E4.006')).toBe('scylladb/E4.006')
    expect(provider.handleFromUrl('https://example.com/jobs/scylladb/E4.006')).toBeNull()
  })

  it('extracts embedded Comeet positions', () => {
    const html =
      '<script>COMPANY_POSITIONS_DATA = [{"name":"Technical Support Engineer EMEA","uid":"A9.E66","company_name":"ScyllaDB","location":{"name":"Poland","country":"PL","city":"Warsaw","is_remote":true},"url_comeet_hosted_page":"https://www.comeet.com/jobs/scylladb/E4.006/technical-support-engineer-emea/A9.E66","time_updated":"2026-07-27T07:08:37Z","workplace_type":"Remote"}]; POSITION_DATA = null;</script>'

    expect(comeetJobsFromHtml(html)).toHaveLength(1)
    expect(provider.normalize(comeetJobsFromHtml(html)[0], { externalId: 'scylladb/E4.006', companyName: 'ScyllaDB' })).toEqual({
      provider: 'comeet',
      externalId: 'A9.E66',
      title: 'Technical Support Engineer EMEA',
      companyName: 'ScyllaDB',
      location: 'Poland, Warsaw, PL',
      locations: ['Poland, Warsaw, PL'],
      workMode: 'Remote',
      url: 'https://www.comeet.com/jobs/scylladb/E4.006/technical-support-engineer-emea/A9.E66',
      postedAt: new Date('2026-07-27T07:08:37Z'),
      contentLanguage: 'en',
    })
  })
})

describe('ZohoRecruitProvider', () => {
  const provider = new ZohoRecruitProvider()

  it('maps ITClinical and direct Zoho Recruit URLs to a portal handle', () => {
    expect(provider.handleFromUrl('https://itclinical.com/careers.php')).toBe(
      'https://itclinical.zohorecruit.eu/recruit/Portal.na?digest=BZl2tfNA04WFojs2U63iGnvcvvlqhJ2Ix5WvdZf2qD4-',
    )
    expect(provider.handleFromUrl('https://itclinical.zohorecruit.eu/recruit/Portal.na?digest=abc')).toBe(
      'https://itclinical.zohorecruit.eu/recruit/Portal.na?digest=abc',
    )
    expect(provider.handleFromUrl('https://example.com/careers.php')).toBeNull()
  })

  it('extracts encoded Zoho Recruit jobs', () => {
    const html =
      '<input type="hidden" value="[{&#34;id&#34;:&#34;33814000003903048&#34;,&#34;Posting_Title&#34;:&#34;Scientific Administrative Assistant&#34;,&#34;Country&#34;:&#34;Portugal&#34;,&#34;Remote_Job&#34;:true}]" id="jobs"><table><tr><td><a href="/recruit/PortalDetail.na?iframe=true&amp;digest=abc&amp;jobid=33814000003903048&amp;widgetid=33814000000231269&amp;embedsource=CareerSite">Scientific Administrative Assistant</a></td><td>Remote</td></tr></table>'

    expect(zohoRecruitJobsFromHtml(html)).toHaveLength(1)
    expect(
      provider.normalize(zohoRecruitJobsFromHtml(html)[0], {
        externalId: 'https://itclinical.zohorecruit.eu/recruit/Portal.na?digest=abc',
        companyName: 'ITClinical',
      }),
    ).toEqual({
      provider: 'zohorecruit',
      externalId: '33814000003903048',
      title: 'Scientific Administrative Assistant',
      companyName: 'ITClinical',
      location: 'Portugal',
      locations: ['Portugal', 'Remote'],
      workMode: 'Remote',
      url: 'https://itclinical.zohorecruit.eu/recruit/PortalDetail.na?iframe=true&digest=abc&jobid=33814000003903048&embedsource=CareerSite',
      postedAt: null,
      contentLanguage: 'en',
    })
  })

  it('extracts rendered Zoho Recruit table rows when the hidden payload is absent', () => {
    const html =
      '<table><tr id="zr-joblist-detail_33814000004775001" class="jobDetailRow" data-rowid="33814000004775001"><td><a class="jobdetail" href="/recruit/PortalDetail.na?iframe=true&amp;digest=abc&amp;jobid=33814000004775001&amp;widgetid=33814000000231269&amp;embedsource=CareerSite">AI Specialist</a></td><td>Lisbon</td><td>Portugal</td><td title="Includes fully remote work and flexible hours">Clinical AI role</td><td>Full time</td></tr></table>'

    const jobs = zohoRecruitJobsFromHtml(html)
    expect(jobs).toHaveLength(1)
    expect(
      provider.normalize(jobs[0], {
        externalId: 'https://itclinical.zohorecruit.eu/recruit/Portal.na?digest=abc',
        companyName: 'ITClinical',
      }),
    ).toEqual({
      provider: 'zohorecruit',
      externalId: '33814000004775001',
      title: 'AI Specialist',
      companyName: 'ITClinical',
      location: 'Lisbon, Portugal',
      locations: ['Lisbon, Portugal', 'Remote'],
      workMode: 'Remote',
      url: 'https://itclinical.zohorecruit.eu/recruit/PortalDetail.na?iframe=true&digest=abc&jobid=33814000004775001&embedsource=CareerSite',
      postedAt: null,
      contentLanguage: 'en',
    })
  })
})

describe('RipplingProvider', () => {
  const provider = new RipplingProvider()

  it('extracts the board slug from localized Rippling careers URLs', () => {
    expect(provider.handleFromUrl('https://ats.rippling.com/en-GB/chess/jobs')).toBe('chess')
    expect(provider.handleFromUrl('https://ats.rippling.com/chess/jobs')).toBe('chess')
    expect(provider.handleFromUrl('https://api.rippling.com/platform/api/ats/v1/board/anaconda/jobs')).toBe(
      'api:anaconda',
    )
    expect(provider.handleFromUrl('https://example.com/chess/jobs')).toBeNull()
  })

  it('extracts job-post queries from the Next.js data blob', () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">' +
      JSON.stringify({
        props: {
          pageProps: {
            dehydratedState: {
              queries: [
                { queryKey: ['board', 'chess', 'locations'], state: { data: { items: [] } } },
                {
                  queryKey: ['board', 'chess', 'job-posts'],
                  state: { data: { items: [{ id: 'a', name: 'Eng' }] } },
                },
              ],
            },
          },
        },
      }) +
      '</script>'
    expect(ripplingJobsFromHtml(html)).toEqual([{ id: 'a', name: 'Eng' }])
    expect(ripplingJobsFromHtml('<html>no data</html>')).toEqual([])
  })

  it('extracts jobs from the Rippling public board API shape', () => {
    expect(
      ripplingJobsFromApi([
        {
          uuid: '6d708e7b-d0ca-41fa-9cf9-ff42bfeed65a',
          name: 'Enterprise Account Executive - EMEA',
          url: 'https://ats.rippling.com/anaconda/jobs/6d708e7b-d0ca-41fa-9cf9-ff42bfeed65a',
          workLocation: { label: 'Remote (Germany)' },
        },
      ]),
    ).toHaveLength(1)
    expect(ripplingJobsFromApi({ jobs: [] })).toEqual([])
  })

  it('maps a Rippling posting', () => {
    expect(
      provider.normalize(
        {
          id: '6066415d-520c-46a3-9946-cab468730543',
          name: 'All-Stack Engineer',
          url: 'https://ats.rippling.com/chess/jobs/6066415d-520c-46a3-9946-cab468730543',
          locations: [
            {
              name: 'Remote',
              country: 'United States',
              state: 'Utah',
              city: 'Orem',
              workplaceType: 'REMOTE',
            },
          ],
          language: 'en-US',
        },
        { externalId: 'chess', companyName: 'Chess.com' },
      ),
    ).toEqual({
      provider: 'rippling',
      externalId: '6066415d-520c-46a3-9946-cab468730543',
      title: 'All-Stack Engineer',
      companyName: 'Chess.com',
      location: 'Remote, Orem, Utah, United States',
      locations: ['Remote, Orem, Utah, United States'],
      workMode: 'Remote',
      url: 'https://ats.rippling.com/chess/jobs/6066415d-520c-46a3-9946-cab468730543',
      postedAt: null,
      contentLanguage: 'en',
    })
  })

  it('maps a Rippling public API posting', () => {
    expect(
      provider.normalize(
        {
          uuid: '6d708e7b-d0ca-41fa-9cf9-ff42bfeed65a',
          name: 'Enterprise Account Executive - EMEA',
          url: 'https://ats.rippling.com/anaconda/jobs/6d708e7b-d0ca-41fa-9cf9-ff42bfeed65a',
          workLocation: { label: 'Remote (Germany)' },
        },
        { externalId: 'api:anaconda', companyName: 'Anaconda' },
      ),
    ).toEqual({
      provider: 'rippling',
      externalId: '6d708e7b-d0ca-41fa-9cf9-ff42bfeed65a',
      title: 'Enterprise Account Executive - EMEA',
      companyName: 'Anaconda',
      location: 'Remote (Germany)',
      locations: ['Remote (Germany)'],
      workMode: 'Remote',
      url: 'https://ats.rippling.com/anaconda/jobs/6d708e7b-d0ca-41fa-9cf9-ff42bfeed65a',
      postedAt: null,
      contentLanguage: null,
    })
  })
})

describe('McKinseyProvider', () => {
  const provider = new McKinseyProvider()

  it('recognizes McKinsey careers search URLs', () => {
    expect(provider.handleFromUrl('https://www.mckinsey.com/careers/search-jobs')).toBe('search-jobs')
    expect(provider.handleFromUrl('https://www.mckinsey.com/careers/search-jobs/jobs/aiengineer-110292')).toBe(
      'search-jobs',
    )
    expect(provider.handleFromUrl('https://example.com/careers/search-jobs')).toBeNull()
  })

  it('probes McKinsey names only', () => {
    expect(provider.candidateHandles('McKinsey & Company')).toEqual(['search-jobs'])
    expect(provider.candidateHandles('Acme')).toEqual([])
  })

  it('maps a McKinsey posting', () => {
    expect(
      provider.normalize(
        {
          jobID: '110292',
          title: 'AI Engineer - QuantumBlack, AI by McKinsey',
          cities: ['London', 'Lisbon'],
          countries: ['United Kingdom', 'Portugal'],
          friendlyURL: 'aiengineer-quantumblackaibymckinsey-110292',
          postedToLinkedInDate: '2026-07-08',
        },
        { externalId: 'search-jobs', companyName: 'McKinsey & Company' },
      ),
    ).toEqual({
      provider: 'mckinsey',
      externalId: '110292',
      title: 'AI Engineer - QuantumBlack, AI by McKinsey',
      companyName: 'McKinsey & Company',
      location: 'London, United Kingdom',
      locations: ['London, United Kingdom', 'Lisbon, Portugal', 'United Kingdom', 'Portugal'],
      workMode: null,
      url: 'https://www.mckinsey.com/careers/search-jobs/jobs/aiengineer-quantumblackaibymckinsey-110292',
      postedAt: new Date('2026-07-08'),
      contentLanguage: 'en',
    })
  })

  it('uses a compact primary location for global postings', () => {
    const job = provider.normalize(
      {
        jobID: '15178',
        title: 'Associate',
        cities: ['Abu Dhabi', 'Oslo', 'London', 'Berlin', 'New York City'],
        countries: ['United Arab Emirates', 'Norway', 'United Kingdom', 'Germany', 'United States'],
        friendlyURL: 'associate-15178',
      },
      { externalId: 'search-jobs', companyName: 'McKinsey & Company' },
    )

    expect(job?.location).toBe('Multiple locations')
    expect(job?.locations).toContain('Oslo, Norway')
  })
})
