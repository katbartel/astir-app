import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000

// Subset of https://boards-api.greenhouse.io/v1/boards/{token}/jobs we rely on.
type GreenhouseJob = {
  id?: number | string
  title?: string
  absolute_url?: string
  company_name?: string
  location?: { name?: string }
  first_published?: string
  updated_at?: string
}

type GreenhouseEuJob = {
  id?: number | string
  title?: string
  absolute_url?: string
  location?: string
  published_at?: string
  updated_at?: string
}

function workModeFromLocation(location: string | null): WorkMode | null {
  if (!location) {
    return null
  }
  const lowered = location.toLowerCase()
  if (lowered.includes('remote')) {
    return 'Remote'
  }
  if (lowered.includes('hybrid')) {
    return 'Hybrid'
  }
  return null
}

function normalizeJob(
  job: {
    id?: number | string
    title?: string
    absolute_url?: string
    company_name?: string
    location?: string | { name?: string }
    first_published?: string
    published_at?: string
    updated_at?: string
  },
  source: JobBoardSourceRef,
): NormalizedJob | null {
  if (job.id === undefined || !job.title || !job.absolute_url) {
    return null
  }
  const location =
    typeof job.location === 'string'
      ? job.location.trim() || null
      : job.location?.name?.trim() || null
  return {
    provider: 'greenhouse',
    externalId: String(job.id),
    title: job.title.trim(),
    companyName: job.company_name?.trim() || source.companyName,
    location,
    locations: location ? [location] : [],
    workMode: workModeFromLocation(location),
    url: job.absolute_url,
    postedAt: parseDate(job.first_published) ?? parseDate(job.published_at) ?? parseDate(job.updated_at),
  }
}

export function greenhouseEuJobsFromHtml(
  html: string,
  source: JobBoardSourceRef,
): NormalizedJob[] {
  const marker = 'window.__remixContext = '
  const start = html.indexOf(marker)
  if (start === -1) {
    return []
  }
  const end = html.indexOf(';</script>', start)
  if (end === -1) {
    return []
  }
  try {
    const context = JSON.parse(html.slice(start + marker.length, end)) as {
      state?: {
        loaderData?: {
          'routes/$url_token'?: { jobPosts?: { data?: GreenhouseEuJob[] } }
        }
      }
    }
    const jobs = context.state?.loaderData?.['routes/$url_token']?.jobPosts?.data
    if (!Array.isArray(jobs)) {
      return []
    }
    return jobs.map((job) => normalizeJob(job, source)).filter((job): job is NormalizedJob => job !== null)
  } catch {
    return []
  }
}

@Injectable()
export class GreenhouseProvider implements AtsProvider {
  readonly provider = 'greenhouse'
  readonly kind = 'ats' as const

  private jobsUrl(handle: string): string {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(handle)}/jobs`
  }

  private euPageUrl(handle: string): string {
    return `https://job-boards.eu.greenhouse.io/${encodeURIComponent(handle.slice(3))}`
  }

  private isEuHandle(handle: string): boolean {
    return handle.startsWith('eu:')
  }

  handleFromUrl(url: string): string | null {
    const euMatch = url.match(
      /(?:boards|job-boards)\.eu\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9-]+)/i,
    )
    if (euMatch) {
      return `eu:${euMatch[1].toLowerCase()}`
    }
    const match = url.match(
      /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9-]+)/i,
    )
    return match ? match[1].toLowerCase() : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      if (this.isEuHandle(handle)) {
        const response = await fetch(this.euPageUrl(handle), {
          headers: { accept: 'text/html' },
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        if (!response.ok) {
          return false
        }
        return true
      }
      const payload = (await fetchJson(this.jobsUrl(handle), PROBE_TIMEOUT_MS)) as {
        jobs?: unknown[]
      }
      return Array.isArray(payload.jobs)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    if (this.isEuHandle(source.externalId)) {
      const response = await fetch(this.euPageUrl(source.externalId), {
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(`GET ${this.euPageUrl(source.externalId)} responded ${response.status}`)
      }
      return greenhouseEuJobsFromHtml(await response.text(), source)
    }
    const payload = (await fetchJson(this.jobsUrl(source.externalId))) as { jobs?: GreenhouseJob[] }
    if (!Array.isArray(payload.jobs)) {
      throw new Error(`Greenhouse board "${source.externalId}" returned no jobs array`)
    }
    return payload.jobs
      .map((job) => this.normalize(job, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: GreenhouseJob, source: JobBoardSourceRef): NormalizedJob | null {
    return normalizeJob(job, source)
  }
}
