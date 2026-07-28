import { normalizeForIdentity } from './normalized-job'

const GLUED_LOCATION_SPLIT = /,(?=[^,\s]+(?:\s*\/\s*|\s+-\s*)?(?:remote|hybrid|on-?site)\b)/i
const ANCHORED_REMOTE = /^(.+?)\s*(?:\/|-)\s*(remote\b.*)$/i

function cleanLocation(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function splitLocation(value: string): string[] {
  return cleanLocation(value)
    .split(';')
    .flatMap((part) => part.split(GLUED_LOCATION_SPLIT))
    .map(cleanLocation)
    .filter(Boolean)
}

function addLocation(result: string[], seen: Set<string>, value: string) {
  const cleaned = cleanLocation(value)
  const key = normalizeForIdentity(cleaned)
  if (!key || seen.has(key)) return
  seen.add(key)
  result.push(cleaned)
}

export function normalizeLocationStrings(locations: Array<string | null | undefined>): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const raw of locations) {
    if (!raw) continue
    for (const location of splitLocation(raw)) {
      const anchored = location.match(ANCHORED_REMOTE)
      if (anchored) {
        addLocation(result, seen, anchored[1])
        addLocation(result, seen, anchored[2])
      } else {
        addLocation(result, seen, location)
      }
    }
  }

  return result
}

export function normalizeListingLocations<T extends { location: string | null; locations: string[] }>(
  listing: T,
): T {
  const locations = normalizeLocationStrings([
    ...(listing.locations.length ? listing.locations : []),
    listing.location,
  ])
  return {
    ...listing,
    location: locations[0] ?? null,
    locations,
  }
}
