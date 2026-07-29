/*
 * One-off rescue for Rippling boards when Docker cannot reach Rippling but the
 * host can. Uses the same provider normalization and database upsert path as
 * ingestion, then rematches users.
 *
 *   DATABASE_URL=postgresql://astir:astir@localhost:5432/astir?schema=public \
 *   JOB_INGESTION_ENABLED=false npx ts-node backend/scripts/seed-rippling.ts
 */
import { Test } from '@nestjs/testing'
import { readFile } from 'node:fs/promises'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/database/prisma.service'
import { JobIngestionService } from '../src/job-boards/job-ingestion.service'
import { JobMatchingService } from '../src/job-boards/job-matching.service'
import {
  RipplingProvider,
  ripplingJobsFromHtml,
} from '../src/job-boards/providers/rippling.provider'

const BOARDS = [{ companyName: 'Chess.com', companyKey: 'chess', externalId: 'chess' }]
const HTML_PATH = process.env.RIPPLING_HTML_PATH

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const prisma = moduleRef.get(PrismaService)
  const ingestion = moduleRef.get(JobIngestionService) as unknown as {
    upsertListing: (job: unknown, jobSourceId: string, now: Date) => Promise<number>
  }
  const matching = moduleRef.get(JobMatchingService)
  const provider = moduleRef.get(RipplingProvider)

  for (const board of BOARDS) {
    const source = await prisma.jobSource.findFirst({
      where: { provider: provider.provider, externalId: board.externalId },
    })
    if (!source) {
      console.log(`? source not found: ${board.companyName}`)
      continue
    }
    const jobs = HTML_PATH
      ? ripplingJobsFromHtml(await readFile(HTML_PATH, 'utf8'))
          .map((job) =>
            provider.normalize(job, {
              externalId: board.externalId,
              companyName: board.companyName,
            }),
          )
          .filter((job): job is NonNullable<typeof job> => job !== null)
      : await provider.fetchListings({
          externalId: board.externalId,
          companyName: board.companyName,
        })
    const now = new Date()
    let created = 0
    for (const job of jobs) {
      created += await ingestion.upsertListing(job, source.id, now)
    }
    await prisma.jobSource.update({
      where: { id: source.id },
      data: { lastSyncedAt: now, lastSyncError: null },
    })
    console.log(`✓ ${board.companyName}: ${jobs.length} listings (${created} new)`)
  }
  const matches = await matching.rematchAllUsers()
  console.log(`✓ rematched users (${matches} new matches)`)

  await moduleRef.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
