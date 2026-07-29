import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000

// Subset of https://apply.workable.com/api/v1/widget/accounts/{subdomain}.
type WorkableJob = {
  id?: string
  title?: string
  shortcode?: string
  url?: string
  telecommuting?: boolean
  city?: string
  country?: string
  location?: { city?: string; region?: string; subregion?: string; country?: string; countryName?: string; locationStr?: string }
  locationsText?: string
  locations?: Array<{ city?: string; region?: string; country?: string } | string>
  published_on?: string
  created_at?: string
  published?: string
  created?: string
  workplace?: string
}

function joinPlace(parts: Array<string | undefined>): string | null {
  const cleaned = parts.map((part) => part?.trim()).filter(Boolean)
  return cleaned.length ? cleaned.join(', ') : null
}

function locationFromWorkable(job: WorkableJob): string | null {
  return joinPlace([job.city, job.country])
}

function locationsFromWorkable(job: WorkableJob): string[] {
  const places = [
    job.location?.locationStr?.trim() || null,
    joinPlace([job.location?.city, job.location?.subregion ?? job.location?.region, job.location?.countryName ?? job.location?.country]),
    locationFromWorkable(job),
    ...(job.locations ?? []).map((place) =>
      typeof place === 'string' ? place.trim() : joinPlace([place.city, place.region, place.country]),
    ),
    job.locationsText?.trim() || null,
  ]
  return [...new Set(places.filter((place): place is string => !!place && place !== 'TELECOMMUTE'))]
}

function workModeFromWorkable(job: WorkableJob): WorkMode | null {
  const haystack = [
    job.title,
    job.workplace,
    job.locationsText,
    job.location?.locationStr,
    ...(job.locations ?? []).map((location) =>
      typeof location === 'string' ? location : joinPlace([location.city, location.region, location.country]),
    ),
  ]
    .join(' ')
    .toLowerCase()
  return job.telecommuting || haystack.includes('remote') ? 'Remote' : null
}

@Injectable()
export class WorkableProvider implements AtsProvider {
  readonly provider = 'workable'
  readonly kind = 'ats' as const

  private accountUrl(handle: string): string {
    return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(handle)}`
  }

  private companyPageUrl(handle: string): string {
    return `https://jobs.workable.com/company/${handle
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`
  }

  handleFromUrl(url: string): string | null {
    // Workable careers pages look like https://apply.workable.com/{account}/
    // or https://{account}.workable.com/. Per-job /j/{code} links carry no
    // account slug, so they are intentionally not matched here.
    const applyMatch = url.match(/apply\.workable\.com\/([a-z0-9-]+)(?:\/|$)/i)
    if (applyMatch && applyMatch[1] !== 'j') {
      return applyMatch[1].toLowerCase()
    }
    const companyPageMatch = url.match(/jobs\.workable\.com\/company\/(.+?)(?:[?#]|$)/i)
    if (companyPageMatch) {
      return `company:${companyPageMatch[1]}`
    }
    const subdomainMatch = url.match(/([a-z0-9-]+)\.workable\.com/i)
    return subdomainMatch && subdomainMatch[1] !== 'apply'
      ? subdomainMatch[1].toLowerCase()
      : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      if (handle.startsWith('company:')) {
        await this.fetchCompanyPageJobs(handle.slice('company:'.length), PROBE_TIMEOUT_MS)
        return true
      }
      const payload = (await fetchJson(this.accountUrl(handle), PROBE_TIMEOUT_MS)) as {
        jobs?: unknown[]
      }
      return Array.isArray(payload.jobs)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    if (source.externalId.startsWith('company:')) {
      const payload = await this.fetchCompanyPageJobs(source.externalId.slice('company:'.length))
      return payload.jobs
        .map((job) => this.normalize(job, payload.companyName || source.companyName))
        .filter((job): job is NormalizedJob => job !== null)
    }

    const payload = (await fetchJson(this.accountUrl(source.externalId))) as {
      name?: string
      jobs?: WorkableJob[]
    }
    if (!Array.isArray(payload.jobs)) {
      throw new Error(`Workable account "${source.externalId}" returned no jobs array`)
    }
    const companyName = payload.name?.trim() || source.companyName
    return payload.jobs
      .map((job) => this.normalize(job, companyName))
      .filter((job): job is NormalizedJob => job !== null)
  }

  private async fetchCompanyPageJobs(
    handle: string,
    timeoutMs = 15_000,
  ): Promise<{ companyName: string | null; jobs: WorkableJob[] }> {
    const response = await fetch(this.companyPageUrl(handle), {
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`GET ${this.companyPageUrl(handle)} responded ${response.status}`)
    }
    const html = await response.text()
    const match = html.match(/initialState:\s*/)
    if (!match) {
      return { companyName: null, jobs: [] }
    }
    const start = match.index! + match[0].length
    let depth = 0
    let end = -1
    for (let index = start; index < html.length; index += 1) {
      const char = html[index]
      if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          end = index + 1
          break
        }
      }
    }
    if (end === -1) {
      return { companyName: null, jobs: [] }
    }
    const initialState = JSON.parse(html.slice(start, end)) as Record<
      string,
      { data?: { title?: string; jobs?: WorkableJob[] } }
    >
    const company = Object.values(initialState).find((entry) => Array.isArray(entry.data?.jobs))
    return {
      companyName: company?.data?.title?.trim() || null,
      jobs: company?.data?.jobs ?? [],
    }
  }

  normalize(job: WorkableJob, companyName: string): NormalizedJob | null {
    const externalId = job.shortcode || job.id
    const url = job.url || (job.id ? `https://jobs.workable.com/view/${encodeURIComponent(job.id)}` : null)
    if (!externalId || !job.title || !url) {
      return null
    }
    const locations = locationsFromWorkable(job)
    return {
      provider: this.provider,
      externalId,
      title: job.title.trim(),
      companyName,
      location: locationFromWorkable(job) ?? locations[0] ?? null,
      locations,
      workMode: workModeFromWorkable(job),
      url,
      postedAt: parseDate(job.published_on) ?? parseDate(job.created_at) ?? parseDate(job.published) ?? parseDate(job.created),
    }
  }
}
