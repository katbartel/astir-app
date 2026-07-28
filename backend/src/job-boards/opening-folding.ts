import { companyKey, normalizeForIdentity } from './normalized-job'
import { normalizeLocationStrings } from './location-normalization'
import { matchesHiringRegions } from './region-matching'

// The same role posted across several cities/regions is one opening. This
// module folds those duplicate postings into a single row — the primary
// location is the one best matching the user's selected regions, with the rest
// unioned onto `locations` (the client shows them as "Berlin +2"). Shared by
// the Watchlist and the Remote Job Board so both bundle identically.

// Generic Europe/EU phrasings: a location matching these only counts as a weak
// signal, so a posting that matches a specific selected country (Germany) wins
// over one that only sits "in Europe" (France, when France wasn't selected).
const GENERIC_REGION_KEYS = new Set(['eu', 'europe', 'emea', 'european union'])

export type FoldableOpening = {
  id: string
  title: string
  companyName: string
  url: string
  location: string | null
  locations: string[]
  workMode: string | null
  contentLanguage: string | null
  postedAt: Date | null
  firstSeenAt: Date
  matchedKeywords: string[]
  // Providers the posting was seen through (for attribution); optional because
  // the Watchlist does not carry it. Unioned across a folded group.
  providers?: string[]
}

// Individual location strings for a posting. Providers give extras either as
// separate array entries or as one ";"-joined string; flatten both so each
// counts once when folding and toward the "+N" tally.
export function locationStrings(opening: Pick<FoldableOpening, 'locations' | 'location'>): string[] {
  return normalizeLocationStrings([
    ...(opening.locations.length > 0 ? opening.locations : []),
    opening.location,
  ])
}

// 2 for a specific selected region (e.g. Germany, Poland, Spain), 1 for a
// generic Europe/EU match, 0 for none. Highest across the posting's locations
// wins.
export function regionScore(locations: string[], hiringRegions: string[]): number {
  if (!hiringRegions.length) return 0
  let best = 0
  for (const region of hiringRegions) {
    if (matchesHiringRegions(locations, [region])) {
      const generic = GENERIC_REGION_KEYS.has(normalizeForIdentity(region))
      best = Math.max(best, generic ? 1 : 2)
    }
  }
  return best
}

// Group openings by company + role title, drop any opening the user has already
// applied to (any posting in the group counts), and collapse each remaining
// group into one row linked to the best-matching location. Newest opening
// first.
export function foldOpenings(
  openings: FoldableOpening[],
  hiringRegions: string[],
  appliedListingIds: Set<string> = new Set(),
): FoldableOpening[] {
  const groups = new Map<string, FoldableOpening[]>()
  for (const opening of openings) {
    const groupKey = `${companyKey(opening.companyName)}::${titleKey(opening) || opening.id}`
    const bucket = groups.get(groupKey)
    if (bucket) bucket.push(opening)
    else groups.set(groupKey, [opening])
  }

  const combined: FoldableOpening[] = []
  for (const group of groups.values()) {
    if (group.some((opening) => appliedListingIds.has(opening.id))) {
      continue
    }
    combined.push(combineGroup(group, hiringRegions))
  }
  combined.sort((a, b) => b.firstSeenAt.getTime() - a.firstSeenAt.getTime())
  return combined
}

function titleKey(opening: FoldableOpening): string {
  let title = ` ${normalizeForIdentity(opening.title)} `
  const locationWords = new Set(
    locationStrings(opening)
      .flatMap((location) => normalizeForIdentity(location).split(' '))
      .filter((word) => word.length > 2),
  )
  for (const word of locationWords) {
    title = title.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ')
  }
  return title.replace(/\b(remote|within|inside|in|from|based|office|offices)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

function combineGroup(group: FoldableOpening[], hiringRegions: string[]): FoldableOpening {
  // Pick the posting whose location best matches the user's selected regions;
  // break ties by the newest posting.
  const ranked = [...group].sort((a, b) => {
    const score =
      regionScore(locationStrings(b), hiringRegions) - regionScore(locationStrings(a), hiringRegions)
    return score !== 0 ? score : b.firstSeenAt.getTime() - a.firstSeenAt.getTime()
  })
  const best = ranked[0]

  // Distinct locations across the whole opening, best-matching first.
  const seen = new Set<string>()
  const locations: string[] = []
  for (const opening of ranked) {
    for (const location of locationStrings(opening)) {
      const normalized = location.toLowerCase()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        locations.push(location)
      }
    }
  }

  const newest = group.reduce(
    (latest, opening) => (opening.firstSeenAt > latest ? opening.firstSeenAt : latest),
    group[0].firstSeenAt,
  )
  return {
    id: best.id,
    title: best.title,
    companyName: best.companyName,
    url: best.url,
    location: locations[0] ?? best.location,
    locations,
    workMode: best.workMode,
    contentLanguage: best.contentLanguage,
    postedAt: best.postedAt,
    firstSeenAt: newest,
    matchedKeywords: [...new Set(group.flatMap((opening) => opening.matchedKeywords))],
    providers: [...new Set(group.flatMap((opening) => opening.providers ?? []))],
  }
}
