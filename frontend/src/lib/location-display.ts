const GLUED_LOCATION_SPLIT = /,(?=[^,\s]+(?:\s*\/\s*|\s+-\s*)?(?:remote|hybrid|on-?site)\b)/i
const ANCHORED_REMOTE = /^(.+?)\s*(?:\/|-)\s*(remote\b.*)$/i

function cleanLocation(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function keyFor(value: string): string {
  return cleanLocation(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function addLocation(result: string[], seen: Set<string>, value: string) {
  const cleaned = cleanLocation(value)
  const key = keyFor(cleaned)
  if (!key || seen.has(key)) return
  seen.add(key)
  result.push(cleaned)
}

export function displayLocationParts(
  locations: Array<string | null | undefined>,
  fallback?: string | null,
): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const raw of [...locations, fallback]) {
    if (!raw) continue
    const parts = cleanLocation(raw)
      .split(';')
      .flatMap((part) => part.split(GLUED_LOCATION_SPLIT))
      .map(cleanLocation)
      .filter(Boolean)
    for (const location of parts) {
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

export function compactLocationLabel(parts: string[]) {
  if (parts.length === 0) return { display: '—', tooltip: undefined }
  if (parts.length === 1) return { display: parts[0], tooltip: parts[0] }
  return { display: `${parts[0]} +${parts.length - 1}`, tooltip: parts.join(', ') }
}
