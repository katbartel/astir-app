import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const GRAPHQL_URL = 'https://jobs.gem.com/api/public/graphql'

type GemLocation = {
  name?: string
  city?: string
  isoCountry?: string
  isRemote?: boolean
}

type GemJobPosting = {
  id?: string
  extId?: string
  title?: string
  locations?: GemLocation[]
  job?: {
    locationType?: string
    employmentType?: string
    department?: { name?: string }
  }
}

type GemBoardPayload = {
  data?: {
    oatsExternalJobPostings?: {
      jobPostings?: GemJobPosting[]
    }
  }
}

const BOARD_QUERY = `
  query JobBoardList($boardId: String!) {
    oatsExternalJobPostings(boardId: $boardId) {
      jobPostings {
        id
        extId
        title
        locations {
          name
          city
          isoCountry
          isRemote
        }
        job {
          locationType
          employmentType
          department {
            name
          }
        }
      }
    }
  }
`

function workModeFrom(job: GemJobPosting): WorkMode | null {
  const haystack = `${job.job?.locationType ?? ''} ${job.locations?.map((l) => l.name).join(' ') ?? ''}`.toLowerCase()
  if (job.locations?.some((location) => location.isRemote) || haystack.includes('remote')) {
    return 'Remote'
  }
  if (haystack.includes('hybrid')) {
    return 'Hybrid'
  }
  if (/on-?site|in-?office/.test(haystack)) {
    return 'On-Site'
  }
  return null
}

function locationName(location: GemLocation): string | null {
  return location.name?.trim() || location.city?.trim() || location.isoCountry?.trim() || null
}

@Injectable()
export class GemProvider implements AtsProvider {
  readonly provider = 'gem'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    const match = url.match(/jobs\.gem\.com\/([a-z0-9-]+)(?:\/|$)/i)
    return match ? match[1].toLowerCase() : null
  }

  candidateHandles(): string[] {
    return []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      await this.fetchJobs(handle)
      return true
    } catch {
      return false
    }
  }

  private async fetchJobs(handle: string): Promise<GemJobPosting[]> {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        operationName: 'JobBoardList',
        variables: { boardId: handle },
        query: BOARD_QUERY,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`POST ${GRAPHQL_URL} responded ${response.status}`)
    }
    const payload = (await response.json()) as GemBoardPayload
    return payload.data?.oatsExternalJobPostings?.jobPostings ?? []
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    return (await this.fetchJobs(source.externalId))
      .map((job) => this.normalize(job, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: GemJobPosting, source: JobBoardSourceRef): NormalizedJob | null {
    const externalId = job.extId || job.id
    if (!externalId || !job.title) {
      return null
    }
    const locations = [
      ...new Set((job.locations ?? []).map(locationName).filter((name): name is string => !!name)),
    ]
    return {
      provider: this.provider,
      externalId,
      title: job.title.trim(),
      companyName: source.companyName,
      location: locations[0] ?? null,
      locations,
      workMode: workModeFrom(job),
      url: `https://jobs.gem.com/${encodeURIComponent(source.externalId)}/${encodeURIComponent(externalId)}`,
      postedAt: null,
    }
  }
}
