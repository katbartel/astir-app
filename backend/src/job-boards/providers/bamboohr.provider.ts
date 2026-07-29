import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000
const DETAIL_TIMEOUT_MS = 10_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'

// Every BambooHR careers site serves its open roles as JSON at
// https://{handle}.bamboohr.com/careers/list — no key, no login. The response
// wraps the openings in a `result` array; each item carries the opening id and
// name, a coarse `location`/`atsLocation` pair, and an `isRemote` flag. There
// is no posted date and no per-job URL, so we build the public link from the
// handle and id: https://{handle}.bamboohr.com/careers/{id}.
type BambooLocation = {
  city?: string | null
  state?: string | null
  province?: string | null
  country?: string | null
  addressCountry?: string | null
  postalCode?: string | null
}

type BambooJob = {
  id?: string | number
  jobOpeningName?: string
  departmentLabel?: string
  employmentStatusLabel?: string
  location?: BambooLocation
  atsLocation?: BambooLocation
  isRemote?: boolean | null
  datePosted?: string | null
  description?: string | null
  locationType?: string | null
}

type BambooJobDetail = {
  location: string | null
  locations: string[]
  workMode: WorkMode | null
  postedAt: Date | null
}

function joinLocation(location: BambooLocation | undefined): string | null {
  if (!location) {
    return null
  }
  const parts = [location.city, location.state ?? location.province, location.country ?? location.addressCountry]
    .map((part) => part?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function compactText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ') : null
}

function locationFromJsonLd(value: unknown): string[] {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap(locationFromJsonLd)
  }
  if (typeof value === 'string') {
    const text = compactText(value)
    return text ? [text] : []
  }
  if (typeof value !== 'object') {
    return []
  }
  const object = value as Record<string, unknown>
  const address = object.address as Record<string, unknown> | undefined
  const parts = [
    compactText(object.name),
    compactText(address?.addressLocality),
    compactText(address?.addressRegion),
    compactText(address?.addressCountry),
  ].filter((part): part is string => !!part)
  return parts.length ? [parts.join(', ')] : []
}

function jsonLdJobPostings(html: string): Array<Record<string, unknown>> {
  const scripts = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ]
  return scripts.flatMap((match) => {
    try {
      const parsed = JSON.parse(decodeHtml(match[1].trim())) as unknown
      const values = Array.isArray(parsed) ? parsed : [parsed]
      return values.flatMap((value) => {
        if (!value || typeof value !== 'object') {
          return []
        }
        const object = value as Record<string, unknown>
        const graph = Array.isArray(object['@graph']) ? object['@graph'] : [object]
        return graph.filter((entry): entry is Record<string, unknown> => {
          if (!entry || typeof entry !== 'object') {
            return false
          }
          const type = entry['@type']
          return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))
        })
      })
    } catch {
      return []
    }
  })
}

function detailFromHtml(html: string): BambooJobDetail {
  const posting = jsonLdJobPostings(html)[0]
  if (!posting) {
    return { location: null, locations: [], workMode: null, postedAt: null }
  }
  const locations = [
    ...new Set([
      ...locationFromJsonLd(posting.jobLocation),
      ...locationFromJsonLd(posting.applicantLocationRequirements),
      compactText(posting.jobLocationType)?.toUpperCase() === 'TELECOMMUTE' ? 'Remote' : null,
    ].filter((location): location is string => !!location)),
  ]
  const workMode = locations.some((location) => /\bremote\b/i.test(location)) ? 'Remote' : null
  return {
    location: locations[0] ?? null,
    locations,
    workMode,
    postedAt: parseDate(posting.datePosted),
  }
}

function textFromHtml(html: string | null | undefined): string {
  return decodeHtml(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detailFromJob(job: BambooJob): BambooJobDetail {
  const location = joinLocation(job.atsLocation) ?? joinLocation(job.location)
  const description = textFromHtml(job.description)
  const workMode: WorkMode | null =
    job.isRemote || /\bremote\b/i.test(location ?? '') || /\bremote\b/i.test(description) ? 'Remote' : null
  const locations = [...new Set([location, workMode === 'Remote' && !location ? 'Remote' : null].filter((value): value is string => !!value))]
  return {
    location: location ?? locations[0] ?? null,
    locations,
    workMode,
    postedAt: parseDate(job.datePosted),
  }
}

@Injectable()
export class BambooHrProvider implements AtsProvider {
  readonly provider = 'bamboohr'
  readonly kind = 'ats' as const

  private listUrl(handle: string): string {
    return `https://${encodeURIComponent(handle)}.bamboohr.com/careers/list`
  }

  handleFromUrl(url: string): string | null {
    // Careers sites live at https://{account}.bamboohr.com/careers[/{id}]. Only
    // the account subdomain carries the handle; the platform's own hosts
    // (www, staticfe, content, etc.) never do.
    const match = url.match(/([a-z0-9-]+)\.bamboohr\.com/i)
    if (!match) {
      return null
    }
    const handle = match[1].toLowerCase()
    return ['www', 'staticfe', 'content'].includes(handle) ? null : handle
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(this.listUrl(handle), PROBE_TIMEOUT_MS)) as {
        result?: unknown[]
      }
      return Array.isArray(payload.result)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const payload = (await fetchJson(this.listUrl(source.externalId))) as { result?: BambooJob[] }
    if (!Array.isArray(payload.result)) {
      throw new Error(`BambooHR site "${source.externalId}" returned no result array`)
    }
    const jobs = await Promise.all(
      payload.result.map(async (job) => this.normalize(job, source, await this.fetchDetail(source.externalId, job))),
    )
    return jobs.filter((job): job is NormalizedJob => job !== null)
  }

  private async fetchDetail(handle: string, job: BambooJob): Promise<BambooJobDetail | null> {
    if (job.id === undefined || job.id === null) {
      return null
    }
    try {
      const detailResponse = await fetch(`https://${handle}.bamboohr.com/careers/${job.id}/detail`, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      })
      if (detailResponse.ok) {
        const payload = (await detailResponse.json()) as { result?: { jobOpening?: BambooJob } }
        if (payload.result?.jobOpening) {
          return detailFromJob(payload.result.jobOpening)
        }
      }
      const response = await fetch(`https://${handle}.bamboohr.com/careers/${job.id}`, {
        headers: { accept: 'text/html', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      })
      if (!response.ok) {
        return null
      }
      return detailFromHtml(await response.text())
    } catch {
      return null
    }
  }

  normalize(job: BambooJob, source: JobBoardSourceRef, detail: BambooJobDetail | null = null): NormalizedJob | null {
    if (job.id === undefined || job.id === null || !job.jobOpeningName) {
      return null
    }
    const location = joinLocation(job.atsLocation) ?? joinLocation(job.location)
    const locations = [...new Set([location, ...(detail?.locations ?? [])].filter((value): value is string => !!value))]
    const workMode: WorkMode | null = job.isRemote
      ? 'Remote'
      : /\bremote\b/i.test(location ?? '')
        ? 'Remote'
        : detail?.workMode ?? null
    return {
      provider: this.provider,
      externalId: String(job.id),
      title: job.jobOpeningName.trim(),
      // The feed is single-tenant and carries no company name.
      companyName: source.companyName,
      location: location ?? detail?.location ?? null,
      locations,
      workMode,
      url: `https://${source.externalId}.bamboohr.com/careers/${job.id}`,
      postedAt: detail?.postedAt ?? null,
    }
  }
}
