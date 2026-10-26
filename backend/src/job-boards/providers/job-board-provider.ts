import { NormalizedJob } from '../normalized-job'

// Two kinds of source, deliberately distinguished so ingestion treats them
// differently:
//   - 'ats'        Applicant Tracking System board (Greenhouse, Ashby,
//                  Workable). ONE company per board. Cannot be queried without
//                  a company handle, so these are only ever polled for
//                  companies a user has put on their watchlist.
//   - 'aggregator' A classical multi-company job board queried without a
//                  handle (keyword/location search). Polled unconditionally
//                  because a single feed spans many companies. No concrete
//                  aggregator ships yet; the type exists so ingestion and the
//                  data model already accommodate one. See docs/job-boards.md.
export type ProviderKind = 'ats' | 'aggregator'

// What a provider needs to know about a board, decoupled from the DB row.
export type JobBoardSourceRef = {
  // Provider-specific handle: Greenhouse board token, Ashby job-board name,
  // Workable account subdomain. For aggregators this is a fixed feed key.
  externalId: string
  companyName: string
}

export interface JobBoardProvider {
  readonly provider: string
  readonly kind: ProviderKind
  fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]>
}

// ATS providers additionally know how to turn a company (name or careers URL)
// into a board handle. This is what "company-scoped" means in practice: you
// must supply a company to get anything back.
export interface AtsProvider extends JobBoardProvider {
  readonly kind: 'ats'
  // If the URL is one of this ATS's own hosts, extract the handle from it.
  // Deterministic and preferred over guessing from the name.
  handleFromUrl(url: string): string | null
  // Slug candidates to probe for a plain company name, best guess first.
  candidateHandles(companyName: string): string[]
  // True when the handle resolves to a real, non-empty board on this ATS.
  verifyHandle(handle: string): Promise<boolean>
  // Some ATS offer custom careers domains that cannot be identified from the
  // URL alone. A provider may inspect the public page and return a verified
  // handle before the schema.org fallback is tried.
  detectHandleFromCareersPage?(url: string): Promise<string | null>
}

export function isAtsProvider(provider: JobBoardProvider): provider is AtsProvider {
  return provider.kind === 'ats'
}

// Aggregator providers are not company-scoped: one feed spans many companies,
// queried without a handle. They own a single, always-polled `job_sources`
// row described by `feed` — ingestion upserts it on startup so the feed exists
// without anyone adding a watchlist company. `feed.externalId` is the fixed
// feed key (the provider's pull scope); `feed.companyName` is a human label,
// since per-job company names come from the payload.
export interface AggregatorProvider extends JobBoardProvider {
  readonly kind: 'aggregator'
  readonly feed: JobBoardSourceRef
  // Optional gate for feeds that need credentials/config (e.g. Adzuna needs an
  // API key). Omitted means always on. When it returns false, ingestion never
  // seeds the feed's source, so a keyless environment is a silent no-op.
  isEnabled?(): boolean
}

export function isAggregatorProvider(provider: JobBoardProvider): provider is AggregatorProvider {
  return provider.kind === 'aggregator'
}

// The generic schema.org-JSON-LD reader. It has no host of its own and cannot
// be name-probed, so resolution treats it as an explicit last resort: only
// once every real ATS comes up empty is a careers URL handed to it directly.
export const GENERIC_JOBPOSTING_PROVIDER = 'jobposting'

export const JOB_BOARD_PROVIDERS = Symbol('JOB_BOARD_PROVIDERS')

const FETCH_TIMEOUT_MS = 15_000

export async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`GET ${url} responded ${response.status}`)
  }
  return response.json()
}

// Candidate board slugs for a company name, most-likely first. ATS handles are
// almost always the collapsed lowercase name ("HelloFresh" -> "hellofresh",
// "N26" -> "n26"); hyphenated and first-word forms cover the rest.
export function companyHandleCandidates(companyName: string): string[] {
  const cleaned = companyName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Drop common legal/entity suffixes that never appear in handles.
    .replace(/\b(inc|llc|ltd|gmbh|ag|sa|bv|oy|ab|labs?|technologies|group)\b/g, ' ')
    .trim()
  const words = cleaned.split(/[^a-z0-9]+/).filter(Boolean)
  if (!words.length) {
    return []
  }
  return [...new Set([words.join(''), words.join('-'), words[0]])]
}
