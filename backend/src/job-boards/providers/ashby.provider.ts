import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000
const FETCH_TIMEOUT_MS = 15_000

// Some Ashby orgs disable the public REST posting-api (it 404s) but still serve
// their board through the same GraphQL endpoint the hosted jobs page uses. We
// fall back to it so those boards (e.g. Whatnot) resolve and ingest. Only the
// brief fields we can map are requested; the GraphQL brief carries no publish
// date or per-job URL, so we synthesize the canonical hosted URL from the
// handle + posting id and leave postedAt null.
const GRAPHQL_URL = 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams'
const BOARD_QUERY =
  'query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {' +
  ' jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {' +
  ' jobPostings { id title locationName workplaceType secondaryLocations { locationName } } } }'

type AshbyGqlPosting = {
  id?: string
  title?: string
  locationName?: string
  workplaceType?: string
  secondaryLocations?: Array<{ locationName?: string }>
}

// Subset of https://api.ashbyhq.com/posting-api/job-board/{name} we rely on.
type AshbyJob = {
  id?: string
  title?: string
  location?: string
  secondaryLocations?: Array<{ location?: string }>
  address?: { postalAddress?: { addressCountry?: string } }
  isListed?: boolean
  isRemote?: boolean
  workplaceType?: string
  jobUrl?: string
  publishedAt?: string
}

function locationsFromAshby(job: AshbyJob): string[] {
  const locations = [
    job.location,
    ...(job.secondaryLocations ?? []).map((secondary) => secondary.location),
    job.address?.postalAddress?.addressCountry,
  ]
  return [...new Set(locations.map((value) => value?.trim()).filter((value): value is string => !!value))]
}

function workModeFromAshby(job: AshbyJob): WorkMode | null {
  switch (job.workplaceType) {
    case 'Remote':
      return 'Remote'
    case 'Hybrid':
      return 'Hybrid'
    case 'OnSite':
      return 'On-Site'
    default:
      return job.isRemote ? 'Remote' : null
  }
}

@Injectable()
export class AshbyProvider implements AtsProvider {
  readonly provider = 'ashby'
  readonly kind = 'ats' as const

  private boardUrl(handle: string): string {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(handle)}`
  }

  // Query the hosted-board GraphQL endpoint for orgs whose REST board is off.
  // Throws (like fetchJson) when the org is unknown or the shape is unexpected,
  // so callers can treat it as "not found" / fall through.
  private async fetchGraphqlPostings(
    handle: string,
    timeoutMs = FETCH_TIMEOUT_MS,
  ): Promise<AshbyGqlPosting[]> {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        operationName: 'ApiJobBoardWithTeams',
        variables: { organizationHostedJobsPageName: handle },
        query: BOARD_QUERY,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`POST Ashby GraphQL for "${handle}" responded ${response.status}`)
    }
    const payload = (await response.json()) as {
      data?: { jobBoard?: { jobPostings?: AshbyGqlPosting[] } | null }
    }
    const postings = payload.data?.jobBoard?.jobPostings
    if (!Array.isArray(postings)) {
      throw new Error(`Ashby GraphQL board "${handle}" returned no jobPostings`)
    }
    return postings
  }

  handleFromUrl(url: string): string | null {
    const match = url.match(/(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([a-z0-9.-]+)/i)
    return match ? match[1].toLowerCase() : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(this.boardUrl(handle), PROBE_TIMEOUT_MS)) as {
        jobs?: unknown[]
      }
      if (Array.isArray(payload.jobs)) {
        return true
      }
    } catch {
      // REST board disabled or unreachable — try GraphQL below.
    }
    try {
      const postings = await this.fetchGraphqlPostings(handle, PROBE_TIMEOUT_MS)
      return Array.isArray(postings)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    // Prefer the REST posting-api: it carries publish dates and canonical job
    // URLs. Fall back to GraphQL only when REST is unavailable (404) or serves
    // no jobs array, so the common case is unchanged.
    try {
      const payload = (await fetchJson(this.boardUrl(source.externalId))) as { jobs?: AshbyJob[] }
      if (Array.isArray(payload.jobs)) {
        return payload.jobs
          .filter((job) => job.isListed !== false)
          .map((job) => this.normalize(job, source))
          .filter((job): job is NormalizedJob => job !== null)
      }
    } catch {
      // Fall through to GraphQL.
    }
    const postings = await this.fetchGraphqlPostings(source.externalId)
    return postings
      .map((posting) => this.normalizeGraphql(posting, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalizeGraphql(posting: AshbyGqlPosting, source: JobBoardSourceRef): NormalizedJob | null {
    if (!posting.id || !posting.title) {
      return null
    }
    const primary = posting.locationName?.trim() || null
    const locations = [
      ...new Set(
        [primary, ...(posting.secondaryLocations ?? []).map((s) => s.locationName?.trim())].filter(
          (value): value is string => !!value,
        ),
      ),
    ]
    return {
      provider: this.provider,
      externalId: posting.id,
      title: posting.title.trim(),
      companyName: source.companyName,
      location: primary,
      locations,
      workMode: workModeFromAshby({ workplaceType: posting.workplaceType }),
      url: `https://jobs.ashbyhq.com/${encodeURIComponent(source.externalId)}/${posting.id}`,
      postedAt: null,
    }
  }

  normalize(job: AshbyJob, source: JobBoardSourceRef): NormalizedJob | null {
    if (!job.id || !job.title || !job.jobUrl) {
      return null
    }
    return {
      provider: this.provider,
      externalId: job.id,
      title: job.title.trim(),
      companyName: source.companyName,
      location: job.location?.trim() || null,
      locations: locationsFromAshby(job),
      workMode: workModeFromAshby(job),
      url: job.jobUrl,
      postedAt: parseDate(job.publishedAt),
    }
  }
}
