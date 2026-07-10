// Shared by UsersService and the job-boards matching; lives in its own file
// so job-boards code can import it without pulling in UsersService (which in
// turn depends on job-boards for rematching).
export type WatchlistPreferencesInput = {
  keywords: string[]
  // Titles containing any of these are filtered out even if they also hit a
  // `keywords` term — exclusion wins (e.g. keep "Product Manager" but drop
  // "Principal Product Manager").
  excludedKeywords: string[]
  workModes: string[]
  contractTypes: string[]
  terms: string[]
  languages: string[]
  industryNoGos: string[]
  hiringRegions: string[]
}

// Starting point shown until the user saves their own watchlist preferences.
export const DEFAULT_WATCHLIST_PREFERENCES: WatchlistPreferencesInput = {
  keywords: ['Product Manager', 'Senior Product Manager', 'Product Owner', 'Senior Product Owner'],
  excludedKeywords: [],
  workModes: ['Remote', 'Hybrid', 'On-Site'],
  contractTypes: ['FTE', 'Freelance', 'Contract'],
  terms: ['Short term', 'Long term'],
  languages: ['Polish', 'English'],
  industryNoGos: ['alcohol', 'bitcoin', 'gaming', 'cigarettes', 'porn'],
  hiringRegions: ['Poland', 'Germany', 'EU'],
}
