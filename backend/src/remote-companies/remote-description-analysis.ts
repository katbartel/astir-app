import { normalizeForIdentity } from '../job-boards/normalized-job'

type DescriptionAnalysis = {
  locationClues: string[]
  reviewClues: string[]
  hardPresenceRequired: boolean
  occasionalPresence: boolean
  fullyRemote: boolean
  reasonCodes: string[]
}

const LOCATION_CONTEXT_TERMS = [
  'authorized',
  'authorised',
  'based',
  'citizen',
  'country',
  'eligible',
  'europe',
  'emea',
  'hire',
  'hiring',
  'located',
  'location',
  'reside',
  'timezone',
  'time zone',
  'choose where you live',
  'work from',
]

const REVIEW_CONTEXT_TERMS = [
  'contractor',
  'contract',
  'freelance',
  'consultant',
  'cet',
  'cest',
  'gmt',
  'bst',
  'utc 0',
  'utc 1',
  'utc 2',
  'utc 3',
  'utc+0',
  'utc+1',
  'utc+2',
  'utc+3',
  'european time',
  'european timezone',
  'european time zone',
  'europe hours',
  'emea hours',
]

const FULLY_REMOTE_TERMS = [
  'fully remote',
  'remote first',
  'remote-first',
  'choose where you live',
  'work from anywhere',
  'distributed team',
  'distributed company',
  'location independent',
]

const OCCASIONAL_PRESENCE_TERMS = [
  'annual offsite',
  'annual retreat',
  'company offsite',
  'company retreat',
  'quarterly offsite',
  'team offsite',
  'team retreat',
  'team gathering',
  'company gathering',
]

const HARD_PRESENCE_PATTERNS = [
  /\bhybrid\b/,
  /\bon[-\s]?site\b/,
  /\bin[-\s]?office\b/,
  /\boffice presence\b/,
  /\bregular presence\b/,
  /\bcommute to\b/,
  /\b\d+\s+days?\s+(?:a|per)\s+week\s+(?:in|at)\s+(?:the\s+)?office\b/,
]

function hasAny(haystack: string, terms: string[]): boolean {
  return terms.some((term) => haystack.includes(normalizeForIdentity(term)))
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

export function analyzeRemoteDescription(descriptionText: string | null | undefined): DescriptionAnalysis {
  if (!descriptionText?.trim()) {
    return {
      locationClues: [],
      reviewClues: [],
      hardPresenceRequired: false,
      occasionalPresence: false,
      fullyRemote: false,
      reasonCodes: ['description missing'],
    }
  }

  const normalized = normalizeForIdentity(descriptionText)
  const hardPresenceRequired = HARD_PRESENCE_PATTERNS.some((pattern) =>
    pattern.test(descriptionText.toLowerCase()),
  )
  const occasionalPresence = hasAny(normalized, OCCASIONAL_PRESENCE_TERMS)
  const fullyRemote = hasAny(normalized, FULLY_REMOTE_TERMS)
  const locationClues = sentences(descriptionText)
    .filter((sentence) => hasAny(normalizeForIdentity(sentence), LOCATION_CONTEXT_TERMS))
    .map((sentence) => {
      const normalizedSentence = normalizeForIdentity(sentence)
      if (normalizedSentence.includes('anywhere in europe')) return 'Europe'
      if (
        normalizedSentence.includes('work from anywhere') ||
        normalizedSentence.includes('choose where you live')
      ) {
        return 'Anywhere'
      }
      return sentence
    })
  const reviewClues = sentences(descriptionText).filter((sentence) =>
    hasAny(normalizeForIdentity(sentence), REVIEW_CONTEXT_TERMS),
  )

  return {
    locationClues,
    reviewClues,
    hardPresenceRequired,
    occasionalPresence,
    fullyRemote,
    reasonCodes: [
      ...(hardPresenceRequired ? ['description mentions regular presence'] : []),
      ...(occasionalPresence ? ['description mentions occasional presence'] : []),
      ...(fullyRemote ? ['description mentions fully remote'] : []),
      ...(locationClues.length ? ['description location clues'] : []),
      ...(reviewClues.length ? ['description review clues'] : []),
    ],
  }
}
