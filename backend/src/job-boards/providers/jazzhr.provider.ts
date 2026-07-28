import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef, companyHandleCandidates } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const PROBE_TIMEOUT_MS = 6_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'

function boardUrl(handle: string): string {
  return `https://${encodeURIComponent(handle)}.applytojob.com/apply`
}

function cleanHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function workModeFromText(value: string): WorkMode | null {
  const normalized = value.toLowerCase()
  if (normalized.includes('remote')) {
    return 'Remote'
  }
  if (normalized.includes('hybrid')) {
    return 'Hybrid'
  }
  if (/on-?site|office/.test(normalized)) {
    return 'On-Site'
  }
  return null
}

export function jazzHrJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const jobs = [
    ...html.matchAll(
      /<h3[^>]*class=['"]list-group-item-heading['"][\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<ul[^>]*class=['"]list-inline list-group-item-text['"][^>]*>([\s\S]*?)<\/ul>/gi,
    ),
  ]

  return jobs
    .map((match): NormalizedJob | null => {
      const url = match[1].trim()
      const title = cleanHtml(match[2])
      const locations = [
        ...new Set(
          [...match[3].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
            .map((location) => cleanHtml(location[1]))
            .filter(Boolean),
        ),
      ]
      if (!url || !title) {
        return null
      }
      return {
        provider: 'jazzhr',
        externalId: `jazzhr:${url.split('/').filter(Boolean).pop() ?? title}`,
        title,
        companyName: source.companyName,
        location: locations[0] ?? null,
        locations,
        workMode: workModeFromText(locations.join(' ')),
        url,
        postedAt: null,
        contentLanguage: 'en',
      }
    })
    .filter((job): job is NormalizedJob => job !== null)
}

@Injectable()
export class JazzHrProvider implements AtsProvider {
  readonly provider = 'jazzhr'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    const match = url.match(/https?:\/\/([a-z0-9-]+)\.applytojob\.com(?:\/apply)?/i)
    return match ? match[1].toLowerCase() : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      return (await this.fetchPage(boardUrl(handle), { externalId: handle, companyName: 'Company' }, PROBE_TIMEOUT_MS)).length > 0
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    return this.fetchPage(boardUrl(source.externalId), source, FETCH_TIMEOUT_MS)
  }

  private async fetchPage(url: string, source: JobBoardSourceRef, timeoutMs: number): Promise<NormalizedJob[]> {
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`GET ${url} responded ${response.status}`)
    }
    return jazzHrJobsFromHtml(await response.text(), source)
  }
}
