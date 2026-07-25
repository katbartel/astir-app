/*
 * Set a better careers/ATS URL on named remote companies and re-resolve them
 * through the normal admin path (RemoteCompaniesService.update), then report
 * how many listings each resolved source ingested. Uses the real ingestion
 * service, so run with JOB_INGESTION_ENABLED=false to skip the boot-time sweep:
 *
 *   JOB_INGESTION_ENABLED=false npx ts-node scripts/resolve-remote.ts
 */
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/database/prisma.service'
import { RemoteCompaniesService } from '../src/remote-companies/remote-companies.service'

// Exact company name -> the real ATS board URL our providers understand.
const FIXES: Record<string, string> = {
  Bluesky: 'https://bsky.social/about/join',
}

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const prisma = moduleRef.get(PrismaService)
  const service = moduleRef.get(RemoteCompaniesService)

  for (const [name, url] of Object.entries(FIXES)) {
    const company = await prisma.remoteCompany.findFirst({ where: { name } })
    if (!company) {
      console.log(`? not found: "${name}"`)
      continue
    }
    const view = await service.update(company.id, { careersUrl: url })
    const fresh = await prisma.remoteCompany.findUnique({ where: { id: company.id } })
    const listings = fresh?.jobSourceId
      ? await prisma.jobListingSource.count({ where: { jobSourceId: fresh.jobSourceId } })
      : 0
    const source = fresh?.jobSourceId
      ? await prisma.jobSource.findUnique({ where: { id: fresh.jobSourceId } })
      : null
    console.log(
      `${view.resolutionStatus === 'resolved' ? '✓' : '·'} ${name} -> ${url}` +
        `  [${view.resolutionStatus}]` +
        (source ? `  ${source.provider}/${source.externalId}` : '') +
        `  listings=${listings}`,
    )
  }

  await moduleRef.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
