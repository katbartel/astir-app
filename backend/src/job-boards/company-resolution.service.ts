import { Inject, Injectable, Logger } from '@nestjs/common'
import { JobSource } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'
import { companyKey } from './normalized-job'
import {
  AtsProvider,
  GENERIC_JOBPOSTING_PROVIDER,
  JOB_BOARD_PROVIDERS,
  JobBoardProvider,
  isAtsProvider,
} from './providers/job-board-provider'

export type ResolvedHandle = {
  provider: string
  externalId: string
}

// Turns a watchlist company (name + optional careers URL) into a shared
// JobSource on one of the ATS providers. Resolution order:
//   1. The careers URL, if it points at a known ATS host (deterministic).
//   2. An existing source for the same company (someone already resolved it).
//   3. Probing candidate slugs against each ATS provider (best guess).
//   4. Reading the careers page itself for embedded schema.org JobPosting data
//      (the generic last resort, only when 1-3 found nothing).
// Aggregator providers are never involved here — they are not company-scoped.
@Injectable()
export class CompanyResolutionService {
  private readonly logger = new Logger(CompanyResolutionService.name)
  private readonly atsProviders: AtsProvider[]

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_BOARD_PROVIDERS) providers: JobBoardProvider[],
  ) {
    this.atsProviders = providers.filter(isAtsProvider)
  }

  // Resolves and returns the shared JobSource, or null if the company was not
  // found on any ATS (a scraping candidate).
  async resolveToSource(name: string, careersUrl: string | null): Promise<JobSource | null> {
    const key = companyKey(name)
    const fromUrl = careersUrl ? this.resolveFromUrl(careersUrl) : null
    if (fromUrl) {
      return this.upsertSource(name, key, fromUrl)
    }

    const existing = await this.prisma.jobSource.findFirst({ where: { companyKey: key } })
    if (existing) {
      return existing
    }

    const resolved =
      (await this.resolveByProbing(name)) ??
      (careersUrl ? await this.resolveByCareersPage(careersUrl) : null)
    if (!resolved) {
      this.logger.log(`Could not resolve "${name}" to any ATS board`)
      return null
    }

    const source = await this.upsertSource(name, key, resolved)
    this.logger.log(`Resolved "${name}" -> ${source.provider}/${source.externalId}`)
    return source
  }

  // Reuse the board if it already exists under a different company key.
  private async upsertSource(name: string, key: string, resolved: ResolvedHandle): Promise<JobSource> {
    return this.prisma.jobSource.upsert({
      where: {
        provider_externalId: { provider: resolved.provider, externalId: resolved.externalId },
      },
      update: { companyKey: key },
      create: {
        provider: resolved.provider,
        kind: 'ats',
        externalId: resolved.externalId,
        companyName: name,
        companyKey: key,
      },
    })
  }

  private resolveFromUrl(url: string): ResolvedHandle | null {
    for (const provider of this.atsProviders) {
      const handle = provider.handleFromUrl(url)
      if (handle) {
        return { provider: provider.provider, externalId: handle }
      }
    }
    return null
  }

  private async resolveByProbing(name: string): Promise<ResolvedHandle | null> {
    for (const provider of this.atsProviders) {
      for (const handle of provider.candidateHandles(name)) {
        if (await provider.verifyHandle(handle)) {
          return { provider: provider.provider, externalId: handle }
        }
      }
    }
    return null
  }

  // Last resort: hand the careers URL to the generic schema.org reader, which
  // uses the URL itself as its handle. Only reached when no real ATS matched.
  private async resolveByCareersPage(careersUrl: string): Promise<ResolvedHandle | null> {
    const generic = this.atsProviders.find((p) => p.provider === GENERIC_JOBPOSTING_PROVIDER)
    if (!generic || !(await generic.verifyHandle(careersUrl))) {
      return null
    }
    return { provider: generic.provider, externalId: careersUrl }
  }
}
