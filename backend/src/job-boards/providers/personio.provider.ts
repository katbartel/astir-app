import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000

// Personio serves a public JSON board at
// https://{handle}.jobs.personio.{com|de}/search.json — no key, no login.
// Tenants live on either TLD, so both hosts are tried. The payload is a bare
// array of positions and carries neither an apply URL nor a posting date: the
// URL is built from the resolved host + position id, and postedAt stays null.
type PersonioJob = {
  id?: number | string
  name?: string
  office?: string
  offices?: string[]
  published_at?: string
  publishedAt?: string
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
}

// The board hosts to try, most common first. Same tenant slug, different TLD.
function personioHosts(handle: string): string[] {
  const slug = encodeURIComponent(handle)
  return [`${slug}.jobs.personio.com`, `${slug}.jobs.personio.de`]
}

function locationsFromPersonio(job: PersonioJob): string[] {
  const offices = [job.office, ...(job.offices ?? [])]
  return [...new Set(offices.map((office) => office?.trim()).filter((office): office is string => !!office))]
}

function workModeFromPersonio(locations: string[]): WorkMode | null {
  return locations.some((location) => location.toLowerCase().includes('remote')) ? 'Remote' : null
}

@Injectable()
export class PersonioProvider implements AtsProvider {
  readonly provider = 'personio'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    // Career sites live at https://{company}.jobs.personio.{com|de}/. Only the
    // subdomain form is detectable; custom domains carry no handle.
    const match = url.match(/([a-z0-9-]+)\.jobs\.personio\.(?:com|de)/i)
    return match && match[1] !== 'www' ? match[1].toLowerCase() : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    return (await this.fetchBoard(handle, PROBE_TIMEOUT_MS)) !== null
  }

  // Returns the first host that answers with at least one position, along with
  // the host so job URLs point at the right TLD. Null when neither TLD has a
  // non-empty board.
  private async fetchBoard(
    handle: string,
    timeoutMs?: number,
  ): Promise<{ host: string; jobs: PersonioJob[] } | null> {
    for (const host of personioHosts(handle)) {
      try {
        const payload = (await fetchJson(`https://${host}/search.json?language=en`, timeoutMs)) as unknown
        if (Array.isArray(payload) && payload.length > 0) {
          return { host, jobs: payload as PersonioJob[] }
        }
      } catch {
        // Wrong TLD (404) or a transient error — try the next host.
      }
    }
    return null
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const board = await this.fetchBoard(source.externalId)
    if (!board) {
      return []
    }
    return board.jobs
      .map((job) => this.normalize(job, source, board.host))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: PersonioJob, source: JobBoardSourceRef, host: string): NormalizedJob | null {
    if (job.id === undefined || !job.name) {
      return null
    }
    const locations = locationsFromPersonio(job)
    return {
      provider: this.provider,
      externalId: String(job.id),
      title: job.name.trim(),
      companyName: source.companyName,
      location: job.office?.trim() || locations[0] || null,
      locations,
      workMode: workModeFromPersonio(locations),
      url: `https://${host}/job/${job.id}?language=en`,
      postedAt:
        parseDate(job.published_at) ??
        parseDate(job.publishedAt) ??
        parseDate(job.created_at) ??
        parseDate(job.createdAt) ??
        parseDate(job.updated_at) ??
        parseDate(job.updatedAt),
    }
  }
}
