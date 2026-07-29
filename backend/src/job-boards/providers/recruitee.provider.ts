import { Injectable } from '@nestjs/common'
import { NormalizedJob, WorkMode, parseDate } from '../normalized-job'
import {
  AtsProvider,
  JobBoardSourceRef,
  companyHandleCandidates,
  fetchJson,
} from './job-board-provider'

const PROBE_TIMEOUT_MS = 6_000

// Subset of https://{handle}.recruitee.com/api/offers/ we rely on. The
// endpoint returns only published offers.
type RecruiteeOffer = {
  id?: number | string
  title?: string
  careers_url?: string
  city?: string
  country?: string
  location?: string
  locations?: Array<{ name?: string; city?: string; state?: string; country?: string }>
  remote?: boolean
  hybrid?: boolean
  on_site?: boolean
  status?: string
  published_at?: string
  created_at?: string
  company_name?: string
}

function joinPlace(parts: Array<string | undefined>): string | null {
  const cleaned = parts.map((part) => part?.trim()).filter(Boolean)
  return cleaned.length ? cleaned.join(', ') : null
}

function locationsFromRecruitee(offer: RecruiteeOffer): string[] {
  const places = [
    offer.location,
    ...(offer.locations ?? []).map(
      (place) => place.name?.trim() || joinPlace([place.city, place.state, place.country]),
    ),
  ]
  return [...new Set(places.map((place) => place?.trim()).filter((place): place is string => !!place))]
}

function workModeFromRecruitee(offer: RecruiteeOffer): WorkMode | null {
  if (offer.remote) {
    return 'Remote'
  }
  if (offer.hybrid) {
    return 'Hybrid'
  }
  if (offer.on_site) {
    return 'On-Site'
  }
  return null
}

@Injectable()
export class RecruiteeProvider implements AtsProvider {
  readonly provider = 'recruitee'
  readonly kind = 'ats' as const

  private offersUrl(handle: string): string {
    return `https://${encodeURIComponent(handle)}.recruitee.com/api/offers/`
  }

  handleFromUrl(url: string): string | null {
    // Careers sites live at https://{company}.recruitee.com/ with per-job
    // links at /o/{slug}. Only the subdomain form is detectable; custom
    // domains carry no handle.
    const match = url.match(/([a-z0-9-]+)\.recruitee\.com/i)
    return match && match[1] !== 'www' ? match[1].toLowerCase() : null
  }

  candidateHandles(companyName: string): string[] {
    return companyHandleCandidates(companyName)
  }

  async verifyHandle(handle: string): Promise<boolean> {
    try {
      const payload = (await fetchJson(this.offersUrl(handle), PROBE_TIMEOUT_MS)) as {
        offers?: unknown[]
      }
      return Array.isArray(payload.offers)
    } catch {
      return false
    }
  }

  async fetchListings(source: JobBoardSourceRef): Promise<NormalizedJob[]> {
    const payload = (await fetchJson(this.offersUrl(source.externalId))) as {
      offers?: RecruiteeOffer[]
    }
    if (!Array.isArray(payload.offers)) {
      throw new Error(`Recruitee company "${source.externalId}" returned no offers array`)
    }
    return payload.offers
      .filter((offer) => offer.status === undefined || offer.status === 'published')
      .map((offer) => this.normalize(offer, source))
      .filter((job): job is NormalizedJob => job !== null)
  }

  normalize(offer: RecruiteeOffer, source: JobBoardSourceRef): NormalizedJob | null {
    if (offer.id === undefined || !offer.title || !offer.careers_url) {
      return null
    }
    return {
      provider: this.provider,
      externalId: String(offer.id),
      title: offer.title.trim(),
      companyName: offer.company_name?.trim() || source.companyName,
      location: offer.location?.trim() || joinPlace([offer.city, offer.country]),
      locations: locationsFromRecruitee(offer),
      workMode: workModeFromRecruitee(offer),
      url: offer.careers_url,
      postedAt: parseDate(offer.published_at) ?? parseDate(offer.created_at),
    }
  }
}
