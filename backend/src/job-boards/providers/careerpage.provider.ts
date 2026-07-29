import { Injectable } from '@nestjs/common'
import { NormalizedJob, parseDate, WorkMode } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'
const LUXOFT_PAGE_SIZE = 60
const LUXOFT_MAX_PAGES = 25
const TIGERDATA_JOBS_API = 'https://www.tigerdata.com/api/jobs'

const EMPTY_TRACKABLE_CAREER_PAGES = [
  { host: /(^|\.)axonista\.com$/i, path: '/careers' },
  { host: /(^|\.)getharvest\.com$/i, path: '/careers' },
  { host: /(^|\.)meetedgar\.com$/i, path: '/careers' },
  { host: /(^|\.)jobs\.mimo\.org$/i, path: '' },
  { host: /(^|\.)mimo\.org$/i, path: '' },
  { host: /(^|\.)ockam\.io$/i, path: '/team' },
  { host: /(^|\.)plausible\.io$/i, path: '/about' },
  { host: /(^|\.)careers\.promaton\.com$/i, path: '' },
  { host: /(^|\.)promaton\.com$/i, path: '' },
  { host: /(^|\.)shogun\.co$/i, path: '/careers' },
  { host: /(^|\.)getshogun\.com$/i, path: '/careers' },
  { host: /(^|\.)tuple\.app$/i, path: '/jobs' },
  { host: /(^|\.)ynab\.com$/i, path: '/careers' },
]

function normalizedPath(parsed: URL): string {
  return parsed.pathname.replace(/\/$/, '')
}

function isEmptyTrackableCareerPage(parsed: URL): boolean {
  const path = normalizedPath(parsed)
  return EMPTY_TRACKABLE_CAREER_PAGES.some((page) => page.host.test(parsed.hostname) && page.path === path)
}

function isAttraxCareerPage(parsed: URL): boolean {
  const path = normalizedPath(parsed)
  return (
    (/(^|\.)jobs\.renesas\.com$/i.test(parsed.hostname) && (path === '/altium-careers' || path === '/jobs')) ||
    (/(^|\.)jobs\.experian\.com$/i.test(parsed.hostname) && path === '/jobs')
  )
}

function isDeelCareerPage(parsed: URL): boolean {
  return /(^|\.)jobs\.deel\.com$/i.test(parsed.hostname) && normalizedPath(parsed).split('/').length === 2
}

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

function bobsledJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const jobs = [
    ...html.matchAll(
      /<a href="(https:\/\/jobs\.ashbyhq\.com\/Bobsled\/[^"]+)"[^>]*class="[^"]*block py-6[^"]*"[^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi,
    ),
  ]

  return jobs.map((match) => {
    const url = match[1]
    const title = cleanHtml(match[2])
    const location = cleanHtml(match[3])
    return {
      provider: 'careerpage',
      externalId: `bobsled:${url.split('/').pop() ?? slugFromTitle(title)}`,
      title,
      companyName: source.companyName,
      location: location || null,
      locations: location ? [location] : [],
      workMode: workModeFromText(location),
      url,
      postedAt: null,
      contentLanguage: 'en',
    }
  })
}

function cleanHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#038;/g, '&')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function attrValue(html: string, attribute: string): string | null {
  const match = html.match(new RegExp(`${attribute}="([^"]+)"`, 'i'))
  return match?.[1] ?? null
}

function firstItemValue(body: string, className: string): string | null {
  const match = body.match(
    new RegExp(
      `<div[^>]+class="[^"]*${className}[^"]*"[^>]*>[\\s\\S]*?<p[^>]+class="[^"]*attrax-vacancy-tile__item-value[^"]*"[^>]*>([\\s\\S]*?)<\\/p>`,
      'i',
    ),
  )
  const value = cleanHtml(match?.[1] ?? '')
  return value || null
}

export function attraxJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const tiles = [
    ...html.matchAll(
      /<div[^>]+class="[^"]*attrax-vacancy-tile\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*attrax-vacancy-tile\b|<div[^>]+class=['"]row dragElement widget container-widget wrapper-widget page-job-results__pagination|<\/body>|$)/gi,
    ),
  ]

  return tiles
    .map((match): NormalizedJob | null => {
      const tile = match[0]
      const body = match[1]
      const id = attrValue(tile, 'data-jobid')
      const titleMatch = body.match(
        /<a[^>]+class="[^"]*attrax-vacancy-tile__title[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      )
      const url = titleMatch?.[1] ? absoluteUrl(titleMatch[1], source.externalId) : null
      const title = cleanHtml(titleMatch?.[2] ?? '')
      const location = firstItemValue(body, 'attrax-vacancy-tile__location-freetext')
      const optionLocation = firstItemValue(body, 'attrax-vacancy-tile__option-location')
      const roleType = firstItemValue(body, 'attrax-vacancy-tile__option-role-type')
      const remote = firstItemValue(body, 'attrax-vacancy-tile__option-remote')
      const locations = [...new Set([location, optionLocation].filter((value): value is string => !!value))]
      const workMode = workModeFromText([roleType, remote, location].filter(Boolean).join(' '))

      if (!title || !url) {
        return null
      }

      return {
        provider: 'careerpage',
        externalId: `attrax:${id ?? slugFromTitle(title)}`,
        title,
        companyName: source.companyName,
        location: locations[0] ?? null,
        locations,
        workMode,
        url,
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
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

function levityJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const jobs = [
    ...html.matchAll(
      /<a href="(https:\/\/levityai\.notion\.site\/[^"]+)"[^>]*class="[^"]*hover:bg-neutral-2[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ]

  return jobs
    .map((match): NormalizedJob | null => {
      const url = match[1].replace(/&amp;/g, '&')
      const body = match[2]
      const title = cleanHtml(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '')
      const location = cleanHtml(
        body.match(/<span[^>]*class="[^"]*text-secondary[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '',
      )
      if (!title) {
        return null
      }
      return {
        provider: 'careerpage',
        externalId: `levity:${slugFromTitle(title)}:${url.split('?')[0].split('-').pop() ?? slugFromTitle(title)}`,
        title,
        companyName: source.companyName,
        location: location || null,
        locations: location ? [location] : [],
        workMode: workModeFromText(location),
        url,
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

type BumpaPosition = {
  sys?: { id?: string; createdAt?: string }
  fields?: {
    title?: string
    link?: string
    type?: string
    slug?: string
  }
}

type TigerDataJob = {
  id?: string
  title?: string
  locationName?: string | null
  locationExternalName?: string | null
  workplaceType?: string | null
  publishedDate?: string | null
  externalLink?: string | null
  applyLink?: string | null
  isListed?: boolean
}

type DeelJobPosting = {
  id?: string
  title?: string
  createdAt?: string
  job?: {
    jobLocations?: Array<{ location?: { name?: string } }>
  }
}

export function deelJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const postings = extractJsonArrayAfter(html, '\\"jobPostings\\":[') as DeelJobPosting[]
  const sourceUrl = new URL(source.externalId)
  const boardPath = normalizedPath(sourceUrl)
  return postings
    .map((posting): NormalizedJob | null => {
      if (!posting.id || !posting.title) {
        return null
      }
      const locations = [
        ...new Set(
          (posting.job?.jobLocations ?? [])
            .map((location) => location.location?.name?.trim())
            .filter((location): location is string => !!location),
        ),
      ]
      return {
        provider: 'careerpage',
        externalId: `deel:${posting.id}`,
        title: posting.title.trim(),
        companyName: source.companyName,
        location: locations[0] ?? null,
        locations,
        workMode: workModeFromText(locations.join(' ')),
        url: absoluteUrl(`${boardPath}/job-details/${posting.id}/overview`, sourceUrl.origin),
        postedAt: parseDate(posting.createdAt),
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

export function tigerDataJobsFromPayload(payload: unknown, source: JobBoardSourceRef): NormalizedJob[] {
  const rawJobs =
    payload && typeof payload === 'object' ? (payload as { jobs?: unknown }).jobs : null
  if (!Array.isArray(rawJobs)) {
    return []
  }

  return (rawJobs as TigerDataJob[])
    .map((job): NormalizedJob | null => {
      if (!job.id || !job.title || job.isListed === false) {
        return null
      }
      const locations = [
        ...new Set(
          [job.locationName, job.locationExternalName]
            .filter((location): location is string => !!location)
            .map((location) => location.trim())
            .filter(Boolean),
        ),
      ]
      const workplace = job.workplaceType?.trim() ?? ''
      return {
        provider: 'careerpage',
        externalId: `tigerdata:${job.id}`,
        title: job.title.trim(),
        companyName: source.companyName,
        location: locations[0] ?? null,
        locations,
        workMode: workModeFromText(workplace || locations.join(' ')),
        url: job.externalLink || job.applyLink || absoluteUrl(`/careers?ashby_jid=${job.id}`, source.externalId),
        postedAt: parseDate(job.publishedDate),
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
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

function bumpaJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const data = nextDataFromHtml(html)
  const positions =
    data && typeof data === 'object'
      ? ((data as { props?: { pageProps?: { positions?: unknown } } }).props?.pageProps?.positions as unknown)
      : null
  if (!Array.isArray(positions)) {
    return []
  }

  return (positions as BumpaPosition[])
    .map((position): NormalizedJob | null => {
      const title = position.fields?.title?.trim()
      if (!title) {
        return null
      }
      const type = position.fields?.type?.trim() ?? ''
      const isRemote = type.toLowerCase().includes('remote')
      const id = position.sys?.id ?? position.fields?.slug ?? slugFromTitle(title)
      return {
        provider: 'careerpage',
        externalId: `bumpa:${id}`,
        title,
        companyName: source.companyName,
        location: isRemote ? 'Remote' : null,
        locations: isRemote ? ['Remote'] : [],
        workMode: workModeFromText(type),
        url: position.fields?.link || source.externalId,
        postedAt: parseDate(position.sys?.createdAt),
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

function xogitoJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const cards = [...html.matchAll(/<div class="position">([\s\S]*?)<div class="clearfix"><\/div>/gi)]
  return cards
    .map((match): NormalizedJob | null => {
      const body = match[1]
      const url = body.match(/<a[^>]+href="([^"]+)"/i)?.[1]
      const title = cleanHtml(body.match(/<a[^>]+href="[^"]+"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? '')
      const tags = [...body.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((tag) => cleanHtml(tag[1]))
      const location = tags.find((tag) => tag.toLowerCase().includes('europe')) ?? null
      if (!url || !title || !location) {
        return null
      }
      return {
        provider: 'careerpage',
        externalId: `xogito:${slugFromTitle(title)}`,
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

export function jobsFromCareerPageHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  try {
    const parsed = new URL(source.externalId)
    if (isAttraxCareerPage(parsed)) {
      return attraxJobsFromHtml(html, source)
    }
    if (isDeelCareerPage(parsed)) {
      return deelJobsFromHtml(html, source)
    }
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
    if (/(^|\.)levity\.ai$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/en/about') {
      return levityJobsFromHtml(html, source)
    }
    if (/(^|\.)jobs\.bendingspoons\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '') {
      return bendingSpoonsJobsFromHtml(html, source)
    }
    if (/(^|\.)veed\.io$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
      return veedJobsFromHtml(html, source)
    }
    if (/(^|\.)getbumpa\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/career') {
      return bumpaJobsFromHtml(html, source)
    }
    if (/(^|\.)xogito\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/jobs') {
      return xogitoJobsFromHtml(html, source)
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
    if (/(^|\.)bobsled\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/company') {
      return bobsledJobsFromHtml(html, source)
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
      if (isEmptyTrackableCareerPage(parsed)) {
        return parsed.toString()
      }
      if (isAttraxCareerPage(parsed)) {
        return parsed.toString()
      }
      if (isDeelCareerPage(parsed)) {
        return parsed.toString()
      }
      if (/(^|\.)lumenalta\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/remote-jobs') {
        return parsed.toString()
      }
      if (/(^|\.)career\.luxoft\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/jobs') {
        return parsed.toString()
      }
      if (/(^|\.)status\.app$/i.test(parsed.hostname) && normalizedPath(parsed) === '/jobs') {
        return parsed.toString()
      }
      if (/(^|\.)helply\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)scalerrs\.co$/i.test(parsed.hostname) && normalizedPath(parsed) === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)levity\.ai$/i.test(parsed.hostname) && normalizedPath(parsed) === '/en/about') {
        return parsed.toString()
      }
      if (/(^|\.)jobs\.bendingspoons\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '') {
        return parsed.toString()
      }
      if (/(^|\.)veed\.io$/i.test(parsed.hostname) && normalizedPath(parsed) === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)cerbos\.dev$/i.test(parsed.hostname) && normalizedPath(parsed) === '/join-us') {
        return parsed.toString()
      }
      if (/(^|\.)liveblocks\.io$/i.test(parsed.hostname) && normalizedPath(parsed) === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)sketch\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)bobsled\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/company') {
        return parsed.toString()
      }
      if (/(^|\.)tigerdata\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/careers') {
        return parsed.toString()
      }
      if (/(^|\.)getbumpa\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/career') {
        return parsed.toString()
      }
      if (/(^|\.)xogito\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/jobs') {
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
        isEmptyTrackableCareerPage(parsed) ||
        isAttraxCareerPage(parsed) ||
        isDeelCareerPage(parsed) ||
        (/(^|\.)lumenalta\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/remote-jobs') ||
        (/(^|\.)career\.luxoft\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/jobs') ||
        (/(^|\.)status\.app$/i.test(parsed.hostname) && normalizedPath(parsed) === '/jobs') ||
        (/(^|\.)helply\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '/careers') ||
        (/(^|\.)jobs\.bendingspoons\.com$/i.test(parsed.hostname) && normalizedPath(parsed) === '')
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
    if (/(^|\.)tigerdata\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers') {
      const response = await fetch(TIGERDATA_JOBS_API, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`GET ${TIGERDATA_JOBS_API} responded ${response.status}`)
      }
      return tigerDataJobsFromPayload(await response.json(), source)
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
