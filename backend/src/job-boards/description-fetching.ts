import { createHash } from 'node:crypto'

const DESCRIPTION_TIMEOUT_MS = 10_000
const USER_AGENT = 'Mozilla/5.0 (compatible; AstirJobBoard/1.0)'

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase()
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITY_MAP[key] ?? match
  })
}

export function textFromHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|section|article|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\r\f\v]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

export function descriptionHash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export async function fetchDescriptionText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(DESCRIPTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      return null
    }
    const text = textFromHtml(await response.text())
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}
