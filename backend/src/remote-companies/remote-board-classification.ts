import { EUROPE_COUNTRIES, EUROPE_ISO } from '../job-boards/classification/europe'
import { classifyDeterministic } from '../job-boards/classification/classify-deterministic'
import { LocationVerdict } from '../job-boards/classification/verdict'
import { normalizeForIdentity } from '../job-boards/normalized-job'
import { analyzeRemoteDescription } from './remote-description-analysis'

type ClassifiableListing = {
  location: string | null
  locations: string[]
  workMode: string | null
  descriptionText?: string | null
}

export type RemoteBoardLocationFit = {
  label: string
  details?: string[]
  uncertain: boolean
}

export type RemoteBoardTypeFit = {
  label: 'Fully remote' | 'Remote, occasional presence' | 'Uncertain'
  uncertain: boolean
}

export type RemoteBoardClassification = {
  visible: boolean
  location: RemoteBoardLocationFit
  type: RemoteBoardTypeFit
  reasonCodes: string[]
}

const COUNTRY_NAME_BY_ISO = new Map(EUROPE_COUNTRIES.map((country) => [country.iso, country.name]))
const ISO_BY_REGION_KEY = new Map<string, string>()

for (const country of EUROPE_COUNTRIES) {
  for (const token of [country.name, ...country.aliases]) {
    ISO_BY_REGION_KEY.set(normalizeForIdentity(token), country.iso)
  }
}

ISO_BY_REGION_KEY.set('uk', 'GB')
ISO_BY_REGION_KEY.set('united kingdom', 'GB')

function listingLocations(listing: ClassifiableListing): string[] {
  return listing.locations.length ? listing.locations : listing.location ? [listing.location] : []
}

function selectedCountrySet(hiringRegions: string[]): Set<string> | null {
  if (!hiringRegions.length) {
    return new Set(EUROPE_ISO)
  }

  const selected = new Set<string>()
  for (const region of hiringRegions) {
    const key = normalizeForIdentity(region)
    if (key === 'europe' || key === 'emea') {
      return new Set(EUROPE_ISO)
    }
    if (key === 'eu' || key === 'european union') {
      for (const iso of [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
        'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
      ]) {
        selected.add(iso)
      }
      continue
    }
    const iso = ISO_BY_REGION_KEY.get(key)
    if (iso) {
      selected.add(iso)
    }
  }

  return selected.size ? selected : null
}

function intersectsSelected(countries: string[], selected: Set<string> | null): boolean {
  if (!selected) {
    return true
  }
  return countries.some((country) => selected.has(country))
}

function orderedCountries(countries: string[], hiringRegions: string[]): string[] {
  const uniqueCountries = [...new Set(countries)]
  const preferenceOrder = hiringRegions
    .map((region) => ISO_BY_REGION_KEY.get(normalizeForIdentity(region)))
    .filter((iso): iso is string => Boolean(iso))
  return uniqueCountries.sort((a, b) => {
    const aIndex = preferenceOrder.indexOf(a)
    const bIndex = preferenceOrder.indexOf(b)
    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    }
    return (COUNTRY_NAME_BY_ISO.get(a) ?? a).localeCompare(COUNTRY_NAME_BY_ISO.get(b) ?? b)
  })
}

function locationLabel(verdict: LocationVerdict, hiringRegions: string[], uncertain: boolean): string {
  if (uncertain || verdict.scope === 'unclear') {
    return 'Uncertain'
  }
  if (verdict.scope === 'global') {
    return 'Anywhere'
  }
  const countries = verdict.eligibleCountries ?? []
  if (countries.length === 0) {
    return 'Uncertain'
  }
  if (countries.length === EUROPE_ISO.length && EUROPE_ISO.every((iso) => countries.includes(iso))) {
    return 'Europe'
  }
  const ordered = orderedCountries(countries, hiringRegions)
  const first = COUNTRY_NAME_BY_ISO.get(ordered[0]) ?? ordered[0] ?? 'Uncertain'
  return ordered.length > 1 ? `${first} +${ordered.length - 1}` : first
}

function locationDetails(
  verdict: LocationVerdict,
  hiringRegions: string[],
  uncertain: boolean,
): string[] | undefined {
  if (uncertain || verdict.scope === 'unclear' || verdict.scope === 'global') {
    return undefined
  }
  const countries = verdict.eligibleCountries ?? []
  if (
    countries.length === 0 ||
    (countries.length === EUROPE_ISO.length && EUROPE_ISO.every((iso) => countries.includes(iso)))
  ) {
    return undefined
  }
  return orderedCountries(countries, hiringRegions).map((country) => COUNTRY_NAME_BY_ISO.get(country) ?? country)
}

function typeFit(
  verdict: LocationVerdict,
  analysis: ReturnType<typeof analyzeRemoteDescription>,
): RemoteBoardTypeFit {
  if (analysis.occasionalPresence) {
    return { label: 'Remote, occasional presence', uncertain: false }
  }
  if (verdict.remote === true || analysis.fullyRemote) {
    return { label: 'Fully remote', uncertain: false }
  }
  return { label: 'Uncertain', uncertain: true }
}

function hasNonEuropeanConflict(verdict: LocationVerdict): boolean {
  return verdict.signals.some((entry) => entry.includes('non-European'))
}

export function classifyRemoteBoardListing(
  listing: ClassifiableListing,
  hiringRegions: string[],
): RemoteBoardClassification {
  const analysis = analyzeRemoteDescription(listing.descriptionText)
  const { verdict, escalate } = classifyDeterministic({
    locations: [...listingLocations(listing), ...analysis.locationClues],
    workMode: listing.workMode,
  })
  const reasonCodes = [...verdict.signals, ...analysis.reasonCodes]
  const selectedCountries = selectedCountrySet(hiringRegions)

  if (verdict.remote === false || analysis.hardPresenceRequired) {
    return {
      visible: false,
      location: { label: 'Uncertain', uncertain: true },
      type: { label: 'Uncertain', uncertain: true },
      reasonCodes: [...reasonCodes, 'regular presence required'],
    }
  }

  if (verdict.restricted && hasNonEuropeanConflict(verdict)) {
    return {
      visible: false,
      location: { label: 'Uncertain', uncertain: true },
      type: typeFit(verdict, analysis),
      reasonCodes: [...reasonCodes, 'restricted outside Europe'],
    }
  }

  if (verdict.scope === 'non_eligible') {
    if (!verdict.restricted && analysis.reviewClues.length > 0) {
      return {
        visible: true,
        location: { label: 'Uncertain', uncertain: true },
        type: typeFit(verdict, analysis),
        reasonCodes: [...reasonCodes, 'non-European tag with review clue'],
      }
    }
    return {
      visible: false,
      location: { label: 'Uncertain', uncertain: true },
      type: typeFit(verdict, analysis),
      reasonCodes: [...reasonCodes, 'restricted outside Europe'],
    }
  }

  const countries = verdict.eligibleCountries
  if (countries && countries.length > 0 && !intersectsSelected(countries, selectedCountries)) {
    return {
      visible: false,
      location: { label: locationLabel(verdict, hiringRegions, false), uncertain: false },
      type: typeFit(verdict, analysis),
      reasonCodes: [...reasonCodes, 'outside selected countries'],
    }
  }

  const descriptionResolved =
    analysis.locationClues.length > 0 &&
    (verdict.scope === 'global' || verdict.scope === 'region' || verdict.scope === 'country')
  const hasClearEligibleLocation =
    verdict.scope === 'global' ||
    ((verdict.scope === 'region' || verdict.scope === 'country') &&
      (verdict.eligibleCountries?.length ?? 0) > 0)
  const hasSoftNonEuropeanConflict = hasNonEuropeanConflict(verdict) && !verdict.restricted
  const locationUncertain =
    verdict.scope === 'unclear' ||
    (!descriptionResolved &&
      verdict.confidence < 0.7 &&
      !(hasClearEligibleLocation && hasSoftNonEuropeanConflict)) ||
    (!descriptionResolved &&
      escalate &&
      verdict.scope !== 'global' &&
      verdict.scope !== 'region' &&
      verdict.scope !== 'country')

  return {
    visible: true,
    location: {
      label: locationLabel(verdict, hiringRegions, locationUncertain),
      details: locationDetails(verdict, hiringRegions, locationUncertain),
      uncertain: locationUncertain,
    },
    type: typeFit(verdict, analysis),
    reasonCodes,
  }
}
