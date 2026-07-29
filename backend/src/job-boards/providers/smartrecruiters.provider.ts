import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000
const PAGE_SIZE = 100
// A board can hold thousands of roles; the API caps a page at 100. Bound the
// paging so one enormous board can't stall a sync run.
const MAX_PAGES = 20

// Subset of https://api.smartrecruiters.com/v1/companies/{handle}/postings.
type SmartRecruitersPosting = {
  id?: string
  name?: string
  company?: { identifier?: string; name?: string }
  location?: {
    city?: string
    region?: string
    country?: string
    fullLocation?: string
    remote?: boolean
    hybrid?: boolean
  }
  releasedDate?: string
}

type SmartRecruitersPage = {
  content?: SmartRecruitersPosting[]
  totalFound?: number
}

function locationFromSmartRecruiters(location: SmartRecruitersPosting['location']): string | null {
  if (!location) {
    return null
  }
  if (location.fullLocation?.trim()) {
    return location.fullLocation.trim()
  }
  const parts = [location.city, location.region, location.country]
    .map((part) => part?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function workModeFromSmartRecruiters(location: SmartRecruitersPosting['location']): WorkMode | null {
  if (location?.remote) {
    return 'Remote'
  }
  if (location?.hybrid) {
    return 'Hybrid'
  }
  return null
}

@Injectable()
export class SmartRecruitersProvider implements AtsProvider {
  readonly provider = 'smartrecruiters'
  readonly kind = 'ats' as const

  private postingsUrl(handle: string, offset: number, limit = PAGE_SIZE): string {
    return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(handle)}/postings?limit=${limit}&offset=${offset}`
  }

  handleFromUrl(url: string): string | null {
    // Public boards live at https://jobs.smartrecruiters.com/{identifier} and
    // https://careers.smartrecruiters.com/{identifier}. The company identifier
    // is the first path segment. The API is case-insensitive on it, so we can
    // normalize like the other providers.
    const match = url.match(/(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9-]+)/i)
    return match ? match[1].toLowerCase() : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(
        this.postingsUrl(handle, 0, 1),
        PROBE_TIMEOUT_MS,
      )) as SmartRecruitersPage
      return Array.isArray(payload.content)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = (await fetchJson(
        this.postingsUrl(source.externalId, page * PAGE_SIZE),
      )) as SmartRecruitersPage
      if (!Array.isArray(payload.content)) {
        throw new Error(`SmartRecruiters company "${source.externalId}" returned no content array`)
      }
      for (const posting of payload.content) {
        const job = this.normalize(posting, source)
        if (job) {
          jobs.push(job)
        }
      }
      const fetched = (page + 1) * PAGE_SIZE
      if (payload.content.length < PAGE_SIZE || fetched >= (payload.totalFound ?? 0)) {
        break
      }
    }
    return jobs
  }

  normalize(posting: SmartRecruitersPosting, source: JobBoardSourceRef): NormalizedJob | null {
    if (!posting.id || !posting.name) {
      return null
    }
    // Postings carry no public URL; it is deterministically built from the
    // properly-cased company identifier and posting id.
    const identifier = posting.company?.identifier || source.externalId
    const location = locationFromSmartRecruiters(posting.location)
    return {
      provider: this.provider,
      externalId: posting.id,
      title: posting.name.trim(),
      companyName: posting.company?.name?.trim() || source.companyName,
      location,
      locations: location ? [location] : [],
      workMode: workModeFromSmartRecruiters(posting.location),
      url: `https://jobs.smartrecruiters.com/${identifier}/${posting.id}`,
      postedAt: parseDate(posting.releasedDate),
    }
  }
}
