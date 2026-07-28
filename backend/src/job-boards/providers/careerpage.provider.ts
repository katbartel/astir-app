import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'
const LUXOFT_PAGE_SIZE = 60
const LUXOFT_MAX_PAGES = 25

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#x27;|&quot;|&amp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function absoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString()
  } catch {
    return base
  }
}

function cerbosJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const text = textFromHtml(html)
  const match = text.match(/Current Open Roles\s+(.+?\(Remote\))\s+At Cerbos,/i)
  if (!match) {
    return []
  }
  const title = match[1].trim()
  const url = source.externalId
  return [
    {
      provider: 'careerpage',
      externalId: `cerbos:${slugFromTitle(title)}`,
      title,
      companyName: source.companyName,
      location: 'Remote',
      locations: ['Remote'],
      workMode: 'Remote',
      url,
      postedAt: null,
      contentLanguage: 'en',
    },
  ]
}

function liveblocksJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const section = html.match(/<section id="open-roles"[\s\S]*?<\/section>/i)?.[0] ?? ''
  const jobs = [...section.matchAll(/<p class="font-medium text-marketing">([^<]+)<\/p>[\s\S]*?<p class="text-marketing-subtle">([^<]+)<\/p>[\s\S]*?<a[^>]+href="([^"]+)"/gi)]

  return jobs.map((match) => {
    const title = match[1].trim()
    const location = match[2].trim()
    return {
      provider: 'careerpage',
      externalId: `liveblocks:${slugFromTitle(title)}`,
      title,
      companyName: source.companyName,
      location,
      locations: [location],
      workMode: location.toLowerCase().includes('remote') ? 'Remote' : null,
      url: absoluteUrl(match[3], source.externalId),
      postedAt: null,
      contentLanguage: 'en',
    }
  })
}

function sketchJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const jobs = [
    ...html.matchAll(
      /<div class="grid-table__item job">[\s\S]*?href="([^"]+)"[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<div class="job__column job__department">([^<]+)<\/div>[\s\S]*?<div class="job__column job__commitment">([^<]+)<\/div>[\s\S]*?<div class="job__column job_timezone">([^<]+)<\/div>/gi,
    ),
  ]

  return jobs.map((match) => {
    const title = match[2].trim()
    const location = match[5].trim()
    return {
      provider: 'careerpage',
      externalId: `sketch:${slugFromTitle(title)}`,
      title,
      companyName: source.companyName,
      location,
      locations: [location],
      workMode: location.toLowerCase().includes('remote') ? 'Remote' : null,
      url: absoluteUrl(match[1], source.externalId),
      postedAt: null,
      contentLanguage: 'en',
    }
  })
}

function cleanHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function unescapeRscJson(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
}

function extractJsonArrayAfter(html: string, marker: string): unknown[] {
  const markerIndex = html.indexOf(marker)
  if (markerIndex === -1) {
    return []
  }
  const arrayStart = html.indexOf('[', markerIndex)
  if (arrayStart === -1) {
    return []
  }
  let depth = 0
  for (let index = arrayStart; index < html.length; index += 1) {
    const char = html[index]
    if (char === '[') {
      depth += 1
    }
    if (char === ']') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(unescapeRscJson(html.slice(arrayStart, index + 1))) as unknown[]
        } catch {
          return []
        }
      }
    }
  }
  return []
}

function workModeFromText(value: string): WorkMode | null {
  const normalized = value.toLowerCase()
  if (normalized.includes('remote')) {
    return 'Remote'
  }
  if (normalized.includes('hybrid')) {
    return 'Hybrid'
  }
  if (/on-?site|office/.test(normalized)) {
    return 'On-Site'
  }
  return null
}

type LumenaltaJob = {
  _id?: string
  slug?: string
  name?: string
  seniority_level?: string | null
}

export function lumenaltaJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const jobs = extractJsonArrayAfter(html, '\\"clientJobs\\":[') as LumenaltaJob[]
  return jobs
    .map((job): NormalizedJob | null => {
      if (!job._id || !job.slug || !job.name) {
        return null
      }
      return {
        provider: 'careerpage',
        externalId: `lumenalta:${job._id}`,
        title: job.name.trim(),
        companyName: source.companyName,
        location: 'Remote',
        locations: ['Remote', 'Europe'],
        workMode: 'Remote',
        url: absoluteUrl(`/jobs/${job.slug}`, source.externalId),
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

function luxoftJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const cards = [
    ...html.matchAll(/<a href="([^"]+)" class="jobs__list__job">([\s\S]*?)<\/a>/gi),
  ]
  return cards
    .map((match): NormalizedJob | null => {
      const body = match[2]
      const title = cleanHtml(body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '')
      const places = [...body.matchAll(/<p class="body-s-regular">([\s\S]*?)<\/p>/gi)].map((place) =>
        cleanHtml(place[1]),
      )
      const locations = [...new Set(places.filter(Boolean))]
      if (!title) {
        return null
      }
      const url = absoluteUrl(match[1], source.externalId)
      return {
        provider: 'careerpage',
        externalId: `luxoft:${url.split('/').pop() ?? slugFromTitle(title)}`,
        title,
        companyName: source.companyName,
        location: locations[0] ?? null,
        locations,
        workMode: workModeFromText(locations.join(' ')),
        url,
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

function statusJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const section = html.match(/id="open-roles"[\s\S]*?(?:Open roles in our network|<\/body>)/i)?.[0] ?? ''
  const links = [...section.matchAll(/<a[^>]+href="([^"]+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi)]
  return links.map((match) => {
    const title = cleanHtml(match[2])
    return {
      provider: 'careerpage',
      externalId: `status:${slugFromTitle(title)}`,
      title,
      companyName: source.companyName,
      location: 'Remote',
      locations: ['Remote'],
      workMode: 'Remote',
      url: absoluteUrl(match[1], source.externalId),
      postedAt: null,
      contentLanguage: 'en',
    }
  })
}

function helplyJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const cards = [
    ...html.matchAll(
      /<h3[^>]*>([^<]+)<\/h3>\s*<div[^>]*class="[^"]*flex flex-wrap[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ),
  ]

  return cards
    .map((match): NormalizedJob | null => {
      const title = cleanHtml(match[1])
      const tags = [...match[2].matchAll(/<span[^>]*>([^<]+)<\/span>/gi)].map((tag) =>
        cleanHtml(tag[1]),
      )
      if (!title || !tags.includes('Remote') || !tags.includes('Full time')) {
        return null
      }
      return {
        provider: 'careerpage',
        externalId: `helply:${slugFromTitle(title)}`,
        title,
        companyName: source.companyName,
        location: 'Remote',
        locations: ['Remote'],
        workMode: 'Remote',
        url: source.externalId,
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

function scalerrsJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const cards = [
    ...html.matchAll(
      /<div role="listitem" class="careers_job_item w-dyn-item">([\s\S]*?)(?=<div role="listitem" class="careers_job_item w-dyn-item"|<div data-wf--spacer|$)/gi,
    ),
  ]

  return cards
    .map((match): NormalizedJob | null => {
      const body = match[1]
      const title = cleanHtml(body.match(/<div class="u-text-style-h4">([\s\S]*?)<\/div>/i)?.[1] ?? '')
      const tags = [...body.matchAll(/<div class="tag_text u-text-style-tiny">([^<]+)<\/div>/gi)].map((tag) =>
        cleanHtml(tag[1]),
      )
      const url = body.match(/<a[^>]+href="([^"]+)"/i)?.[1] ?? source.externalId
      if (!title || !tags.some((tag) => tag.toLowerCase().includes('remote'))) {
        return null
      }
      const location = tags.find((tag) => tag.toLowerCase().includes('remote')) ?? 'Remote'
      return {
        provider: 'careerpage',
        externalId: `scalerrs:${slugFromTitle(title)}`,
        title,
        companyName: source.companyName,
        location,
        locations: [location],
        workMode: 'Remote',
        url: absoluteUrl(url, source.externalId),
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

type BendingSpoonsLocation = {
  title?: string
  country?: { name?: string; enablesRemoteWork?: boolean }
}

type BendingSpoonsJob = {
  id?: string
  jobTitle?: string
  officeLocations?: BendingSpoonsLocation[]
  availableAsRemoteInDefaultCountries?: boolean
  additionalRemoteWorkCountries?: { name?: string }[]
  status?: string
}

type VeedJob = {
  id?: string
  title?: string
  locations?: Array<{
    name?: string
    type?: string
    country?: { name?: string }
  }>
  function?: { name?: string }
}

function nextDataFromHtml(html: string): unknown | null {
  const raw = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i)?.[1]
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function bendingSpoonsJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const data = nextDataFromHtml(html)
  const list =
    data && typeof data === 'object'
      ? ((data as { props?: { pageProps?: { list?: unknown } } }).props?.pageProps?.list as unknown)
      : null
  if (!Array.isArray(list)) {
    return []
  }

  return (list as BendingSpoonsJob[])
    .map((job): NormalizedJob | null => {
      if (!job.id || !job.jobTitle || job.status !== 'active') {
        return null
      }
      const officeLocations = job.officeLocations ?? []
      const locations = [
        ...new Set([
          ...officeLocations.map((location) => location.title).filter((location): location is string => !!location),
          ...officeLocations
            .map((location) => location.country?.name)
            .filter((country): country is string => !!country),
          ...(job.availableAsRemoteInDefaultCountries ? ['Remote eligible countries'] : []),
          ...(job.additionalRemoteWorkCountries ?? [])
            .map((country) => country.name)
            .filter((country): country is string => !!country),
        ]),
      ]
      return {
        provider: 'careerpage',
        externalId: `bendingspoons:${job.id}`,
        title: job.jobTitle.trim(),
        companyName: source.companyName,
        location: locations[0] ?? null,
        locations,
        workMode: job.availableAsRemoteInDefaultCountries ? 'Remote' : null,
        url: absoluteUrl(`/positions/${job.id}`, source.externalId),
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

function veedJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const data = nextDataFromHtml(html)
  const postings =
    data && typeof data === 'object'
      ? ((data as { props?: { pageProps?: { jobPostings?: unknown } } }).props?.pageProps?.jobPostings as unknown)
      : null
  if (!Array.isArray(postings)) {
    return []
  }

  return (postings as VeedJob[])
    .map((job): NormalizedJob | null => {
      if (!job.id || !job.title) {
        return null
      }
      const locations = [
        ...new Set(
          (job.locations ?? [])
            .flatMap((location) => [location.name, location.country?.name])
            .filter((location): location is string => !!location),
        ),
      ]
      return {
        provider: 'careerpage',
        externalId: `veed:${job.id}`,
        title: job.title.trim(),
        companyName: source.companyName,
        location: locations[0] ?? null,
        locations,
        workMode: workModeFromText(locations.join(' ')),
        url: source.externalId,
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

export function jobsFromCareerPageHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  try {
    const parsed = new URL(source.externalId)
    if (/(^|\.)lumenalta\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/remote-jobs') {
      return lumenaltaJobsFromHtml(html, source)
    }
    if (/(^|\.)career\.luxoft\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') {
      return luxoftJobsFromHtml(html, source)
    }
    if (/(^|\.)status\.app$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') {
      return statusJobsFromHtml(html, source)
    }
    if (/(^|\.)helply\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
      return helplyJobsFromHtml(html, source)
    }
    if (/(^|\.)scalerrs\.co$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
      return scalerrsJobsFromHtml(html, source)
    }
    if (/(^|\.)jobs\.bendingspoons\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '') {
      return bendingSpoonsJobsFromHtml(html, source)
    }
    if (/(^|\.)veed\.io$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
      return veedJobsFromHtml(html, source)
    }
    if (/(^|\.)cerbos\.dev$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/join-us') {
      return cerbosJobsFromHtml(html, source)
    }
    if (/(^|\.)liveblocks\.io$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
      return liveblocksJobsFromHtml(html, source)
    }
    if (/(^|\.)sketch\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
      return sketchJobsFromHtml(html, source)
    }
  } catch {
    return []
  }
  return []
}

@Injectable()
export class CareerPageProvider implements AtsProvider {
  readonly provider = 'careerpage'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url)
      if (/(^|\.)lumenalta\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/remote-jobs') {
        return parsed.toString()
      }
      if (/(^|\.)career\.luxoft\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') {
        return parsed.toString()
      }
      if (/(^|\.)status\.app$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') {
        return parsed.toString()
      }
      if (/(^|\.)helply\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)scalerrs\.co$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)jobs\.bendingspoons\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '') {
        return parsed.toString()
      }
      if (/(^|\.)veed\.io$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)cerbos\.dev$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/join-us') {
        return parsed.toString()
      }
      if (/(^|\.)liveblocks\.io$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)sketch\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
        return parsed.toString()
      }
    } catch {
      return null
    }
    return null
  }

  candidateHandles(): string[] {
    return []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const parsed = new URL(handle)
      if (
        (/(^|\.)lumenalta\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/remote-jobs') ||
        (/(^|\.)career\.luxoft\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') ||
        (/(^|\.)status\.app$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') ||
        (/(^|\.)helply\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') ||
        (/(^|\.)jobs\.bendingspoons\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '')
      ) {
        return true
      }
      return (await this.fetchListings({ externalId: handle, companyName: 'Company' })).length > 0
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const parsed = new URL(source.externalId)
    if (/(^|\.)career\.luxoft\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') {
      const listings: NormalizedJob[] = []
      for (let page = 1; page <= LUXOFT_MAX_PAGES; page += 1) {
        const url = new URL(source.externalId)
        url.searchParams.set('perPage', String(LUXOFT_PAGE_SIZE))
        url.searchParams.set('page', String(page))
        const jobs = await this.fetchPage(url.toString(), source)
        if (!jobs.length) {
          break
        }
        listings.push(...jobs)
        if (jobs.length < LUXOFT_PAGE_SIZE) {
          break
        }
      }
      return listings
    }
    return this.fetchPage(source.externalId, source)
  }

  private async fetchPage(url: string, source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${url} responded ${response.status}`)
    }
    return jobsFromCareerPageHtml(await response.text(), { ...source, externalId: url })
  }
}
