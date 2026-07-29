/*
 * Copy every company on a user's Watchlist onto the global, admin-curated
 * Remote Job Board list. Companies already on the remote list (matched by the
 * global nameKey) are skipped, so this is safe to re-run. Reuses
 * RemoteCompaniesService.add so each new company resolves to an ATS JobSource
 * exactly like a manual admin add.
 *
 *   DRY_RUN=1 npx ts-node scripts/watchlist-to-remote.ts   # preview only
 *            npx ts-node scripts/watchlist-to-remote.ts   # actually add
 *
 * Override the source user with WATCHLIST_EMAIL=... (defaults to the admin).
 */
import { ConflictException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/database/prisma.service'
import { RemoteCompaniesService } from '../src/remote-companies/remote-companies.service'
import { JobIngestionService } from '../src/job-boards/job-ingestion.service'
import { companyKey } from '../src/job-boards/normalized-job'

const EMAIL = process.env.WATCHLIST_EMAIL || 'bartel.katarzyna@gmail.com'
const DRY_RUN = process.env.DRY_RUN === '1'

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JobIngestionService)
    .useValue({ onApplicationBootstrap: () => {}, syncAll: async () => ({}), syncOneSource: async () => {} })
    .compile()
  const prisma = moduleRef.get(PrismaService)
  const service = moduleRef.get(RemoteCompaniesService)

  const user = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (!user) {
    console.error(`No user with email "${EMAIL}"`)
    await moduleRef.close()
    process.exit(1)
  }

  const watchlist = await prisma.watchlistCompany.findMany({
    where: { userId: user.id },
    orderBy: { name: 'asc' },
  })
  const existing = new Set(
    (await prisma.remoteCompany.findMany({ select: { nameKey: true } })).map((c) => c.nameKey),
  )

  console.log(`Watchlist for ${EMAIL}: ${watchlist.length} companies`)
  console.log(`Remote list currently: ${existing.size} companies`)
  console.log(DRY_RUN ? '--- DRY RUN (no changes) ---' : '--- adding missing companies ---')

  let added = 0
  let alreadyThere = 0
  let unresolved = 0
  let failed = 0

  for (const c of watchlist) {
    const key = companyKey(c.name)
    if (key && existing.has(key)) {
      alreadyThere += 1
      console.log(`= already on remote list: ${c.name}`)
      continue
    }
    if (DRY_RUN) {
      added += 1
      console.log(`+ would add: ${c.name}${c.careersUrl ? `  (${c.careersUrl})` : ''}`)
      continue
    }
    try {
      const view = await service.add({ name: c.name, careersUrl: c.careersUrl ?? undefined }, EMAIL)
      added += 1
      if (view.resolutionStatus !== 'resolved') unresolved += 1
      console.log(
        `${view.resolutionStatus === 'resolved' ? '✓ added (resolved) ' : '· added (not found)'}  ${c.name}`,
      )
      if (key) existing.add(key)
    } catch (error) {
      if (error instanceof ConflictException) {
        alreadyThere += 1
        console.log(`= already on remote list: ${c.name}`)
      } else {
        failed += 1
        console.log(`✗ failed: ${c.name} — ${String(error)}`)
      }
    }
  }

  console.log('\n--- summary ---')
  console.log(`added:        ${added}${DRY_RUN ? ' (would add)' : ''}`)
  console.log(`already present: ${alreadyThere}`)
  if (!DRY_RUN) {
    console.log(`  of added, not resolved to an ATS: ${unresolved}`)
    console.log(`failed:       ${failed}`)
  }

  await moduleRef.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
