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
// join.com's public API rejects any pageSize above 5 with a 422 validation
// error, so a full board is walked five jobs at a time via the page param.
const PAGE_SIZE = 5
// Careers pages block obvious bots; present a browser-ish UA.
const USER_AGENT =
  'Mozilla/5.0 (compatible; JobBoardBot/1.0; +https://example.com/bot)'

// Join tags each job with a numeric languageId (the language the ad is written
// in). The set is small and stable — mirror of https://join.com/api/languages,
// which maps id -> ISO 639-1 code. Unknown ids fall through to null.
const JOIN_LANGUAGES: Record<number, string> = {
  1: 'de',
  2: 'it',
  3: 'fr',
  5: 'en',
  16: 'nl',
  17: 'es',
}

// join.com (a European ATS) has no slug-scoped jobs API: the public jobs
// endpoint is keyed by a numeric company id, and the only place that id is
// exposed is the Next.js __NEXT_DATA__ blob embedded in the company's careers
// page. So a board is identified by its careers slug — what a user pastes or
// what we guess from the name — and every fetch first resolves that slug to
// the numeric id (and canonical domain used for job links).

// Subset of https://join.com/api/public/companies/{id}/jobs we rely on. Only
// ONLINE jobs are returned. Salary/category fields are ignored.
type JoinJob = {
  id?: number | string
  // Slug fragment used to build the public job URL, e.g. "16425272-vp-revenue".
  idParam?: string
  title?: string
  createdAt?: string
  workplaceType?: string // ONSITE | REMOTE | HYBRID
  languageId?: number
  city?: { cityName?: string; regionName?: string; countryName?: string }
  country?: { name?: string }
}

type JoinCompany = { id: number; domain: string; name: string }

function joinPlace(parts: Array<string | undefined>): string | null {
  const cleaned = parts.map((part) => part?.trim()).filter(Boolean)
  return cleaned.length ? cleaned.join(', ') : null
}

function locationsFromJoin(job: JoinJob): string[] {
  const place = joinPlace([job.city?.cityName, job.city?.countryName ?? job.country?.name])
  return place ? [place] : []
}

function workModeFromJoin(job: JoinJob): WorkMode | null {
  switch (job.workplaceType) {
    case 'REMOTE':
      return 'Remote'
    case 'HYBRID':
      return 'Hybrid'
    case 'ONSITE':
      return 'On-Site'
    default:
      return null
  }
}

@Injectable()
export class JoinProvider implements AtsProvider {
  readonly provider = 'join'
  readonly kind = 'ats' as const

  private companyUrl(slug: string): string {
    return `https://join.com/companies/${encodeURIComponent(slug)}`
  }

  private jobsUrl(companyId: number, page: number): string {
    return `https://join.com/api/public/companies/${companyId}/jobs?locale=en-us&page=${page}&pageSize=${PAGE_SIZE}`
  }

  handleFromUrl(url: string): string | null {
    // Career sites live at https://join.com/companies/{slug}[/{job}]. The first
    // path segment after /companies/ is the board slug.
    const match = url.match(/join\.com\/companies\/([a-z0-9-]+)/i)
    return match ? match[1].toLowerCase() : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    const company = await this.resolveCompany(handle, PROBE_TIMEOUT_MS)
    if (!company) {
      return false
    }
    try {
      const payload = (await fetchJson(this.jobsUrl(company.id, 1), PROBE_TIMEOUT_MS)) as {
        items?: unknown[]
      }
      return Array.isArray(payload.items)
    } catch {
      return false
    }
  }

  // Reads the numeric company id (and canonical domain) out of the careers
  // page's __NEXT_DATA__. Returns null when the slug 404s or carries no
  // company, which is how an unknown handle fails verification.
  private async resolveCompany(
    slug: string,
    timeoutMs = FETCH_TIMEOUT_MS,
  ): Promise<JoinCompany | null> {
    let html: string
    try {
      const response = await fetch(this.companyUrl(slug), {
        headers: { accept: 'text/html', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        return null
      }
      html = await response.text()
    } catch {
      return null
    }
    const match = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!match) {
      return null
    }
    try {
      const data = JSON.parse(match[1]) as {
        props?: {
          pageProps?: {
            initialState?: { company?: { id?: unknown; domain?: unknown; name?: unknown } }
          }
        }
      }
      const company = data.props?.pageProps?.initialState?.company
      if (!company || typeof company.id !== 'number') {
        return null
      }
      return {
        id: company.id,
        domain: typeof company.domain === 'string' && company.domain ? company.domain : slug,
        name: typeof company.name === 'string' ? company.name : '',
      }
    } catch {
      return null
    }
  }

  private async fetchAllJobs(companyId: number): Promise<JoinJob[]> {
    const jobs: JoinJob[] = []
    let page = 1
    for (;;) {
      const payload = (await fetchJson(this.jobsUrl(companyId, page))) as {
        items?: JoinJob[]
        pagination?: { pageCount?: number }
      }
      if (!Array.isArray(payload.items)) {
        if (page === 1) {
          throw new Error(`Join company ${companyId} returned no items array`)
        }
        break
      }
      jobs.push(...payload.items)
      const pageCount = payload.pagination?.pageCount ?? 1
      if (page >= pageCount || payload.items.length === 0) {
        break
      }
      page += 1
    }
    return jobs
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const company = await this.resolveCompany(source.externalId)
    if (!company) {
      return []
    }
    const jobs = await this.fetchAllJobs(company.id)
    return jobs
      .map((job) => this.normalize(job, source, company.domain))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: JoinJob, source: JobBoardSourceRef, domain: string): NormalizedJob | null {
    if (job.id === undefined || !job.title || !job.idParam) {
      return null
    }
    const locations = locationsFromJoin(job)
    return {
      provider: this.provider,
      externalId: String(job.id),
      title: job.title.trim(),
      companyName: source.companyName,
      location: locations[0] ?? null,
      locations,
      workMode: workModeFromJoin(job),
      url: `https://join.com/companies/${domain}/${job.idParam}`,
      postedAt: parseDate(job.createdAt),
      contentLanguage: (job.languageId !== undefined && JOIN_LANGUAGES[job.languageId]) || null,
    }
  }
}
