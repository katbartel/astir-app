import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'

type ComeetLocation = {
  name?: string
  country?: string
  city?: string
  state?: string | null
  is_remote?: boolean
}

type ComeetJob = {
  uid?: string
  name?: string
  department?: string
  location?: ComeetLocation
  url_comeet_hosted_page?: string
  url_active_page?: string | null
  time_updated?: string
  company_name?: string
  workplace_type?: string
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))]
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractJsonArray(html: string, variableName: string): unknown[] {
  const start = html.indexOf(`${variableName} = [`)
  if (start === -1) {
    return []
  }
  const arrayStart = html.indexOf('[', start)
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = arrayStart; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      escaped = char === '\\' ? !escaped : false
      if (char === '"' && !escaped) {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '[') {
      depth += 1
    }
    if (char === ']') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(decodeHtmlEntities(html.slice(arrayStart, index + 1))) as unknown[]
        } catch {
          return []
        }
      }
    }
  }
  return []
}

export function comeetJobsFromHtml(html: string): ComeetJob[] {
  return extractJsonArray(html, 'COMPANY_POSITIONS_DATA') as ComeetJob[]
}

function locationName(location: ComeetLocation | undefined): string | null {
  if (!location) {
    return null
  }
  return unique([clean(location.name), clean(location.city), clean(location.state), clean(location.country)]).join(', ') || null
}

function workModeFrom(job: ComeetJob): WorkMode | null {
  const workplace = clean(job.workplace_type)?.toLowerCase()
  if (workplace === 'remote' || job.location?.is_remote) {
    return 'Remote'
  }
  if (workplace === 'hybrid') {
    return 'Hybrid'
  }
  if (workplace === 'onsite' || workplace === 'on-site') {
    return 'On-Site'
  }
  return null
}

@Injectable()
export class ComeetProvider implements AtsProvider {
  readonly provider = 'comeet'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    const match = url.match(/comeet\.com\/jobs\/([a-z0-9-]+)\/([A-Z0-9.]+)/i)
    return match ? `${match[1].toLowerCase()}/${match[2]}` : null
  }

  candidateHandles(): string[] {
    return []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    if (!handle.includes('/')) {
      return false
    }
    try {
      return (await this.fetchJobs(handle)).length > 0
    } catch {
      return false
    }
  }

  private pageUrl(handle: string): string {
    const [slug, companyUid] = handle.split('/')
    return `https://www.comeet.com/jobs/${encodeURIComponent(slug)}/${encodeURIComponent(companyUid)}`
  }

  private async fetchJobs(handle: string): Promise<ComeetJob[]> {
    const response = await fetch(this.pageUrl(handle), {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${this.pageUrl(handle)} responded ${response.status}`)
    }
    return comeetJobsFromHtml(await response.text())
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    return (await this.fetchJobs(source.externalId))
      .map((job) => this.normalize(job, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(job: ComeetJob, source: JobBoardSourceRef): NormalizedJob | null {
    const url = clean(job.url_active_page) ?? clean(job.url_comeet_hosted_page)
    if (!job.uid || !job.name || !url) {
      return null
    }
    const location = locationName(job.location)
    const locations = unique([location])
    return {
      provider: this.provider,
      externalId: job.uid,
      title: job.name.trim(),
      companyName: clean(job.company_name) ?? source.companyName,
      location,
      locations,
      workMode: workModeFrom(job),
      url,
      postedAt: parseDate(job.time_updated),
      contentLanguage: 'en',
    }
  }
}
