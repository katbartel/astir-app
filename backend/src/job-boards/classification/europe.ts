// The classification taxonomy, as data. This is the spec the deterministic
// classifier runs on: which places count as Europe, how regions/clusters expand
// to countries, which phrasings mean global vs. explicitly-restricted, and which
// places are non-European. Seed it well; the Review bucket surfaces whatever it
// misses so we learn what to add.
//
// Country identity is ISO 3166-1 alpha-2. Tokens are matched against location
// strings normalized with normalizeForIdentity (lowercase, diacritics stripped,
// punctuation folded to single spaces), on space boundaries — so "us" matches
// "remote us" but not "belarus".

export type CountryDef = {
  iso: string
  name: string
  // Native names, demonyms, and major cities — so a city-only posting ("Berlin",
  // "Dublin") still resolves to its country. Not exhaustive; Review catches the
  // long tail.
  aliases: string[]
}

// Broad Europe (not just the EU): includes the UK, Switzerland, Norway, Iceland,
// the Balkans, and Ukraine. This doubles as the country-picker list.
export const EUROPE_COUNTRIES: CountryDef[] = [
  { iso: 'AL', name: 'Albania', aliases: ['albania', 'tirana'] },
  { iso: 'AD', name: 'Andorra', aliases: ['andorra'] },
  { iso: 'AT', name: 'Austria', aliases: ['austria', 'osterreich', 'vienna', 'wien', 'graz', 'linz', 'salzburg'] },
  { iso: 'BY', name: 'Belarus', aliases: ['belarus', 'minsk'] },
  { iso: 'BE', name: 'Belgium', aliases: ['belgium', 'belgique', 'belgie', 'brussels', 'bruxelles', 'antwerp', 'antwerpen', 'ghent', 'gent'] },
  { iso: 'BA', name: 'Bosnia and Herzegovina', aliases: ['bosnia', 'herzegovina', 'sarajevo'] },
  { iso: 'BG', name: 'Bulgaria', aliases: ['bulgaria', 'sofia', 'plovdiv', 'varna'] },
  { iso: 'HR', name: 'Croatia', aliases: ['croatia', 'hrvatska', 'zagreb', 'split', 'rijeka'] },
  { iso: 'CY', name: 'Cyprus', aliases: ['cyprus', 'nicosia', 'limassol'] },
  { iso: 'CZ', name: 'Czechia', aliases: ['czechia', 'czech republic', 'cesko', 'prague', 'praha', 'brno', 'ostrava'] },
  { iso: 'DK', name: 'Denmark', aliases: ['denmark', 'danmark', 'copenhagen', 'kobenhavn', 'aarhus', 'odense'] },
  { iso: 'EE', name: 'Estonia', aliases: ['estonia', 'eesti', 'tallinn', 'tartu'] },
  { iso: 'FI', name: 'Finland', aliases: ['finland', 'suomi', 'helsinki', 'espoo', 'tampere', 'oulu'] },
  { iso: 'FR', name: 'France', aliases: ['france', 'paris', 'lyon', 'marseille', 'toulouse', 'lille', 'bordeaux', 'nantes', 'nice'] },
  { iso: 'DE', name: 'Germany', aliases: ['germany', 'deutschland', 'berlin', 'munich', 'munchen', 'hamburg', 'cologne', 'koln', 'frankfurt', 'stuttgart', 'dusseldorf', 'leipzig', 'dresden', 'hannover', 'nuremberg', 'nurnberg', 'karlsruhe'] },
  { iso: 'GR', name: 'Greece', aliases: ['greece', 'hellas', 'athens', 'thessaloniki'] },
  { iso: 'HU', name: 'Hungary', aliases: ['hungary', 'magyarorszag', 'budapest', 'debrecen'] },
  { iso: 'IS', name: 'Iceland', aliases: ['iceland', 'island', 'reykjavik'] },
  { iso: 'IE', name: 'Ireland', aliases: ['ireland', 'eire', 'dublin', 'cork', 'galway', 'limerick', 'waterford'] },
  { iso: 'IT', name: 'Italy', aliases: ['italy', 'italia', 'rome', 'roma', 'milan', 'milano', 'turin', 'torino', 'naples', 'napoli', 'bologna', 'florence', 'firenze'] },
  { iso: 'XK', name: 'Kosovo', aliases: ['kosovo', 'pristina'] },
  { iso: 'LV', name: 'Latvia', aliases: ['latvia', 'latvija', 'riga'] },
  { iso: 'LI', name: 'Liechtenstein', aliases: ['liechtenstein', 'vaduz'] },
  { iso: 'LT', name: 'Lithuania', aliases: ['lithuania', 'lietuva', 'vilnius', 'kaunas'] },
  { iso: 'LU', name: 'Luxembourg', aliases: ['luxembourg', 'letzebuerg'] },
  { iso: 'MT', name: 'Malta', aliases: ['malta', 'valletta'] },
  { iso: 'MD', name: 'Moldova', aliases: ['moldova', 'chisinau'] },
  { iso: 'MC', name: 'Monaco', aliases: ['monaco'] },
  { iso: 'ME', name: 'Montenegro', aliases: ['montenegro', 'podgorica'] },
  { iso: 'NL', name: 'Netherlands', aliases: ['netherlands', 'nederland', 'holland', 'amsterdam', 'rotterdam', 'the hague', 'den haag', 'utrecht', 'eindhoven'] },
  { iso: 'MK', name: 'North Macedonia', aliases: ['north macedonia', 'macedonia', 'skopje'] },
  { iso: 'NO', name: 'Norway', aliases: ['norway', 'norge', 'oslo', 'bergen', 'trondheim'] },
  { iso: 'PL', name: 'Poland', aliases: ['poland', 'polska', 'warsaw', 'warszawa', 'krakow', 'cracow', 'wroclaw', 'gdansk', 'gdynia', 'poznan', 'lodz', 'katowice', 'szczecin', 'bialystok', 'lublin'] },
  { iso: 'PT', name: 'Portugal', aliases: ['portugal', 'lisbon', 'lisboa', 'porto', 'braga'] },
  { iso: 'RO', name: 'Romania', aliases: ['romania', 'bucharest', 'bucuresti', 'cluj', 'cluj napoca', 'timisoara', 'iasi'] },
  { iso: 'SM', name: 'San Marino', aliases: ['san marino'] },
  { iso: 'RS', name: 'Serbia', aliases: ['serbia', 'srbija', 'belgrade', 'beograd', 'novi sad'] },
  { iso: 'SK', name: 'Slovakia', aliases: ['slovakia', 'slovensko', 'bratislava', 'kosice'] },
  { iso: 'SI', name: 'Slovenia', aliases: ['slovenia', 'slovenija', 'ljubljana', 'maribor'] },
  { iso: 'ES', name: 'Spain', aliases: ['spain', 'espana', 'madrid', 'barcelona', 'valencia', 'seville', 'sevilla', 'malaga', 'bilbao', 'zaragoza'] },
  { iso: 'SE', name: 'Sweden', aliases: ['sweden', 'sverige', 'stockholm', 'gothenburg', 'goteborg', 'malmo', 'uppsala'] },
  { iso: 'CH', name: 'Switzerland', aliases: ['switzerland', 'schweiz', 'suisse', 'svizzera', 'zurich', 'zurich', 'geneva', 'geneve', 'basel', 'bern', 'lausanne'] },
  { iso: 'UA', name: 'Ukraine', aliases: ['ukraine', 'ukraina', 'kyiv', 'kiev', 'lviv', 'kharkiv', 'odesa', 'odessa'] },
  { iso: 'GB', name: 'United Kingdom', aliases: ['united kingdom', 'uk', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'leeds', 'bristol', 'cardiff', 'belfast'] },
]

export const EUROPE_ISO: string[] = EUROPE_COUNTRIES.map((c) => c.iso)
const EUROPE_ISO_SET = new Set(EUROPE_ISO)

export function isEuropean(iso: string): boolean {
  return EUROPE_ISO_SET.has(iso)
}

// EU-27. "EU" / "European Union" is narrower than "Europe": it excludes the UK,
// Switzerland, Norway, Iceland, the Balkans, etc. So "EU only" is a real
// restriction that a UK- or Swiss-based candidate does not satisfy.
export const EU_ISO = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]

// EEA = EU + Iceland, Liechtenstein, Norway. Schengen is treated as EEA for v1.
export const EEA_ISO = [...EU_ISO, 'IS', 'LI', 'NO']

// Sub-regional clusters → member ISO codes.
export const CLUSTERS: Record<string, string[]> = {
  dach: ['DE', 'AT', 'CH'],
  benelux: ['BE', 'NL', 'LU'],
  nordics: ['SE', 'NO', 'DK', 'FI', 'IS'],
  nordic: ['SE', 'NO', 'DK', 'FI', 'IS'],
  scandinavia: ['SE', 'NO', 'DK'],
  scandinavian: ['SE', 'NO', 'DK'],
  baltics: ['EE', 'LV', 'LT'],
  baltic: ['EE', 'LV', 'LT'],
  iberia: ['ES', 'PT'],
  iberian: ['ES', 'PT'],
  'british isles': ['GB', 'IE'],
  'uk and ireland': ['GB', 'IE'],
  'uk ireland': ['GB', 'IE'],
  cee: ['PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'SI', 'HR', 'EE', 'LV', 'LT'],
  'central and eastern europe': ['PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'SI', 'HR', 'EE', 'LV', 'LT'],
  'central europe': ['PL', 'CZ', 'SK', 'HU', 'AT', 'CH', 'SI'],
  'eastern europe': ['PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'UA', 'RS', 'HR', 'SI'],
  'southern europe': ['ES', 'PT', 'IT', 'GR', 'MT', 'CY'],
  'western europe': ['FR', 'DE', 'NL', 'BE', 'LU', 'IE', 'GB', 'AT', 'CH'],
}

// Terms that mean "all of Europe" for our purposes. EMEA technically spans the
// Middle East and Africa too, but this product is Europe-focused, so EMEA
// resolves to the European set.
export const REGION_ALL_EUROPE_TERMS = ['europe', 'european', 'emea', 'europewide', 'europe wide', 'pan european', 'pan europe']

// EU / EEA / Schengen phrasings, kept distinct from "Europe" because they bound
// the eligible set (and thus can exclude some European users).
export const EU_TERMS = ['eu', 'european union']
export const EEA_TERMS = ['eea', 'european economic area', 'schengen']

// Worldwide / anywhere. "Global except US" still reads as global here — an
// exclusion inside a global label doesn't make it non-global for Europe.
export const GLOBAL_TERMS = [
  'worldwide', 'world wide', 'global', 'globally', 'anywhere', 'anywhere in the world',
  'work from anywhere', 'wfa', 'location independent', 'remote anywhere', 'fully distributed',
  'any country', 'any location',
]

// Non-European places. If one of these is the *only* geographic signal (no
// European or global signal present), the posting is non_eligible. If a European
// or global signal is also present, the European signal wins — a US-tagged role
// that also says "Europe" is a match. Middle East and Africa are intentionally
// omitted (EMEA overlap) to avoid wrongly excluding.
export const NON_EUROPE_TERMS: Record<string, string[]> = {
  US: ['us', 'usa', 'united states', 'u s', 'us based', 'stateside', 'new york', 'nyc', 'san francisco', 'sf bay', 'los angeles', 'chicago', 'austin', 'seattle', 'boston', 'denver', 'atlanta'],
  CA: ['canada', 'canadian', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary'],
  'North America': ['north america', 'north american', 'us canada', 'us and canada'],
  LATAM: ['latam', 'latin america', 'mexico', 'brazil', 'brasil', 'argentina', 'colombia', 'chile', 'peru', 'sao paulo', 'buenos aires'],
  APAC: ['apac', 'asia pacific', 'asia', 'india', 'bangalore', 'bengaluru', 'hyderabad', 'mumbai', 'delhi', 'singapore', 'australia', 'anz', 'sydney', 'melbourne', 'new zealand', 'japan', 'tokyo', 'philippines', 'manila', 'indonesia', 'jakarta', 'vietnam', 'malaysia', 'kuala lumpur', 'china', 'shanghai', 'hong kong', 'korea', 'seoul'],
}

// Hard-restriction phrasing — the ONLY thing that turns a location into a hard
// filter. Deliberately excludes soft locators like "based in <city>", which name
// where the team sits without forbidding a contractor elsewhere.
export const HARD_RESTRICTION_TERMS = [
  'only', 'exclusively', 'must be based', 'must reside', 'must be located', 'must live',
  'authorized to work', 'authorised to work', 'work authorization', 'work authorisation',
  'right to work', 'eligible to work in', 'residents of', 'located within',
]

// Timezone phrasings → constraint. Never filters; powers a badge only.
// Only reasonably-unambiguous abbreviations — bare two-letter forms like "pt",
// "et", "ct" are dropped because they collide with words in location strings
// (a "Portugal"/"part-time" fragment must not read as US Pacific Time).
export const EUROPEAN_TZ_TERMS = ['cet', 'cest', 'gmt', 'bst', 'european time', 'european timezone', 'european time zone', 'eu hours', 'europe hours', 'europe time']
export const US_TZ_TERMS = ['pst', 'pdt', 'est', 'edt', 'pacific time', 'eastern time', 'us hours', 'us business hours', 'overlap with pt', 'overlap with pst', 'overlap with et', 'overlap with est', 'us time zone', 'us timezone']

// ---- Derived lookups -------------------------------------------------------

// Normalized token → ISO code, built from every country name + alias. Multi-word
// tokens (e.g. "united kingdom") are kept whole and matched as phrases.
export const COUNTRY_TOKEN_TO_ISO: Record<string, string> = (() => {
  const index: Record<string, string> = {}
  for (const country of EUROPE_COUNTRIES) {
    for (const token of [country.name.toLowerCase(), ...country.aliases]) {
      index[token] = country.iso
    }
  }
  return index
})()

// Cluster/region phrase → ISO set, for expanding a matched region term.
export function clusterCountries(term: string): string[] | null {
  return CLUSTERS[term] ?? null
}
