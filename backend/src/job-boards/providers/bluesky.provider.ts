import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; JobBoardBot/1.0; +https://example.com/bot)'

// Bespoke, single-company scraper. Bluesky has no supported ATS: its careers
// page applies through Gem, whose board API is login-gated. But the page itself
// is a Next.js app that embeds every posting as structured JSON in its
// __NEXT_DATA__ blob (props.pageProps.jobs), so we read that rather than
// scraping rendered HTML. This is a maintenance liability — it breaks if
// Bluesky changes their page shape — hence it is scoped to the one URL and
// resolves by URL only (no name probing).
const CAREERS_URL = 'https://bsky.social/about/join'

type BlueskyJob = {
  id?: string
  title?: string
  department?: string
  location?: string
  locationType?: string
  employmentType?: string
  applyUrl?: string
  updatedAt?: string
}

// Pull props.pageProps.jobs out of the Next.js data blob. Returns [] on any
// shape/parse surprise so a page redesign degrades to "no jobs", not a throw.
export function jobsFromHtml(html: string): BlueskyJob[] {
  const match = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) {
    return []
  }
  try {
    const data = JSON.parse(match[1]) as { props?: { pageProps?: { jobs?: BlueskyJob[] } } }
    const jobs = data.props?.pageProps?.jobs
    return Array.isArray(jobs) ? jobs : []
  } catch {
    return []
  }
}

function workModeFrom(job: BlueskyJob): WorkMode | null {
  const haystack = `${job.locationType ?? ''} ${job.location ?? ''}`.toLowerCase()
  if (/remote/.test(haystack)) {
    return 'Remote'
  }
  if (/hybrid/.test(haystack)) {
    return 'Hybrid'
  }
  if (/on-?site|in-?office/.test(haystack)) {
    return 'On-Site'
  }
  return null
}

@Injectable()
export class BlueskyProvider implements AtsProvider {
  readonly provider = 'bluesky'
  readonly kind = 'ats' as const

  // Only Bluesky's own careers host maps here, and it always canonicalizes to
  // the single page we know how to read.
  handleFromUrl(url: string): string | null {
    return /(^|\/\/|\.)bsky\.social(\/|$)/i.test(url) ? CAREERS_URL : null
  }

  // A bespoke page scraper cannot be guessed from a company name.
  candidateHandles(): string[] {
    return []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      return (await this.fetchJobs(handle)).length > 0
    } catch {
      return false
    }
  }

  private async fetchJobs(careersUrl: string): Promise<BlueskyJob[]> {
    const response = await fetch(careersUrl, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${careersUrl} responded ${response.status}`)
    }
    return jobsFromHtml(await response.text())
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const jobs = await this.fetchJobs(source.externalId)
    return jobs
      .map((job) => this.normalize(job, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: BlueskyJob, source: JobBoardSourceRef): NormalizedJob | null {
    if (!job.id || !job.title || !job.applyUrl) {
      return null
    }
    const location = job.location?.trim() || null
    return {
      provider: this.provider,
      externalId: job.id,
      title: job.title.trim(),
      companyName: source.companyName,
      location,
      locations: location ? [location] : [],
      workMode: workModeFrom(job),
      url: job.applyUrl,
      postedAt: parseDate(job.updatedAt),
    }
  }
}
