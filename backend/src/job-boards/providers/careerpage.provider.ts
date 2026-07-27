import { Injectable } from '@nestjs/common'
import { NormalizedJob } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#x27;|&quot;|&amp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cerbosJobsFromHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  const text = textFromHtml(html)
  const match = text.match(/Current Open Roles\s+(.+?\(Remote\))\s+At Cerbos,/i)
  if (!match) {
    return []
  }
  const title = match[1].trim()
  const url = source.externalId
  return [
    {
      provider: 'careerpage',
      externalId: `cerbos:${slugFromTitle(title)}`,
      title,
      companyName: source.companyName,
      location: 'Remote',
      locations: ['Remote'],
      workMode: 'Remote',
      url,
      postedAt: null,
      contentLanguage: 'en',
    },
  ]
}

export function jobsFromCareerPageHtml(html: string, source: JobBoardSourceRef): NormalizedJob[] {
  try {
    const parsed = new URL(source.externalId)
    if (/(^|\.)cerbos\.dev$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/join-us') {
      return cerbosJobsFromHtml(html, source)
    }
  } catch {
    return []
  }
  return []
}

@Injectable()
export class CareerPageProvider implements AtsProvider {
  readonly provider = 'careerpage'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url)
      if (/(^|\.)cerbos\.dev$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/join-us') {
        return parsed.toString()
      }
    } catch {
      return null
    }
    return null
  }

  candidateHandles(): string[] {
    return []
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      return (await this.fetchListings({ externalId: handle, companyName: 'Company' })).length > 0
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const response = await fetch(source.externalId, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${source.externalId} responded ${response.status}`)
    }
    return jobsFromCareerPageHtml(await response.text(), source)
  }
}
