/*
 * Set the correct ATS board URL on remote companies and re-resolve them.
 * Edit FIXES below, then:  npx ts-node scripts/fix-remote-urls.ts
 */
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/database/prisma.service'
import { RemoteCompaniesService } from '../src/remote-companies/remote-companies.service'
import { JobIngestionService } from '../src/job-boards/job-ingestion.service'

// Exact company name -> the real ATS board URL our providers understand.
const FIXES: Record<string, string> = {
  beehiiv: 'https://beehiiv.bamboohr.com/careers',
  Safetywing: 'https://safetywing.pinpointhq.com',
}

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JobIngestionService)
    .useValue({ onApplicationBootstrap: () => {}, syncAll: async () => ({}), syncOneSource: async () => {} })
    .compile()
  const prisma = moduleRef.get(PrismaService)
  const service = moduleRef.get(RemoteCompaniesService)

  for (const [name, url] of Object.entries(FIXES)) {
    const company = await prisma.remoteCompany.findFirst({ where: { name } })
    if (!company) {
      console.log(`? not found: "${name}"`)
      continue
    }
    await prisma.remoteCompany.update({ where: { id: company.id }, data: { careersUrl: url } })
    const view = await service.resolveById(company.id)
    console.log(`${view.resolutionStatus === 'resolved' ? '✓ resolved ' : '· still not found'}  ${name}  -> ${url}`)
  }

  await moduleRef.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
