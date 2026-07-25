// The location classification of a single posting, decided once and cached.
// It is deliberately *user-independent*: it records what the posting says about
// where you can work, not whether it matches a given user. The per-user bucket
// (Match / Review / Filtered) is derived from this verdict plus the user's
// selected/excluded countries at read time — see the remote board feed.

export type LocationScope =
  // Worldwide / anywhere. eligibleCountries is null (everyone is eligible).
  | 'global'
  // A named multi-country region: Europe, EMEA, EU, EEA, DACH, Nordics, …
  // eligibleCountries holds the expanded member set.
  | 'region'
  // One or more specific countries (or cities that imply a country).
  | 'country'
  // No usable location signal, or signals that conflict. Lands in Review.
  | 'unclear'
  // Explicitly confined to a location a Europe-based candidate can't work from
  // (e.g. "US only"). eligibleCountries is [].
  | 'non_eligible'

// Timezone constraints never filter — they only power a badge. european_hours
// is informational; us_hours flags a nominally-global role that in practice
// wants US overlap.
export type TimezoneConstraint = 'none' | 'european_hours' | 'us_hours' | 'other'

export type LocationVerdict = {
  scope: LocationScope
  // ISO 3166-1 alpha-2 codes the posting is open to. null means global (anyone);
  // [] means no eligible country (non_eligible). For region/country it is the
  // expanded, deduped set.
  eligibleCountries: string[] | null
  // True only when the posting uses explicit hard-restriction language
  // ("only", "must be based in", "authorized to work in …"). This is the lever
  // that turns a country-tagged posting into a hard filter for non-matching
  // users; without it, a country tag is treated as contractor-plausible.
  restricted: boolean
  // ISO codes and/or region keys the posting confines itself to. Populated for
  // non_eligible ("US only" → ["US"]) and for restricted region/country
  // verdicts. Empty otherwise.
  restrictedTo: string[]
  timezoneConstraint: TimezoneConstraint
  // From the posting's work mode: true = Remote, false = Hybrid/On-Site,
  // null = unknown.
  remote: boolean | null
  // 0..1. Below the Match threshold, the UI surfaces the posting in Review even
  // when scope would otherwise place it in Match.
  confidence: number
  method: 'deterministic' | 'llm'
  // Human-readable trace of what drove the verdict — shown in Review and used
  // when tuning the taxonomy.
  signals: string[]
}

export type ClassificationResult = {
  verdict: LocationVerdict
  // True when the deterministic pass isn't confident enough to be authoritative
  // and the posting should be sent to the LLM (Phase 2). Everything the
  // deterministic pass resolves cleanly has escalate = false.
  escalate: boolean
}
