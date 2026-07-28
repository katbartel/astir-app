import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef, companyHandleCandidates } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const API_URL = 'https://gateway.mckinsey.com/apigw-x0cceuow60/v1/api/jobs/search'
const CAREERS_URL = 'https://www.mckinsey.com/careers/search-jobs'
const PAGE_SIZE = 20
const MAX_PAGES = 50
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'

type McKinseyJob = {
  jobID?: string
  title?: string
  cities?: string[]
  countries?: string[]
  friendlyURL?: string
  jobApplyURL?: string
  postedToLinkedInDate?: string
}

type McKinseySearchPayload = {
  numFound?: number
  docs?: McKinseyJob[]
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function unique(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))]
}

function locationsFrom(job: McKinseyJob): string[] {
  const cities = job.cities ?? []
  const countries = job.countries ?? []
  const paired =
    cities.length && cities.length === countries.length
      ? cities.map((city, index) => {
          const cityName = clean(city)
          const countryName = clean(countries[index])
          return unique([cityName, countryName]).join(', ') || null
        })
      : cities.map(clean)

  return unique([...paired, ...countries.map(clean)])
}

function primaryLocation(locations: string[]): string | null {
  if (!locations.length) {
    return null
  }
  return locations.length > 4 ? 'Multiple locations' : locations[0]
}

function workModeFrom(job: McKinseyJob): WorkMode | null {
  const haystack = [job.title, ...(job.cities ?? []), ...(job.countries ?? [])].join(' ').toLowerCase()
  if (haystack.includes('remote')) {
    return 'Remote'
  }
  if (haystack.includes('hybrid')) {
    return 'Hybrid'
  }
  if (/on-?site|in-?office/.test(haystack)) {
    return 'On-Site'
  }
  return null
}

function jobUrl(job: McKinseyJob): string {
  const friendlyUrl = clean(job.friendlyURL)
  if (friendlyUrl) {
    return `${CAREERS_URL}/jobs/${encodeURIComponent(friendlyUrl)}`
  }
  return job.jobApplyURL || `${CAREERS_URL}?folderid=${encodeURIComponent(job.jobID ?? '')}`
}

@Injectable()
export class McKinseyProvider implements AtsProvider {
  readonly provider = 'mckinsey'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url)
      if (/(^|\.)mckinsey\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith('/careers/search-jobs')) {
        return 'search-jobs'
      }
    } catch {
      return null
    }
    return null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName).some((handle) => handle === 'mckinsey')
      ? ['search-jobs']
      : []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    if (handle !== 'search-jobs') {
      return false
    }
    try {
      return (await this.fetchJobs(1, 1)).jobs.length > 0
    } catch {
      return false
    }
  }

  private async fetchJobs(page: number, pageSize: number): Promise<{ jobs: McKinseyJob[]; total: number }> {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      start: String(page),
      lang: 'en',
    })
    const url = `${API_URL}?${params}`
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${url} responded ${response.status}`)
    }
    const payload = (await response.json()) as McKinseySearchPayload
    return {
      jobs: payload.docs ?? [],
      total: payload.numFound ?? 0,
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const listings: NormalizedJob[] = []
    let page = 1
    let totalPages = Number.POSITIVE_INFINITY

    while (page <= MAX_PAGES && page <= totalPages) {
      const result = await this.fetchJobs(page, PAGE_SIZE)
      totalPages = result.total ? Math.ceil(result.total / PAGE_SIZE) : page
      listings.push(
        ...result.jobs
          .map((job) => this.normalize(job, source))
          .filter((job): job is NormalizedJob => job !== null),
      )
      if (!result.jobs.length) {
        break
      }
      page += 1
    }

    return listings
  }

  normalize(job: McKinseyJob, source: JobBoardSourceRef): NormalizedJob | null {
    const externalId = clean(job.jobID)
    const title = clean(job.title)
    if (!externalId || !title) {
      return null
    }
    const locations = locationsFrom(job)

    return {
      provider: this.provider,
      externalId,
      title,
      companyName: source.companyName,
      location: primaryLocation(locations),
      locations,
      workMode: workModeFrom(job),
      url: jobUrl(job),
      postedAt: parseDate(job.postedToLinkedInDate),
      contentLanguage: 'en',
    }
  }
}
