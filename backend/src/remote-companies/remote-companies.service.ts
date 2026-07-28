import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { RemoteCompany } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'
import { CompanyResolutionService } from '../job-boards/company-resolution.service'
import { JobIngestionService } from '../job-boards/job-ingestion.service'
import { companyKey } from '../job-boards/normalized-job'

export type RemoteCompanyView = {
  id: string
  name: string
  careersUrl: string | null
  companyWebsite: string | null
  note: string | null
  reviewStatus: string
  // resolved: found on an ATS and being polled; pending: still resolving;
  // unresolved: not on any ATS (its jobs won't surface until it resolves).
  resolutionStatus: string
  addedByEmail: string | null
  createdAt: Date
}

// Outcome of one line in a bulk import, so the admin sees exactly what
// happened to each company they pasted.
export type BulkResultRow = {
  name: string
  status: 'resolved' | 'unresolved' | 'duplicate' | 'invalid'
}

type CreateInput = { name: string; careersUrl?: string; companyWebsite?: string; note?: string }

// A bulk-import line that is a bare URL (rather than a company name) so it can
// be merged onto the company above it. We require a scheme, a path, or a "www."
// prefix so plain domain-style company names (e.g. "cal.com", "Ghost.org")
// stay company names.
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value) || value.includes('/')
}

// Parse a paste-many blob into logical companies. One company per line,
// "Name" or "Name, careersUrl"; a line that is only a URL is folded onto the
// company above it as its careers URL. Lines that are neither a valid company
// name nor an attachable URL are returned as `invalid` so the caller can report
// them. Kept pure (no DB/network) so it is unit-testable on its own.
export function parseBulkCompanies(text: string): {
  entries: CreateInput[]
  invalid: string[]
} {
  const entries: CreateInput[] = []
  const invalid: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const [rawName, ...rest] = trimmed.split(',')
    const name = rawName.trim()
    const careersUrl = rest.join(',').trim() || undefined
    // A line that is only a URL belongs to the company on the line above.
    if (!careersUrl && looksLikeUrl(name)) {
      const previous = entries[entries.length - 1]
      if (previous && !previous.careersUrl) {
        previous.careersUrl = name
      } else {
        invalid.push(trimmed)
      }
      continue
    }
    if (!companyKey(name)) {
      invalid.push(trimmed)
      continue
    }
    entries.push({ name, careersUrl })
  }
  return { entries, invalid }
}

// Owns the global, admin-curated Remote Job Board company list. Resolution and
// polling reuse the shared job-board machinery: a remote company resolves to a
// JobSource exactly like a watchlist company, and the ingestion cron polls it
// because it is now referenced by a RemoteCompany (see POLLABLE_SOURCES).
@Injectable()
export class RemoteCompaniesService {
  private readonly logger = new Logger(RemoteCompaniesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolution: CompanyResolutionService,
    private readonly ingestion: JobIngestionService,
  ) {}

  async list(): Promise<RemoteCompanyView[]> {
    const companies = await this.prisma.remoteCompany.findMany({ orderBy: { createdAt: 'desc' } })
    return companies.map((company) => this.toView(company))
  }

  async add(input: CreateInput, addedByEmail: string): Promise<RemoteCompanyView> {
    const name = input.name.trim()
    const nameKey = companyKey(name)
    if (!nameKey) {
      throw new ConflictException('Company name is empty')
    }
    const existing = await this.prisma.remoteCompany.findUnique({ where: { nameKey } })
    if (existing) {
      throw new ConflictException('This company is already on the remote job board list')
    }
    const company = await this.prisma.remoteCompany.create({
      data: {
        name,
        nameKey,
        careersUrl: input.careersUrl?.trim() || null,
        companyWebsite: input.companyWebsite?.trim() || null,
        note: input.note?.trim() || null,
        resolutionStatus: 'pending',
        addedByEmail,
      },
    })
    await this.resolveAndSync(company)
    const saved = await this.prisma.remoteCompany.findUnique({ where: { id: company.id } })
    return this.toView(saved ?? company)
  }

  // Edit an existing company's name and/or careers URL. Changing the name
  // re-checks the uniqueness key; an empty careers URL clears the link. Either
  // change re-resolves so a corrected URL takes effect immediately (the common
  // case: pasting the real ATS URL for a company that couldn't be name-probed).
  async update(
    id: string,
    input: {
      name?: string
      careersUrl?: string
      companyWebsite?: string
      note?: string
      reviewStatus?: string
    },
  ): Promise<RemoteCompanyView> {
    const company = await this.prisma.remoteCompany.findUnique({ where: { id } })
    if (!company) {
      throw new NotFoundException('Remote company not found')
    }
    const data: {
      name?: string
      nameKey?: string
      careersUrl?: string | null
      companyWebsite?: string | null
      note?: string | null
      reviewStatus?: string
    } = {}
    let shouldResolve = false
    if (input.name !== undefined) {
      const name = input.name.trim()
      const nameKey = companyKey(name)
      if (!nameKey) {
        throw new ConflictException('Company name is empty')
      }
      if (nameKey !== company.nameKey) {
        const clash = await this.prisma.remoteCompany.findUnique({ where: { nameKey } })
        if (clash) {
          throw new ConflictException('This company is already on the remote job board list')
        }
      }
      data.name = name
      data.nameKey = nameKey
      shouldResolve = nameKey !== company.nameKey
    }
    if (input.careersUrl !== undefined) {
      const careersUrl = input.careersUrl.trim() || null
      data.careersUrl = careersUrl
      shouldResolve = shouldResolve || careersUrl !== company.careersUrl
    }
    if (input.companyWebsite !== undefined) {
      data.companyWebsite = input.companyWebsite.trim() || null
    }
    if (input.note !== undefined) {
      data.note = input.note.trim() || null
    }
    if (input.reviewStatus !== undefined) {
      data.reviewStatus = input.reviewStatus
    }
    const updated = await this.prisma.remoteCompany.update({ where: { id }, data })
    if (shouldResolve) {
      await this.resolveAndSync(updated)
    }
    const saved = await this.prisma.remoteCompany.findUnique({ where: { id } })
    return this.toView(saved ?? updated)
  }

  // Paste-many: one company per line, optional "Name, careersUrl". A URL pasted
  // on its own line is treated as the careers URL for the company above it, so
  // a two-line "Name\nhttps://…" paste merges into one company instead of
  // creating a junk company whose name is a URL. Companies are resolved
  // sequentially (resolution probes external ATS APIs, so we avoid a burst) and
  // each gets its own result row. A single failure never aborts the batch.
  async bulkAdd(text: string, addedByEmail: string): Promise<BulkResultRow[]> {
    const { entries, invalid } = parseBulkCompanies(text)
    const rows: BulkResultRow[] = invalid.map((name) => ({ name, status: 'invalid' }))
    for (const entry of entries) {
      try {
        const company = await this.add(entry, addedByEmail)
        rows.push({
          name: company.name,
          status: company.resolutionStatus === 'resolved' ? 'resolved' : 'unresolved',
        })
      } catch (error) {
        if (error instanceof ConflictException) {
          rows.push({ name: entry.name, status: 'duplicate' })
        } else {
          this.logger.warn(`Bulk add failed for "${entry.name}": ${String(error)}`)
          rows.push({ name: entry.name, status: 'unresolved' })
        }
      }
    }
    return rows
  }

  // Re-attempt resolution for a single company (e.g. after a new ATS provider
  // ships, an old "unresolved" company can now be found). Safe to call on an
  // already-resolved company — resolution reuses the existing source.
  async resolveById(id: string): Promise<RemoteCompanyView> {
    const company = await this.prisma.remoteCompany.findUnique({ where: { id } })
    if (!company) {
      throw new NotFoundException('Remote company not found')
    }
    await this.resolveAndSync(company)
    const saved = await this.prisma.remoteCompany.findUnique({ where: { id } })
    return this.toView(saved ?? company)
  }

  // Re-attempt every company not currently resolved (the "Not found" rows in
  // the admin panel). Sequential to avoid bursting external ATS APIs, matching
  // bulkAdd. Returns how many now resolve so the admin gets a summary.
  async refreshUnresolved(): Promise<{ attempted: number; resolved: number; unresolved: number }> {
    const companies = await this.prisma.remoteCompany.findMany({
      where: { resolutionStatus: { not: 'resolved' } },
      orderBy: { createdAt: 'asc' },
    })
    let resolved = 0
    for (const company of companies) {
      await this.resolveAndSync(company)
      const saved = await this.prisma.remoteCompany.findUnique({
        where: { id: company.id },
        select: { resolutionStatus: true },
      })
      if (saved?.resolutionStatus === 'resolved') {
        resolved += 1
      }
    }
    return { attempted: companies.length, resolved, unresolved: companies.length - resolved }
  }

  async remove(id: string): Promise<void> {
    const company = await this.prisma.remoteCompany.findUnique({ where: { id } })
    if (!company) {
      throw new NotFoundException('Remote company not found')
    }
    await this.prisma.remoteCompany.delete({ where: { id } })
    // The JobSource is intentionally left in place: it simply stops being
    // polled once nothing references it (mirrors watchlist removal).
  }

  // Resolve to an ATS board and pull it immediately so its jobs show on the
  // Remote Job Board without waiting for the hourly cron. Failures downgrade
  // the company to "unresolved" rather than failing the request.
  private async resolveAndSync(company: RemoteCompany): Promise<void> {
    let source
    try {
      source = await this.resolution.resolveToSource(company.name, company.careersUrl)
    } catch (error) {
      this.logger.warn(`Resolve failed for "${company.name}": ${String(error)}`)
      await this.prisma.remoteCompany.update({
        where: { id: company.id },
        data: { jobSourceId: null, resolutionStatus: 'unresolved' },
      })
      return
    }
    if (!source) {
      await this.prisma.remoteCompany.update({
        where: { id: company.id },
        data: { jobSourceId: null, resolutionStatus: 'unresolved' },
      })
      return
    }
    await this.prisma.remoteCompany.update({
      where: { id: company.id },
      data: { jobSourceId: source.id, resolutionStatus: 'resolved' },
    })
    // The company is resolved once the source is linked. A failure pulling its
    // jobs now (rate limit, a transient upstream error) must NOT downgrade it
    // back to "unresolved" — the hourly cron will retry the pull.
    try {
      await this.ingestion.syncOneSource(source)
    } catch (error) {
      this.logger.warn(
        `Initial sync failed for "${company.name}" (will retry on next poll): ${String(error)}`,
      )
    }
  }

  private toView(company: RemoteCompany): RemoteCompanyView {
    return {
      id: company.id,
      name: company.name,
      careersUrl: company.careersUrl,
      companyWebsite: company.companyWebsite,
      note: company.note,
      reviewStatus: company.reviewStatus,
      resolutionStatus: company.resolutionStatus,
      addedByEmail: company.addedByEmail,
      createdAt: company.createdAt,
    }
  }
}
