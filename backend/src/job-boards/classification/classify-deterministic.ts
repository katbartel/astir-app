import { createHash } from 'node:crypto'

import { normalizeForIdentity } from '../normalized-job'
import {
  CLUSTERS,
  COUNTRY_TOKEN_TO_ISO,
  EEA_ISO,
  EEA_TERMS,
  EU_ISO,
  EU_TERMS,
  EUROPE_ISO,
  EUROPEAN_TZ_TERMS,
  GLOBAL_TERMS,
  HARD_RESTRICTION_TERMS,
  NON_EUROPE_TERMS,
  REGION_ALL_EUROPE_TERMS,
  US_TZ_TERMS,
} from './europe'
import { ClassificationResult, LocationVerdict, TimezoneConstraint } from './verdict'

export type ClassifyInput = {
  // Every location string the posting carries (JobListing.locations).
  locations: string[]
  // JobListing.workMode — 'Remote' | 'Hybrid' | 'On-Site' | null.
  workMode?: string | null
  // Reserved for Phase 2 (the LLM pass reads it); the deterministic pass ignores
  // it — content language is a weak signal and easily wrong.
  contentLanguage?: string | null
}

// Stable key over the classification-relevant fields, so a re-scan only
// reclassifies postings whose location/work-mode actually changed. Location
// order is normalized away so ["Berlin","Remote"] and ["Remote","Berlin"] share
// a key.
export function classificationCacheKey(input: ClassifyInput): string {
  const locations = input.locations
    .map(normalizeForIdentity)
    .filter(Boolean)
    .sort()
    .join('|')
  const workMode = normalizeForIdentity(input.workMode ?? '')
  return createHash('sha256').update(`${locations}::${workMode}`).digest('hex')
}

function remoteFlag(workMode?: string | null): boolean | null {
  if (!workMode) {
    return null
  }
  return normalizeForIdentity(workMode) === 'remote' ? true : false
}

// A location string contains a token when the token appears on space
// boundaries — so "us" matches "remote us" but not "belarus".
function makeMatcher(normalizedLocations: string[]) {
  const padded = normalizedLocations.map((location) => ` ${location} `)
  return (token: string): boolean => padded.some((location) => location.includes(` ${token} `))
}

function timezoneConstraint(has: (t: string) => boolean): TimezoneConstraint {
  // US-overlap wins: a "global, must overlap PT" role is the one worth badging.
  if (US_TZ_TERMS.some(has)) {
    return 'us_hours'
  }
  if (EUROPEAN_TZ_TERMS.some(has)) {
    return 'european_hours'
  }
  return 'none'
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

// Classifies a posting from its location strings and work mode alone (no
// description). Resolves the confident cases; sets escalate=true on anything an
// LLM pass should double-check (conflicts, bare non-European tags, empty
// locations, low confidence).
export function classifyDeterministic(input: ClassifyInput): ClassificationResult {
  const remote = remoteFlag(input.workMode)
  const normalizedLocations = input.locations.map(normalizeForIdentity).filter(Boolean)
  const has = makeMatcher(normalizedLocations)
  const tz = timezoneConstraint(has)

  const base = (partial: Partial<LocationVerdict>): LocationVerdict => ({
    scope: 'unclear',
    eligibleCountries: null,
    restricted: false,
    restrictedTo: [],
    timezoneConstraint: tz,
    remote,
    confidence: 0.3,
    method: 'deterministic',
    signals: [],
    ...partial,
  })

  // No usable location signal. Per product intent, a remote posting with no
  // stated geography is shown as "Europe in general" (contractor/EOR routes
  // exist) rather than hidden — but at low confidence and flagged for the LLM
  // pass, since the description may say otherwise.
  if (normalizedLocations.length === 0) {
    return {
      verdict: base({
        scope: 'region',
        eligibleCountries: EUROPE_ISO,
        confidence: 0.4,
        signals: ['no location stated — assuming Europe'],
      }),
      escalate: true,
    }
  }

  const restricted = HARD_RESTRICTION_TERMS.some(has)
  const nonEuropeRegions = Object.entries(NON_EUROPE_TERMS)
    .filter(([, tokens]) => tokens.some(has))
    .map(([label]) => label)
  const hasNonEurope = nonEuropeRegions.length > 0

  const hasGlobal = GLOBAL_TERMS.some(has)
  const hasEuropeRegion = REGION_ALL_EUROPE_TERMS.some(has)
  const hasEu = EU_TERMS.some(has)
  const hasEea = EEA_TERMS.some(has)
  const matchedClusters = Object.keys(CLUSTERS).filter(has)
  const matchedCountries = unique(
    Object.entries(COUNTRY_TOKEN_TO_ISO)
      .filter(([token]) => has(token))
      .map(([, iso]) => iso),
  )

  const hasEuropeanSignal =
    hasGlobal || hasEuropeRegion || hasEu || hasEea || matchedClusters.length > 0 || matchedCountries.length > 0

  // Conflict: a European/global signal AND a non-European place named. The
  // European signal wins (include by default), but we can't confirm from the
  // location alone that a "US" tag is really open to Europe — so lower the
  // confidence and escalate for the LLM to read the description.
  const conflict = hasEuropeanSignal && hasNonEurope
  const conflictNote = (signals: string[]): string[] =>
    conflict ? [...signals, `also names non-European location(s): ${nonEuropeRegions.join(', ')}`] : signals

  // Global — worldwide/anywhere. An explicit restriction alongside "global" is
  // odd enough to double-check.
  if (hasGlobal) {
    const escalate = conflict || restricted
    return {
      verdict: base({
        scope: 'global',
        eligibleCountries: null,
        restricted,
        restrictedTo: restricted ? nonEuropeRegions : [],
        confidence: escalate ? 0.6 : 0.9,
        signals: conflictNote(['worldwide/global']),
      }),
      escalate,
    }
  }

  // Europe / EMEA — resolves to the whole European set, so every European user
  // matches. "only" here is a no-op for European users, so it doesn't exclude.
  if (hasEuropeRegion) {
    return {
      verdict: base({
        scope: 'region',
        eligibleCountries: EUROPE_ISO,
        restricted,
        confidence: conflict ? 0.6 : 0.9,
        signals: conflictNote(['Europe/EMEA']),
      }),
      escalate: conflict,
    }
  }

  // EU / EEA / Schengen — a bounded subset. Without "only", a non-EU European
  // (UK, CH, NO) falls to Possible/Review at read time (contractor-plausible);
  // with "only", they're filtered.
  if (hasEu || hasEea) {
    const eligible = hasEea ? EEA_ISO : EU_ISO
    return {
      verdict: base({
        scope: 'region',
        eligibleCountries: unique([...eligible, ...matchedCountries]),
        restricted,
        restrictedTo: restricted ? [hasEea ? 'EEA' : 'EU'] : [],
        confidence: conflict ? 0.6 : 0.85,
        signals: conflictNote([hasEea ? 'EEA/Schengen' : 'EU']),
      }),
      escalate: conflict,
    }
  }

  // Sub-regional cluster(s): DACH, Nordics, Benelux, …
  if (matchedClusters.length > 0) {
    const eligible = unique([...matchedClusters.flatMap((c) => CLUSTERS[c]), ...matchedCountries])
    return {
      verdict: base({
        scope: 'region',
        eligibleCountries: eligible,
        restricted,
        restrictedTo: restricted ? matchedClusters : [],
        confidence: conflict ? 0.6 : 0.8,
        signals: conflictNote([`cluster: ${matchedClusters.join(', ')}`]),
      }),
      escalate: conflict,
    }
  }

  // Specific European countries/cities. A hard "only" makes this an exclusive
  // filter for other users; otherwise a country tag is contractor-plausible.
  if (matchedCountries.length > 0) {
    return {
      verdict: base({
        scope: 'country',
        eligibleCountries: matchedCountries,
        restricted,
        restrictedTo: restricted ? matchedCountries : [],
        confidence: conflict ? 0.6 : matchedCountries.length === 1 ? 0.85 : 0.8,
        signals: conflictNote([`country: ${matchedCountries.join(', ')}`]),
      }),
      escalate: conflict,
    }
  }

  // Only non-European places named, no European/global signal. We hard-exclude
  // confidently ONLY when the posting also uses explicit restriction language
  // ("US only", "must be authorized to work in the US"). A bare "US" tag might
  // hide a "open worldwide" in the description, so escalate instead of trusting
  // it.
  if (hasNonEurope) {
    return {
      verdict: base({
        scope: 'non_eligible',
        eligibleCountries: [],
        restricted,
        restrictedTo: nonEuropeRegions,
        confidence: restricted ? 0.85 : 0.5,
        signals: [`${restricted ? 'restricted to' : 'tagged'} non-European: ${nonEuropeRegions.join(', ')}`],
      }),
      escalate: !restricted,
    }
  }

  // Location strings present but nothing recognized.
  return {
    verdict: base({
      scope: 'unclear',
      confidence: 0.3,
      signals: ['location present but not recognized'],
    }),
    escalate: true,
  }
}
