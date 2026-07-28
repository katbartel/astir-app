import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef } from './job-board-provider'

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoardBot/1.0)'
const ITCLINICAL_PORTAL_URL =
  'https://itclinical.zohorecruit.eu/recruit/Portal.na?digest=BZl2tfNA04WFojs2U63iGnvcvvlqhJ2Ix5WvdZf2qD4-'

type ZohoRecruitJob = {
  id?: string
  Job_Opening_Name?: string
  Posting_Title?: string
  City?: string
  Country?: string
  Remote_Job?: boolean
}

type ZohoRecruitTableJob = ZohoRecruitJob & {
  id: string
  Posting_Title: string
  detailUrl?: string
  description?: string
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))]
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function absoluteUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString()
  } catch {
    return base
  }
}

function textFromHtml(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function defaultCountryForBoard(baseUrl: string): string | null {
  try {
    const parsed = new URL(baseUrl)
    return /(^|\.)itclinical\.zohorecruit\.eu$/i.test(parsed.hostname) ? 'Portugal' : null
  } catch {
    return null
  }
}

function findJobsInputValue(html: string): string | null {
  const input = [...html.matchAll(/<input\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\bid=(["'])jobs\1/i.test(tag))
  return input?.match(/\bvalue=(["'])([\s\S]*?)\1/i)?.[2] ?? null
}

function jobDetailsById(html: string, baseUrl: string): Map<string, { url: string; description: string }> {
  const details = new Map<string, { url: string; description: string }>()
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
  for (const row of rows) {
    const body = row[0]
    const href = body.match(/\bhref=(["'])([^"']*PortalDetail\.na[^"']*)\1/i)?.[2]
    const jobId = href?.match(/[?&]jobid=([^&]+)/i)?.[1]
    if (!href || !jobId) {
      continue
    }
    details.set(decodeURIComponent(jobId), {
      url: absoluteUrl(decodeHtmlEntities(href), baseUrl),
      description: textFromHtml(body),
    })
  }
  return details
}

function tableJobsFromHtml(html: string, baseUrl: string): ZohoRecruitTableJob[] {
  const rows = [...html.matchAll(/<tr\b[^>]+id=(["'])zr-joblist-detail_([^"']+)\1[^>]*>[\s\S]*?<\/tr>/gi)]
  return rows
    .map((row): ZohoRecruitTableJob | null => {
      const body = row[0]
      const id = decodeHtmlEntities(row[2])
      const href = body.match(/\bhref=(["'])([^"']*PortalDetail\.na[^"']*)\1/i)?.[2]
      const title = textFromHtml(body.match(/<a\b[^>]*class=(["'])jobdetail\1[^>]*>([\s\S]*?)<\/a>/i)?.[2] ?? '')
      const cells = [...body.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
      const city = textFromHtml(cells[1]?.[2] ?? '')
      const country = defaultCountryForBoard(baseUrl) ?? ''
      const description = decodeHtmlEntities(cells[2]?.[1].match(/\btitle=(["'])([\s\S]*?)\1/i)?.[2] ?? textFromHtml(cells[2]?.[2] ?? ''))
      if (!id || !title) {
        return null
      }
      return {
        id,
        Posting_Title: title,
        City: city,
        Country: country,
        Remote_Job: /\bremote\b/i.test(`${description} ${body}`),
        detailUrl: href ? absoluteUrl(decodeHtmlEntities(href), baseUrl) : undefined,
        description,
      }
    })
    .filter((job): job is ZohoRecruitTableJob => job !== null)
}

function fallbackDetailUrl(jobId: string, sourceUrl: string): string {
  const parsed = new URL(sourceUrl)
  const digest = parsed.searchParams.get('digest')
  const url = new URL('/recruit/PortalDetail.na', sourceUrl)
  url.searchParams.set('iframe', 'true')
  if (digest) {
    url.searchParams.set('digest', digest)
  }
  url.searchParams.set('jobid', jobId)
  url.searchParams.set('embedsource', 'CareerSite')
  return url.toString()
}

function workModeFrom(job: ZohoRecruitJob, description: string): WorkMode | null {
  const haystack = `${description} ${job.City ?? ''} ${job.Country ?? ''}`.toLowerCase()
  if (job.Remote_Job || haystack.includes('remote') || haystack.includes('work from home') || haystack.includes('your home')) {
    return 'Remote'
  }
  if (haystack.includes('hybrid')) {
    return 'Hybrid'
  }
  if (/on-?site|office/.test(haystack)) {
    return 'On-Site'
  }
  return null
}

export function zohoRecruitJobsFromHtml(html: string): ZohoRecruitJob[] {
  const value = findJobsInputValue(html)
  if (!value) {
    return tableJobsFromHtml(html, 'https://itclinical.zohorecruit.eu')
  }
  try {
    const parsed = JSON.parse(decodeHtmlEntities(value)) as unknown
    return Array.isArray(parsed) ? (parsed as ZohoRecruitJob[]) : []
  } catch {
    return []
  }
}

@Injectable()
export class ZohoRecruitProvider implements AtsProvider {
  readonly provider = 'zohorecruit'
  readonly kind = 'ats' as const

  handleFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url)
      if (/(^|\.)itclinical\.com$/i.test(parsed.hostname) && parsed.pathname.replace(/\/$/, '') === '/careers.php') {
        return ITCLINICAL_PORTAL_URL
      }
      if (/(^|\.)zohorecruit\.eu$/i.test(parsed.hostname) && /^\/(?:recruit\/Portal\.na|jobs\/Careers)$/i.test(parsed.pathname)) {
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
      return (await this.fetchJobs(handle)).jobs.length > 0
    } catch {
      return false
    }
  }

  private async fetchJobs(handle: string): Promise<{ html: string; jobs: ZohoRecruitJob[] }> {
    const response = await fetch(handle, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error(`GET ${handle} responded ${response.status}`)
    }
    const html = await response.text()
    return { html, jobs: zohoRecruitJobsFromHtml(html) }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const { html, jobs } = await this.fetchJobs(source.externalId)
    const details = jobDetailsById(html, source.externalId)
    for (const job of tableJobsFromHtml(html, source.externalId)) {
      if (job.detailUrl || job.description) {
        details.set(job.id ?? '', {
          url: job.detailUrl ?? fallbackDetailUrl(job.id ?? '', source.externalId),
          description: job.description ?? '',
        })
      }
    }
    return jobs
      .map((job) => this.normalize(job, source, details))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(
    job: ZohoRecruitJob,
    source: JobBoardSourceRef,
    details: Map<string, { url: string; description: string }> = new Map(),
  ): NormalizedJob | null {
    const id = clean(job.id)
    const title = clean(job.Posting_Title) ?? clean(job.Job_Opening_Name)
    if (!id || !title) {
      return null
    }
    const location = unique([clean(job.City), clean(job.Country)]).join(', ') || (job.Remote_Job ? 'Remote' : null)
    const detail = details.get(id)
    const workMode = workModeFrom(job, detail?.description ?? '')
    return {
      provider: this.provider,
      externalId: id,
      title,
      companyName: source.companyName,
      location,
      locations: unique([location, workMode === 'Remote' ? 'Remote' : null]),
      workMode,
      url: detail?.url ?? fallbackDetailUrl(id, source.externalId),
      postedAt: null,
      contentLanguage: 'en',
    }
  }
}
