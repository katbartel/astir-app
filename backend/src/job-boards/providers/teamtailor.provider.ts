import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000
const VANITY_HOSTS = new Set([
  'careers.akeneo.com',
  'careers.cafeyn.co',
  'careers.dare.global',
  'careers.flexciton.com',
  'careers.mnemonic.io',
  'careers.viaplaygroup.com',
  'career.bannerflow.com',
  'career.optiveum.com',
  'jobs.efficy.com',
  'teamtailor.kilo.co',
])

// Every Teamtailor career site serves a public JSON Feed of its published jobs
// at https://{handle}.teamtailor.com/jobs.json — no key, no login. The feed
// wraps each posting in the JSON Feed 1.1 item shape and hangs a schema.org
// JobPosting off the `_jobposting` extension, which is where location and
// company live.
type TeamtailorAddress = {
  addressLocality?: string
  addressRegion?: string
  addressCountry?: string
}

type TeamtailorPlace = {
  address?: TeamtailorAddress
}

type TeamtailorJobPosting = {
  hiringOrganization?: { name?: string }
  // Single object or array depending on how many offices a posting names.
  jobLocation?: TeamtailorPlace | TeamtailorPlace[]
  // schema.org signals a remote role with "TELECOMMUTE"; nothing distinguishes
  // hybrid from on-site here, so those stay unset.
  jobLocationType?: string
  datePosted?: string
}

type TeamtailorItem = {
  id?: string
  title?: string
  url?: string
  date_published?: string
  _jobposting?: TeamtailorJobPosting
}

function joinPlace(address: TeamtailorAddress | undefined): string | null {
  if (!address) {
    return null
  }
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
    .map((part) => part?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function locationsFromTeamtailor(posting: TeamtailorJobPosting | undefined): string[] {
  const raw = posting?.jobLocation
  const places = Array.isArray(raw) ? raw : raw ? [raw] : []
  return [
    ...new Set(
      places
        .map((place) => joinPlace(place.address))
        .filter((place): place is string => !!place),
    ),
  ]
}

function workModeFromTeamtailor(posting: TeamtailorJobPosting | undefined): WorkMode | null {
  return posting?.jobLocationType === 'TELECOMMUTE' ? 'Remote' : null
}

@Injectable()
export class TeamtailorProvider implements AtsProvider {
  readonly provider = 'teamtailor'
  readonly kind = 'ats' as const

  private feedUrl(handle: string): string {
    // A handle that is already a full host (e.g. "jobs.zitadel.com") is a
    // career site served on a vanity domain — the JSON Feed still lives at
    // /jobs.json, so use it directly. A bare handle is the *.teamtailor.com
    // subdomain form.
    if (handle.includes('.')) {
      return `https://${handle}/jobs.json`
    }
    return `https://${encodeURIComponent(handle)}.teamtailor.com/jobs.json`
  }

  handleFromUrl(url: string): string | null {
    // Career sites live at https://{company}.teamtailor.com/ with per-job links
    // at /jobs/{id}. Only the subdomain form is detectable; custom domains
    // carry no handle.
    const match = url.match(/([a-z0-9-]+)\.teamtailor\.com/i)
    if (match && match[1] !== 'www') {
      return match[1].toLowerCase()
    }
    try {
      const parsed = new URL(url)
      const hostname = parsed.hostname.toLowerCase()
      return VANITY_HOSTS.has(hostname) ? hostname : null
    } catch {
      return null
    }
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(this.feedUrl(handle), PROBE_TIMEOUT_MS)) as {
        items?: unknown[]
      }
      return Array.isArray(payload.items) && payload.items.length > 0
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const payload = (await fetchJson(this.feedUrl(source.externalId))) as {
      items?: TeamtailorItem[]
    }
    if (!Array.isArray(payload.items)) {
      throw new Error(`Teamtailor site "${source.externalId}" returned no items array`)
    }
    return payload.items
      .map((item) => this.normalize(item, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(item: TeamtailorItem, source: JobBoardSourceRef): NormalizedJob | null {
    if (!item.id || !item.title || !item.url) {
      return null
    }
    const posting = item._jobposting
    const locations = locationsFromTeamtailor(posting)
    return {
      provider: this.provider,
      externalId: String(item.id),
      title: item.title.trim(),
      companyName: posting?.hiringOrganization?.name?.trim() || source.companyName,
      location: locations[0] ?? null,
      locations,
      workMode: workModeFromTeamtailor(posting),
      url: item.url,
      postedAt: parseDate(item.date_published) ?? parseDate(posting?.datePosted),
    }
  }
}
