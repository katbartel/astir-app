import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000

// Subset of https://api.lever.co/v0/postings/{handle}?mode=json we rely on.
// The endpoint returns a top-level array of postings (not an object wrapper).
type LeverJob = {
  id?: string
  text?: string
  hostedUrl?: string
  categories?: {
    location?: string
    allLocations?: string[]
  }
  // "remote" | "hybrid" | "on-site" | "unspecified"
  workplaceType?: string
  // Epoch milliseconds.
  createdAt?: number
}

function workModeFromLever(job: LeverJob): WorkMode | null {
  switch (job.workplaceType) {
    case 'remote':
      return 'Remote'
    case 'hybrid':
      return 'Hybrid'
    case 'on-site':
      return 'On-Site'
    default:
      return null
  }
}

function locationsFromLever(job: LeverJob): string[] {
  const places = [job.categories?.location, ...(job.categories?.allLocations ?? [])]
  return [...new Set(places.map((place) => place?.trim()).filter((place): place is string => !!place))]
}

@Injectable()
export class LeverProvider implements AtsProvider {
  readonly provider = 'lever'
  readonly kind = 'ats' as const

  private postingsUrl(handle: string): string {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(handle)}?mode=json`
  }

  handleFromUrl(url: string): string | null {
    // Careers pages look like https://jobs.lever.co/{account}/ and per-job
    // links https://jobs.lever.co/{account}/{id}. The account is always the
    // first path segment.
    const match = url.match(/jobs\.lever\.co\/([a-z0-9.-]+)/i)
    return match ? match[1] : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(this.postingsUrl(handle), PROBE_TIMEOUT_MS)) as unknown[]
      return Array.isArray(payload) && payload.length > 0
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const payload = (await fetchJson(this.postingsUrl(source.externalId))) as LeverJob[]
    if (!Array.isArray(payload)) {
      throw new Error(`Lever account "${source.externalId}" returned no postings array`)
    }
    return payload
      .map((job) => this.normalize(job, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: LeverJob, source: JobBoardSourceRef): NormalizedJob | null {
    if (!job.id || !job.text || !job.hostedUrl) {
      return null
    }
    return {
      provider: this.provider,
      externalId: job.id,
      title: job.text.trim(),
      companyName: source.companyName,
      location: job.categories?.location?.trim() || null,
      locations: locationsFromLever(job),
      workMode: workModeFromLever(job),
      url: job.hostedUrl,
      postedAt: typeof job.createdAt === 'number' ? new Date(job.createdAt) : null,
    }
  }
}
