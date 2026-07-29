import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000

// Every Breezy HR careers site serves its published positions as a bare JSON
// array at https://{handle}.breezy.hr/json — no key, no login. Each position
// carries its own public `url`, a nested `location`, and, when the company
// fills it in, `remote_details.value` ("remote" | "hybrid" | "none").
type BreezyLocation = {
  name?: string
  is_remote?: boolean
  remote_details?: { value?: string }
}

type BreezyPosition = {
  id?: string
  name?: string
  url?: string
  published_date?: string
  location?: BreezyLocation
  locations?: BreezyLocation[]
}

function workModeFrom(location: BreezyLocation | undefined): WorkMode | null {
  switch (location?.remote_details?.value?.toLowerCase()) {
    case 'remote':
      return 'Remote'
    case 'hybrid':
      return 'Hybrid'
    case 'none':
    case 'onsite':
    case 'on_site':
      return 'On-Site'
    default:
      return location?.is_remote ? 'Remote' : null
  }
}

@Injectable()
export class BreezyProvider implements AtsProvider {
  readonly provider = 'breezy'
  readonly kind = 'ats' as const

  private positionsUrl(handle: string): string {
    return `https://${encodeURIComponent(handle)}.breezy.hr/json`
  }

  handleFromUrl(url: string): string | null {
    // Careers sites live at https://{account}.breezy.hr/ with per-job links at
    // /p/{id}. Only the account subdomain carries the handle; the platform's
    // own hosts never do.
    const match = url.match(/([a-z0-9-]+)\.breezy\.hr/i)
    if (!match) {
      return null
    }
    const handle = match[1].toLowerCase()
    return ['www', 'app', 'api'].includes(handle) ? null : handle
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(this.positionsUrl(handle), PROBE_TIMEOUT_MS)) as unknown[]
      return Array.isArray(payload)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const payload = (await fetchJson(this.positionsUrl(source.externalId))) as BreezyPosition[]
    if (!Array.isArray(payload)) {
      throw new Error(`Breezy site "${source.externalId}" returned no positions array`)
    }
    return payload
      .map((position) => this.normalize(position, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(position: BreezyPosition, source: JobBoardSourceRef): NormalizedJob | null {
    if (!position.id || !position.name || !position.url) {
      return null
    }
    const primary = position.location?.name?.trim() || null
    const locations = [
      ...new Set(
        [position.location, ...(position.locations ?? [])]
          .map((location) => location?.name?.trim())
          .filter((value): value is string => !!value),
      ),
    ]
    return {
      provider: this.provider,
      externalId: String(position.id),
      title: position.name.trim(),
      companyName: source.companyName,
      location: primary,
      locations,
      workMode: workModeFrom(position.location),
      url: position.url,
      postedAt: parseDate(position.published_date),
    }
  }
}
