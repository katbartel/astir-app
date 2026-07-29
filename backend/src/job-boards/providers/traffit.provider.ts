import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import { AtsProvider, JobBoardSourceRef, companyHandleCandidates } from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000
const FETCH_TIMEOUT_MS = 15_000
// Traffit paginates; ask for a generous page so a company's whole board fits in
// one call (its feeds are small — tens of roles at most).
const PAGE_SIZE = 100

// Every Traffit career site exposes its published adverts at
// https://{handle}.traffit.com/public/job_posts/published — no key, no login.
// The response is a plain array of job posts. Each post wraps the human-facing
// advert (title, language, structured locations) in an `advert` object; the
// display location and department sit in a flat `options` map, and the public
// per-job link is the top-level `url`.
type TraffitOptions = {
  _location?: string
  [key: string]: unknown
}

type TraffitLocation =
  | string
  | { name?: string; city?: string; region?: string; country?: string }

type TraffitAdvert = {
  id?: number | string
  name?: string
  language?: string
  locations?: TraffitLocation[]
}

type TraffitJobPost = {
  id?: number | string
  url?: string
  application_form?: string
  valid_start?: string
  advert?: TraffitAdvert
  options?: TraffitOptions
}

function stringifyLocation(location: TraffitLocation): string | null {
  if (typeof location === 'string') {
    return location.trim() || null
  }
  const named = location.name?.trim()
  if (named) {
    return named
  }
  const parts = [location.city, location.region, location.country]
    .map((part) => part?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

// Locations come from the advert's structured `locations` array when present,
// otherwise the flat `options._location` summary (a single string like "Poland"
// or "Remote"). Deduped, order preserved.
function locationsFromTraffit(post: TraffitJobPost): string[] {
  const collected = (post.advert?.locations ?? [])
    .map(stringifyLocation)
    .filter((place): place is string => !!place)
  const summary = post.options?._location?.trim()
  if (summary && !collected.some((place) => place.toLowerCase() === summary.toLowerCase())) {
    collected.push(summary)
  }
  return [...new Set(collected)]
}

// Traffit has no explicit work-mode field, so the only reliable signal is the
// word "remote" appearing in a location string; anything else stays unset
// (matching how the aggregator providers treat unknown modes).
function workModeFromTraffit(locations: string[]): WorkMode | null {
  return locations.some((place) => /\bremote\b/i.test(place)) ? 'Remote' : null
}

function languageFrom(post: TraffitJobPost): string | null {
  const code = post.advert?.language?.trim().toLowerCase()
  return code && /^[a-z]{2,3}$/.test(code) ? code : null
}

@Injectable()
export class TraffitProvider implements AtsProvider {
  readonly provider = 'traffit'
  readonly kind = 'ats' as const

  private feedUrl(handle: string): string {
    return `https://${encodeURIComponent(handle)}.traffit.com/public/job_posts/published`
  }

  handleFromUrl(url: string): string | null {
    // Career sites, per-job "/public/an/..." links and apply forms all live at
    // https://{account}.traffit.com/. Only the account subdomain carries the
    // handle; the platform's own hosts (www, cdn, api) never do.
    const match = url.match(/([a-z0-9-]+)\.traffit\.com/i)
    if (!match) {
      return null
    }
    const handle = match[1].toLowerCase()
    return ['www', 'cdn', 'api'].includes(handle) ? null : handle
  }

  candidateHandles(companyName: string): string[] {
    // Best-effort only: Traffit accounts are often abbreviations (Infermedica ->
    // "infer"), so probing usually misses and the admin supplies a careers URL.
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const posts = await this.fetchPublished(handle, PROBE_TIMEOUT_MS)
      return Array.isArray(posts)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const posts = await this.fetchPublished(source.externalId, FETCH_TIMEOUT_MS)
    return posts
      .map((post) => this.normalize(post, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  private async fetchPublished(handle: string, timeoutMs: number): Promise<TraffitJobPost[]> {
    const response = await fetch(this.feedUrl(handle), {
      headers: { accept: 'application/json', 'X-Request-Page-Size': String(PAGE_SIZE) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`GET ${this.feedUrl(handle)} responded ${response.status}`)
    }
    const payload = (await response.json()) as unknown
    // The endpoint returns a bare array; tolerate a { data: [...] } wrapper too.
    if (Array.isArray(payload)) {
      return payload as TraffitJobPost[]
    }
    const wrapped = (payload as { data?: unknown }).data
    if (Array.isArray(wrapped)) {
      return wrapped as TraffitJobPost[]
    }
    throw new Error(`Traffit account "${handle}" returned no job-post array`)
  }

  normalize(post: TraffitJobPost, source: JobBoardSourceRef): NormalizedJob | null {
    const title = post.advert?.name?.trim()
    const url = post.url?.trim() || post.application_form?.trim()
    if (post.id === undefined || post.id === null || !title || !url) {
      return null
    }
    const locations = locationsFromTraffit(post)
    return {
      provider: this.provider,
      externalId: String(post.id),
      title,
      // The public feed carries no company name — it is inherently single-tenant.
      companyName: source.companyName,
      location: locations[0] ?? null,
      locations,
      workMode: workModeFromTraffit(locations),
      url,
      postedAt: parseDate(post.valid_start),
      contentLanguage: languageFrom(post),
    }
  }
}
