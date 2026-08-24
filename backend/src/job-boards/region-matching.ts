import { normalizeForIdentity } from './normalized-job'

// EU member states; "EU" as a hiring region accepts any of them plus the
// generic Europe/EMEA phrasings companies use on postings.
const EU_COUNTRIES = [
  'austria',
  'belgium',
  'bulgaria',
  'croatia',
  'cyprus',
  'czech republic',
  'czechia',
  'denmark',
  'estonia',
  'finland',
  'france',
  'germany',
  'greece',
  'hungary',
  'ireland',
  'italy',
  'latvia',
  'lithuania',
  'luxembourg',
  'malta',
  'netherlands',
  'poland',
  'portugal',
  'romania',
  'slovakia',
  'slovenia',
  'spain',
  'sweden',
]

// Broader Europe for users who select "Europe" rather than "EU". Keep this in
// step with the deterministic classifier's Europe scope.
const NON_EU_EUROPE_COUNTRIES = [
  'united kingdom',
  'uk',
  'great britain',
  'britain',
  'england',
  'scotland',
  'wales',
  'northern ireland',
  'london',
  'manchester',
  'birmingham',
  'edinburgh',
  'glasgow',
  'leeds',
  'bristol',
  'cardiff',
  'belfast',
  'switzerland',
  'swiss',
  'zurich',
  'geneva',
  'basel',
  'bern',
  'lausanne',
  'norway',
  'oslo',
  'bergen',
  'trondheim',
  'iceland',
  'reykjavik',
]

// Cities matter because many postings only name a city ("Berlin Office",
// "Dublin"). Each country entry lists its own cities so selecting the country
// alone catches city-only postings.
const COUNTRY_TOKENS: Record<string, string[]> = {
  ireland: ['ireland', 'eire', 'dublin', 'cork', 'galway', 'limerick', 'waterford'],
  germany: [
    'germany',
    'deutschland',
    'berlin',
    'munich',
    'munchen',
    'hamburg',
    'cologne',
    'koln',
    'frankfurt',
    'stuttgart',
    'dusseldorf',
    'leipzig',
    'dresden',
    'hannover',
    'nuremberg',
    'nurnberg',
    'karlsruhe',
  ],
  poland: [
    'poland',
    'polska',
    'warsaw',
    'warszawa',
    'krakow',
    'cracow',
    'wroclaw',
    'gdansk',
    'gdynia',
    'poznan',
    'lodz',
    'katowice',
    'szczecin',
    'bialystok',
    'lublin',
  ],
}

// "EU" accepts the generic bloc phrasings, every member country name, and
// every city we know for those countries, so a bare "Dublin" or "Berlin"
// posting matches.
const EU_TOKENS = [
  'eu',
  'european union',
  'europe',
  'emea',
  ...EU_COUNTRIES,
  ...Object.values(COUNTRY_TOKENS).flat(),
]

const EUROPE_TOKENS = [
  'europe',
  'emea',
  ...EU_TOKENS,
  ...NON_EU_EUROPE_COUNTRIES,
]

const GLOBAL_TOKENS = [
  'global',
  'worldwide',
  'anywhere',
  'international',
]

const REGION_TOKENS: Record<string, string[]> = {
  eu: EU_TOKENS,
  europe: EUROPE_TOKENS,
  emea: EUROPE_TOKENS,
  'european union': EU_TOKENS,
  ...COUNTRY_TOKENS,
}

// A region the map does not know (say the user adds "Spain") still works as
// its own literal token.
function tokensForRegion(region: string): string[] {
  const key = normalizeForIdentity(region)
  return REGION_TOKENS[key] ?? (key ? [key] : [])
}

function containsToken(normalizedLocation: string, token: string): boolean {
  return ` ${normalizedLocation} `.includes(` ${token} `)
}

function isGlobalLocation(normalizedLocation: string): boolean {
  return GLOBAL_TOKENS.some((token) => containsToken(normalizedLocation, token))
}

// A listing is region-eligible when one of its location strings names a
// selected region — this covers "Berlin", "Remote, Germany", and US-based
// postings that explicitly state EU hiring ("Remote (US) / Europe"). Postings
// whose locations carry no selected-region signal (e.g. plain "San Francisco"
// or a bare "Remote") are excluded unless they explicitly state global hiring.
// Listings with no location data at all are kept — unknown is not the same as
// elsewhere.
export function matchesHiringRegions(locations: string[], hiringRegions: string[]): boolean {
  if (!hiringRegions.length) {
    return true
  }
  const normalizedLocations = locations.map(normalizeForIdentity).filter(Boolean)
  if (!normalizedLocations.length) {
    return true
  }
  if (normalizedLocations.some(isGlobalLocation)) {
    return true
  }
  const tokens = hiringRegions.flatMap(tokensForRegion)
  return normalizedLocations.some((location) =>
    tokens.some((token) => containsToken(location, token)),
  )
}

// Unknown work mode is kept; a stated mode must be one the user selected.
export function matchesWorkModes(workMode: string | null, workModes: string[]): boolean {
  if (!workModes.length || !workMode) {
    return true
  }
  return workModes.some((mode) => normalizeForIdentity(mode) === normalizeForIdentity(workMode))
}
