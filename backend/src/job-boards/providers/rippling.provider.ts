import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; JobBoardBot/1.0; +https://example.com/bot)'

type RipplingLocation = {
  name?: string
  country?: string
  state?: string | null
  city?: string | null
  workplaceType?: string | null
}

type RipplingJob = {
  id?: string
  uuid?: string
  name?: string
  url?: string
  department?: { name?: string }
  locations?: RipplingLocation[]
  workLocation?: { label?: string; id?: string }
  language?: string
}

type RipplingQuery = {
  state?: {
    data?: {
      items?: RipplingJob[]
    }
  }
  queryKey?: unknown[]
}

function isJobPostsQuery(query: RipplingQuery): boolean {
  return Array.isArray(query.queryKey) && query.queryKey.includes('job-posts')
}

export function ripplingJobsFromHtml(html: string): RipplingJob[] {
  const match = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) {
    return []
  }
  try {
    const data = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          dehydratedState?: { queries?: RipplingQuery[] }
        }
      }
    }
    const query = data.props?.pageProps?.dehydratedState?.queries?.find(isJobPostsQuery)
    const jobs = query?.state?.data?.items
    return Array.isArray(jobs) ? jobs : []
  } catch {
    return []
  }
}

export function ripplingJobsFromApi(payload: unknown): RipplingJob[] {
  return Array.isArray(payload) ? (payload as RipplingJob[]) : []
}

function locationName(location: RipplingLocation): string | null {
  return [location.name, location.city, location.state, location.country]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(', ') || null
}

function workModeFrom(job: RipplingJob): WorkMode | null {
  const haystack = [
    ...(job.locations ?? []).map((location) => `${location.workplaceType ?? ''} ${location.name ?? ''}`),
    job.workLocation?.label ?? '',
  ].join(' ')
    .toLowerCase()
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

@Injectable()
export class RipplingProvider implements AtsProvider {
  readonly provider = 'rippling'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    const apiMatch = url.match(/api\.rippling\.com\/platform\/api\/ats\/v1\/board\/([a-z0-9-]+)\/jobs/i)
    if (apiMatch) {
      return `api:${apiMatch[1].toLowerCase()}`
    }
    const match = url.match(/ats\.rippling\.com\/(?:(?:[a-z]{2}(?:-[A-Z]{2})?)\/)?([a-z0-9-]+)\/jobs/i)
    return match ? match[1].toLowerCase() : null
  }

  candidateHandles(): string[] {
    return []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      await this.fetchJobs(handle)
      return true
    } catch {
      return false
    }
  }

  private async fetchJobs(handle: string): Promise<RipplingJob[]> {
    if (handle.startsWith('api:')) {
      const board = handle.slice(4)
      const url = `https://api.rippling.com/platform/api/ats/v1/board/${encodeURIComponent(board)}/jobs`
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`GET ${url} responded ${response.status}`)
      }
      return ripplingJobsFromApi(await response.json())
    }
    const url = `https://ats.us1.rippling.com/${encodeURIComponent(handle)}/jobs`
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${url} responded ${response.status}`)
    }
    return ripplingJobsFromHtml(await response.text())
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    return (await this.fetchJobs(source.externalId))
      .map((job) => this.normalize(job, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: RipplingJob, source: JobBoardSourceRef): NormalizedJob | null {
    const id = job.id ?? job.uuid
    if (!id || !job.name || !job.url) {
      return null
    }
    const locations = [
      ...new Set(
        [
          ...(job.locations ?? []).map(locationName),
          job.workLocation?.label?.trim() || null,
        ].filter((name): name is string => !!name),
      ),
    ]
    return {
      provider: this.provider,
      externalId: id,
      title: job.name.trim(),
      companyName: source.companyName,
      location: locations[0] ?? null,
      locations,
      workMode: workModeFrom(job),
      url: job.url,
      postedAt: null,
      contentLanguage: job.language?.split('-')[0]?.toLowerCase() || null,
    }
  }
}
