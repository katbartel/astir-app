// Anti-corruption layer: every provider maps its raw payload into this shape
// before anything touches the database. Provider quirks stop here.

export type WorkMode = 'Remote' | 'Hybrid' | 'On-Site'

export type NormalizedJob = {
  provider: string
  externalId: string
  title: string
  companyName: string
  // Primary display location.
  location: string | null
  // Every location string the posting carries (offices, secondary locations,
  // country) — the hiring-region match looks at all of them.
  locations: string[]
  workMode: WorkMode | null
  descriptionText?: string | null
  descriptionHash?: string | null
  url: string
  postedAt: Date | null
  // ISO 639-1 code of the language the ad is *written in* (e.g. 'en', 'de'),
  // when the provider exposes it. This is the posting's content language, a
  // weak proxy for the language it expects — not a parsed requirement. Optional
  // because most providers don't carry it; omitted reads the same as null.
  contentLanguage?: string | null
}

// Collapses a string for identity comparison: lowercase, diacritics stripped,
// punctuation and repeated whitespace folded away.
export function normalizeForIdentity(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// The same opening posted through several providers collapses to one listing
// via this key. Location is part of the identity: companies routinely post
// the same title as separate per-region openings (e.g. Linear's "Product
// Manager" for North America and for Europe), and merging those hides real
// openings. The cost is that a cross-provider duplicate whose location is
// phrased differently ("Berlin" vs "Berlin, Germany") shows up twice.
export function jobFingerprint(
  job: Pick<NormalizedJob, 'companyName' | 'title' | 'location'>,
): string {
  return [
    normalizeForIdentity(job.companyName),
    normalizeForIdentity(job.title),
    normalizeForIdentity(job.location ?? ''),
  ].join('|')
}

// Stable key for "the same company", used to dedupe ATS resolution and to
// match listings back to a watchlist company.
export function companyKey(companyName: string): string {
  return normalizeForIdentity(companyName)
}

export function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
