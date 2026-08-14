import { Injectable } from '@nestjs/common'
import { textFromHtml } from '../description-fetching'
import { NormalizedJob, WorkMode } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000
const FETCH_TIMEOUT_MS = 15_000
const PAGE_LIMIT = 20
// Cap the newest-first pull so one large tenant can't run away (20/page).
const MAX_PAGES = 25

// Workday's public career-site API (CXS). Unlike the other ATSes there is no
// single slug: a board is identified by tenant, data-center ("wd1".."wd105")
// and site name, all three visible in a careers URL
// (https://{tenant}.{dc}.myworkdayjobs.com/{lang}/{site}). We pack them into
// the handle as "{tenant}:{dc}:{site}". Because the data-center and site can't
// be guessed from a company name, Workday resolves only from a careers URL.
type WorkdayHandle = {
  tenant: string
  dc: string
  site: string
}

type WorkdayPosting = {
  title?: string
  // e.g. "/job/US-MA-Westford/Senior-ASIC-Timing-Engineer_JR2011363-1"
  externalPath?: string
  // Either a real place or a count like "3 Locations" for multi-location roles.
  locationsText?: string
  // Usually relative text from Workday, e.g. "Posted Today" or
  // "Posted 4 Days Ago".
  postedOn?: string
  // Typically [reqId], e.g. ["JR2011363"].
  bulletFields?: string[]
}

type WorkdayPostingDetail = {
  jobPostingInfo?: {
    jobDescription?: string
    location?: string
    additionalLocations?: string[]
    postedOn?: string
    jobReqId?: string
    remoteType?: string
  }
}

function parseHandle(handle: string): WorkdayHandle | null {
  const [tenant, dc, ...rest] = handle.split(':')
  const site = rest.join(':')
  return tenant && dc && site ? { tenant, dc, site } : null
}

function hostFor(parsed: WorkdayHandle): string {
  return `${parsed.tenant}.${parsed.dc}.myworkdayjobs.com`
}

// "3 Locations" is a count, not a place — drop it. A single stated location
// (e.g. "US-MA-Westford") is kept as-is; the list endpoint carries no richer
// location data.
function locationFromWorkday(text: string | undefined): string | null {
  const trimmed = text?.trim()
  if (!trimmed || /^\d+\s+locations?$/i.test(trimmed)) {
    return null
  }
  return trimmed
}

function workModeFromWorkday(text: string | null): WorkMode | null {
  return text?.toLowerCase().includes('remote') ? 'Remote' : null
}

function detailLocations(detail: WorkdayPostingDetail | null): string[] {
  const info = detail?.jobPostingInfo
  return [
    info?.location,
    ...(info?.additionalLocations ?? []),
  ].map((location) => location?.trim()).filter((location): location is string => Boolean(location))
}

function shouldFetchDetail(posting: WorkdayPosting): boolean {
  return !locationFromWorkday(posting.locationsText)
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function parseWorkdayPostedOn(value: string | undefined, referenceDate = new Date()): Date | null {
  if (!value) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'posted today') {
    return startOfUtcDay(referenceDate)
  }
  if (normalized === 'posted yesterday') {
    const date = startOfUtcDay(referenceDate)
    date.setUTCDate(date.getUTCDate() - 1)
    return date
  }
  const daysMatch = normalized.match(/^posted\s+(\d+)\s+days?\s+ago$/)
  if (!daysMatch) {
    return null
  }
  const daysAgo = Number(daysMatch[1])
  if (!Number.isInteger(daysAgo)) {
    return null
  }
  const date = startOfUtcDay(referenceDate)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date
}

@Injectable()
export class WorkdayProvider implements AtsProvider {
  readonly provider = 'workday'
  readonly kind = 'ats' as const

  private jobsUrl(parsed: WorkdayHandle): string {
    return `https://${hostFor(parsed)}/wday/cxs/${parsed.tenant}/${parsed.site}/jobs`
  }

  handleFromUrl(url: string): string | null {
    const match = url.match(/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/([^?#]*)/i)
    if (!match) {
      return null
    }
    const tenant = match[1].toLowerCase()
    const dc = match[2].toLowerCase()
    const segments = match[3].split('/').filter(Boolean)
    // Drop a leading locale segment ("en-US") if present; the next segment is
    // the site name, which is case-sensitive and must be kept verbatim.
    if (segments[0] && /^[a-z]{2}-[a-z]{2}$/i.test(segments[0])) {
      segments.shift()
    }
    const site = segments[0]
    return site ? `${tenant}:${dc}:${site}` : null
  }

  // A company name never reveals the data-center or site, so guessing is
  // hopeless — Workday boards resolve from a careers URL only.
  candidateHandles(): string[] {
    return []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    const parsed = parseHandle(handle)
    if (!parsed) {
      return false
    }
    try {
      const payload = await this.queryJobs(parsed, 0, 1, PROBE_TIMEOUT_MS)
      return typeof payload.total === 'number'
    } catch {
      return false
    }
  }

  private async queryJobs(
    parsed: WorkdayHandle,
    offset: number,
    limit: number,
    timeoutMs: number,
  ): Promise<{ total?: number; jobPostings?: WorkdayPosting[] }> {
    const response = await fetch(this.jobsUrl(parsed), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: '' }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`POST ${this.jobsUrl(parsed)} responded ${response.status}`)
    }
    return response.json() as Promise<{ total?: number; jobPostings?: WorkdayPosting[] }>
  }

  private async queryJobDetail(
    parsed: WorkdayHandle,
    externalPath: string,
  ): Promise<WorkdayPostingDetail | null> {
    try {
      const response = await fetch(`https://${hostFor(parsed)}/wday/cxs/${parsed.tenant}/${parsed.site}${externalPath}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) {
        return null
      }
      return response.json() as Promise<WorkdayPostingDetail>
    } catch {
      return null
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const parsed = parseHandle(source.externalId)
    if (!parsed) {
      throw new Error(`Workday handle "${source.externalId}" is not tenant:dc:site`)
    }
    const jobs: NormalizedJob[] = []
    let total: number | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await this.queryJobs(parsed, page * PAGE_LIMIT, PAGE_LIMIT, FETCH_TIMEOUT_MS)
      if (!Array.isArray(payload.jobPostings)) {
        throw new Error(`Workday board "${source.externalId}" returned no jobPostings array`)
      }
      if (total === null && typeof payload.total === 'number' && payload.total > 0) {
        total = payload.total
      }
      for (const posting of payload.jobPostings) {
        const detail = posting.externalPath && shouldFetchDetail(posting)
          ? await this.queryJobDetail(parsed, posting.externalPath)
          : null
        const normalized = this.normalize(posting, source, detail)
        if (normalized) {
          jobs.push(normalized)
        }
      }
      if (!payload.jobPostings.length || (total !== null && (page + 1) * PAGE_LIMIT >= total)) {
        break
      }
    }
    return jobs
  }

  normalize(
    posting: WorkdayPosting,
    source: JobBoardSourceRef,
    detail: WorkdayPostingDetail | null = null,
  ): NormalizedJob | null {
    const parsed = parseHandle(source.externalId)
    if (!parsed || !posting.title || !posting.externalPath) {
      return null
    }
    const locations = detailLocations(detail)
    const location = locations[0] ?? locationFromWorkday(posting.locationsText)
    const descriptionText = detail?.jobPostingInfo?.jobDescription
      ? textFromHtml(detail.jobPostingInfo.jobDescription)
      : null
    return {
      provider: this.provider,
      externalId: detail?.jobPostingInfo?.jobReqId?.trim() || posting.bulletFields?.[0]?.trim() || posting.externalPath,
      title: posting.title.trim(),
      companyName: source.companyName,
      location,
      locations: locations.length ? locations : location ? [location] : [],
      workMode: workModeFromWorkday(detail?.jobPostingInfo?.remoteType ?? location),
      url: `https://${hostFor(parsed)}/en-US/${parsed.site}${posting.externalPath}`,
      postedAt: parseWorkdayPostedOn(detail?.jobPostingInfo?.postedOn ?? posting.postedOn),
      descriptionText,
    }
  }
}
