# Job Boards: provider ingestion and the m:n user relation

## Goal

Periodically pull open roles from public job-board APIs, normalize them behind an
anti-corruption layer, store them deduplicated in Postgres, relate them m:n to users,
and show each user their matches under the "Job Boards" navigation item. Job Boards is
independent of the Watchlist screen: the Watchlist is a user's hand-curated set of
companies; Job Boards aggregates every relevant opening across all polled sources into
one feed. The two are wired together at the data layer — a watchlist company drives
which sources are polled, and a company's matched openings show under it on the
Watchlist.

Launch providers: Greenhouse, Ashby, Workable, Lever, SmartRecruiters, Recruitee,
Teamtailor, Personio, Join, Workday, and a generic schema.org JobPosting reader
(**ATS**), plus Arbeitnow, The Muse, and Adzuna (**aggregator**) — see below.

## ATS vs aggregator providers

`JobBoardProvider` has a `kind`, and the distinction drives everything:

- **`ats`** (Greenhouse, Ashby, Workable, Lever, SmartRecruiters, Recruitee,
  Teamtailor, Personio, Join, Workday, JobPosting) — an Applicant Tracking System board with
  ONE company per board. It cannot be queried without a company handle, so ATS
  providers are only ever polled for companies a user put on their watchlist. In
  code this is enforced by the `AtsProvider` interface, which adds handle
  resolution (`handleFromUrl`, `candidateHandles`, `verifyHandle`) — a provider
  that needs a company to return anything. Two do not fit the guess-a-slug mould:
  **Workday** packs `tenant:dc:site` into its handle (data-center and site can't
  be guessed, so it resolves from a careers URL only, `candidateHandles` empty),
  and the generic **JobPosting** reader takes a careers URL as its handle and
  reads embedded schema.org JobPosting JSON-LD — a last-resort fallback (see
  resolution order below), so it claims no host and can't be name-probed.
  **Join** still guesses a slug like the rest, but its jobs API is keyed by a
  numeric company id that lives only in the careers page's `__NEXT_DATA__`, so
  every probe/fetch first resolves the slug to that id.
- **`aggregator`** (Arbeitnow, The Muse, Adzuna) — a classical multi-company job
  board queried without a handle (keyword/location search). One feed spans many
  companies, so aggregators are polled unconditionally. In code this is the
  `AggregatorProvider` interface: it declares a `feed` (`JobBoardSourceRef`) whose
  `externalId` is a fixed feed key and whose scope is baked into the provider
  (Arbeitnow walks its entire European feed to the end — the feed is not
  globally date-sorted, so stopping at the first few pages silently drops
  recent roles; The Muse pulls a
  curated set of European locations — `MUSE_LOCATIONS` is the tuning knob; Adzuna
  searches `de`+`gb` newest-first). `fetchListings` ignores the passed source ref.
  Adding an aggregator is: implement `AggregatorProvider`, register it, done —
  `JobIngestionService.ensureAggregatorSources()` seeds its always-polled
  `job_sources` row on startup, so no watchlist company is needed to populate it.

  A feed that needs credentials implements the optional `isEnabled()` gate.
  **Adzuna** does: it reads `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` and, when either is
  missing, `isEnabled()` returns false — `ensureAggregatorSources()` then skips it
  entirely, so a keyless environment never grows an empty, failing source.
  Restrictions worth knowing: the free tier is capped (~250 calls/day, hence the
  tiny pull) and is **personal-use only** — commercial use needs a licence from
  Adzuna — and their terms require a "Jobs by Adzuna" attribution wherever the
  listings are shown (rendered in `JobBoardsView` for `adzuna`-sourced rows).

## Sources are dynamic — the superset of everyone's watchlist

There are no hardcoded default sources. The set of ATS boards polled is exactly the
union of every user's watchlisted companies, resolved to handles and deduplicated:
two users watching "Celonis" share one `job_sources` row, polled once. A fresh
database polls nothing until a company is added.

`CompanyResolutionService` turns a watchlist company into a shared source, cheapest
path first:
1. An existing source for the same `companyKey` (already resolved by someone).
2. The careers URL, if it points at a known ATS host — deterministic
   (`handleFromUrl`).
3. Probing candidate slugs (`companyHandleCandidates`: collapsed lowercase name
   first, then hyphenated and first-word forms) against each ATS, first board with
   ≥1 job wins. Requiring a non-empty board avoids false-positive handle matches.
4. Reading the careers page itself: if a URL was given and steps 2–3 found
   nothing, the generic `JobPosting` reader fetches it and looks for embedded
   schema.org JobPosting JSON-LD. Only when that yields ≥1 posting does it become
   the source (handle = the careers URL). This is deliberately last — it never
   pre-empts a real ATS (`handleFromUrl` returns null, `candidateHandles` is
   empty), so custom-domain careers pages are still name-probed first.

A company that resolves to nothing — not even embedded JobPosting data — is marked
`resolutionStatus = 'unresolved'` — a scraping candidate (see below), not an error.

## Scraping fallback (designed, not built)

Companies that resolve to no ATS — and whose careers page carries no schema.org
JobPosting data — are the input to `ScrapingFallbackService` (a flagged stub). The
intended order, cheapest first: sniff the careers page for an embedded ATS we
already support (really a resolution win), and only last fall back to HTML
scraping with per-site parsers. (The earlier gaps here — Workday, Personio, and
reading embedded JobPosting JSON-LD — are now real ATS providers, so they resolve
in the normal flow above rather than through scraping.) Anything scraped maps to `NormalizedJob` and goes
through the same upsert + matching pipeline, so the rest of the system is unaware.

## Ingest the superset, filter at relation time

Ingestion is deliberately user-agnostic: every job from every polled source is
stored, regardless of anyone's keywords. All user-specific logic lives in
`JobMatchingService`, which computes the m:n rows from stored listings at any time.
Consequences:

- Adding a watchlist company resolves + pulls its board immediately, then attaches
  matches to that user, so its roles show at once.
- Saving watchlist preferences recomputes that user's relations immediately (stale
  rows removed, new matches added, surviving rows keep their per-user status).
- A brand-new user is matched against the already-ingested corpus right at first
  login — no re-ingestion needed.
- The hourly sync polls all watchlist-linked ATS sources plus any aggregators, then
  re-runs matching for all users.

## Ingest the superset, filter at relation time

Ingestion is deliberately user-agnostic: every job from every enabled source is
stored, regardless of anyone's keywords. All user-specific logic lives in
`JobMatchingService`, which computes the m:n rows from stored listings at any time.
Consequences:

- Saving watchlist preferences recomputes that user's relations immediately (stale
  rows removed, new matches added, surviving rows keep their per-user status).
- A brand-new user is matched against the already-ingested corpus right at first
  login — no re-ingestion needed.
- The hourly sync re-runs matching for all users after pulling new listings.

## Data model

- `watchlist_companies` — a user's watched companies (name, careers URL, alerts,
  `resolutionStatus`, and the resolved `jobSourceId`). CRUD lives in
  `WatchlistModule`; the union of all rows is the source superset.
- `job_sources` — one row per company per provider; `external_id` is the provider
  handle (Greenhouse board token, Ashby job-board name, Workable subdomain, Lever
  account, SmartRecruiters company identifier, Recruitee subdomain, Teamtailor
  subdomain, Personio subdomain, Join careers slug, Workday `tenant:dc:site`, or
  — for the generic JobPosting reader — the careers URL itself).
  `kind` is `ats` or `aggregator`; `companyKey` (normalized name) dedupes ATS
  resolution so users watching the same company share one source.
- `job_listings` — one canonical opening, unique by `fingerprint` (normalized
  `company|title|location`). Location is part of the identity because companies
  post the same title as separate per-region openings (Linear's "Product Manager"
  exists for North America and for Europe); merging those hides real openings.
  `locations` holds every location string any provider stated for the posting.
- `job_listing_sources` — where a listing was seen, unique per `(provider,
  external_id)`; the same opening arriving from a second provider adds a row here
  instead of a duplicate listing.
- `user_job_listings` — the m:n relation, with `status` and `matched_keywords`.

## Matching rules

A listing belongs to a user when all three hold:

1. **Keyword**: the title contains one of their watchlist keywords (whole-phrase,
   case/diacritic/punctuation-insensitive).
2. **Work mode**: a stated work mode must be one the user selected (deselecting
   Hybrid drops hybrid postings); unknown mode is kept.
3. **Hiring region**: one of the posting's location strings names a selected
   region — city ("Berlin"), country ("Remote, Italy" for EU), or explicit remote
   region ("EMEA", "Europe", a stated country list). US-based postings qualify only
   when EU hiring is stated. A bare "Remote" or a plain "San Francisco" does not
   match: hiring elsewhere must be stated, not assumed. No location data at all is
   kept — unknown is not the same as elsewhere.

Region tokens live in `region-matching.ts` ("EU" expands to member states plus
Europe/EMEA phrasings; Germany/Poland include their major cities). A region the
map does not know acts as its own literal token.

## Anti-corruption layer

Every provider implements `JobBoardProvider` (`backend/src/job-boards/providers/`)
and maps its raw payload into `NormalizedJob` before anything touches the database;
provider quirks stop at that boundary. Work modes normalize to `Remote` / `Hybrid` /
`On-Site`; all stated locations (primary, secondary, address country) are captured.
To add a provider: implement the interface, register the class in `JobBoardsModule`,
add it to the `JOB_BOARD_PROVIDERS` factory.

## API

- `GET /api/job-boards/listings` — the signed-in user's matches with providers and
  matched keywords; dismissed rows excluded.
- `POST /api/job-boards/sync` — manual refresh; returns a sync summary.
- `GET /api/watchlist/companies` — the user's watched companies, each with its live
  matched roles.
- `POST /api/watchlist/companies` — add `{ name, careersUrl?, alertsOn? }`; resolves
  and backfills before returning.
- `PATCH /api/watchlist/companies/:id` — edit name / careers URL / alerts; re-resolves
  when the identity changes and the company is not yet resolved.
- `DELETE /api/watchlist/companies/:id` — remove from the watchlist (listings and the
  feed are untouched; the source simply stops being polled once nobody watches it).

The hourly cron does the same sync in the background; `JOB_INGESTION_ENABLED=false`
turns polling off.

## Frontend

**Job Boards** (`/job-boards`, between Watchlist and Pipeline) is a flat feed,
deliberately not grouped by company, sorted newest to oldest by posting date, falling
back to first-seen. Rows show title, open-posting link, a "New" chip inside 48 hours,
and a company · location · work-mode meta line.

**Watchlist** (`/watchlist`) is the editable company list. "Add company" opens a
modal (careers link first, with name auto-derived from known ATS URLs), and each
company has a bell (alerts) and a kebab with Edit and Remove (Remove confirms first).
Companies with matching roles render as cards with those roles; companies with none
collapse into the quiet disclosure. An unresolved company shows a gentle note asking
for its careers link. Per the product rules there are no counts anywhere.
