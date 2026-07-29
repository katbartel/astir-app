import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000

// Every Pinpoint careers site serves its published postings as JSON at
// https://{handle}.pinpointhq.com/postings.json — no key, no login. Postings
// come back under a `data` array; each carries its own public `url`, a nested
// `location` object, and a `workplace_type` ("remote" | "hybrid" | "on_site").
type PinpointLocation = {
  name?: string
  city?: string
  province?: string
  country?: string
}

type PinpointPosting = {
  id?: string | number
  title?: string
  url?: string
  location?: PinpointLocation
  workplace_type?: string
  created_at?: string
  published_at?: string
}

function joinLocation(location: PinpointLocation | undefined): string | null {
  if (!location) {
    return null
  }
  const named = location.name?.trim()
  if (named) {
    return named
  }
  const parts = [location.city, location.province, location.country]
    .map((part) => part?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function workModeFrom(workplaceType: string | undefined, location: string | null): WorkMode | null {
  switch (workplaceType?.toLowerCase()) {
    case 'remote':
      return 'Remote'
    case 'hybrid':
      return 'Hybrid'
    case 'on_site':
    case 'onsite':
    case 'office':
      return 'On-Site'
    default:
      return /\bremote\b/i.test(location ?? '') ? 'Remote' : null
  }
}

@Injectable()
export class PinpointProvider implements AtsProvider {
  readonly provider = 'pinpoint'
  readonly kind = 'ats' as const

  private postingsUrl(handle: string): string {
    return `https://${encodeURIComponent(handle)}.pinpointhq.com/postings.json`
  }

  handleFromUrl(url: string): string | null {
    // Careers sites live at https://{account}.pinpointhq.com/ with per-job links
    // at /postings/{uuid}. Only the account subdomain carries the handle; the
    // platform's own hosts (www, app, res) never do.
    const match = url.match(/([a-z0-9-]+)\.pinpointhq\.com/i)
    if (!match) {
      return null
    }
    const handle = match[1].toLowerCase()
    return ['www', 'app', 'res'].includes(handle) ? null : handle
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(this.postingsUrl(handle), PROBE_TIMEOUT_MS)) as {
        data?: unknown[]
      }
      return Array.isArray(payload.data)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const payload = (await fetchJson(this.postingsUrl(source.externalId))) as {
      data?: PinpointPosting[]
    }
    if (!Array.isArray(payload.data)) {
      throw new Error(`Pinpoint site "${source.externalId}" returned no data array`)
    }
    return payload.data
      .map((posting) => this.normalize(posting, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(posting: PinpointPosting, source: JobBoardSourceRef): NormalizedJob | null {
    if (posting.id === undefined || posting.id === null || !posting.title || !posting.url) {
      return null
    }
    const location = joinLocation(posting.location)
    return {
      provider: this.provider,
      externalId: String(posting.id),
      title: posting.title.trim(),
      // The feed is single-tenant and carries no company name.
      companyName: source.companyName,
      location,
      locations: location ? [location] : [],
      workMode: workModeFrom(posting.workplace_type, location),
      url: posting.url,
      postedAt: parseDate(posting.published_at) ?? parseDate(posting.created_at),
    }
  }
}
