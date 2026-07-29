/*
 * One-off cleanup: merge junk "URL as company name" rows into their real
 * company, then re-resolve any affected company that is still unresolved.
 * Run:  npx ts-node scripts/cleanup-remote-companies.ts
 */
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/database/prisma.service'
import { RemoteCompaniesService } from '../src/remote-companies/remote-companies.service'
import { JobIngestionService } from '../src/job-boards/job-ingestion.service'
import { writeFileSync } from 'fs'

const BACKUP =
  '/private/tmp/claude-501/-Users-kate-Career-app-July/fd56e95e-9045-4d6e-b1dd-39e179d69537/scratchpad/remote-companies-backup.json'

// A row whose *name* is actually a URL (scheme, www., or a real path).
function isUrlRow(name: string): boolean {
  if (/^https?:\/\//i.test(name) || /^www\./i.test(name)) return true
  if (/\S\/\S/.test(name)) return true
  return false
}
function stripBoard(name: string): string {
  return name.replace(/\s*\(board:.*$/i, '').trim()
}
// The URL to store on the company. Prefer the ATS board URL from a
// "(board: …)" annotation — that lets resolution find the board deterministically.
function urlToStore(name: string): string {
  const m = name.match(/\(board:\s*([^)]+)\)/i)
  let url = m ? m[1].trim() : stripBoard(name)
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
}
const ATS = /(ashbyhq|lever|greenhouse|smartrecruiters|recruitee|personio|join\.com|traffit|pinpointhq|bamboohr|rippling)/i

function host(name: string): string {
  const u = stripBoard(name)
  const m = u.match(/https?:\/\/([^/\s)]+)/i)
  return (m ? m[1] : u.split(/[/\s]/)[0]).replace(/^www\./i, '').toLowerCase()
}
function stem(h: string): string {
  const parts = h.split('.').filter(Boolean)
  if (parts.length <= 1) return h
  const sub = new Set(['careers', 'jobs', 'apply', 'ats', 'www'])
  let labels = parts.slice()
  while (labels.length > 2 && sub.has(labels[0])) labels.shift()
  return labels[labels.length - 2]
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
const firstWord = (s: string) => norm(s.split(/[\s/]/)[0])

// Junk name -> exact company name. Overrides win over the fuzzy matcher (these
// point at ATS hosts, not the company's own domain, so the matcher misses them).
const OVERRIDES: Record<string, string> = {
  'https://ats.rippling.com/prisma-careers/jobs': 'Prisma',
  'https://github.com/rows/hiring': 'Rows',
  'https://safetywing.pinpointhq.com/': 'Safetywing',
  'usefathom.com/careers': 'Fathom Analytics',
  'https://beehiiv.bamboohr.com/careers': 'beehiiv',
  'https://cal.com/jobs': 'cal.com',
}

async function main() {
  // Stub the ingestion service so bootstrapping the module does not kick off a
  // full background job sync (it also skips the heavy immediate per-source pull
  // during re-resolution; the normal hourly cron pulls jobs afterwards). We
  // never call init(), so no lifecycle hooks fire either.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JobIngestionService)
    .useValue({
      onApplicationBootstrap: () => {},
      syncAll: async () => ({}),
      syncOneSource: async () => {},
    })
    .compile()
  const app = moduleRef
  const prisma = app.get(PrismaService)
  const service = app.get(RemoteCompaniesService)

  const all = await prisma.remoteCompany.findMany({ orderBy: { createdAt: 'desc' } })
  writeFileSync(BACKUP, JSON.stringify(all, null, 2))
  console.log(`Backed up ${all.length} rows to ${BACKUP}\n`)

  const junk = all.filter((c) => isUrlRow(c.name))
  const companies = all.filter((c) => !isUrlRow(c.name))

  const rank = (junkName: string, cName: string): number => {
    const st = norm(stem(host(junkName)))
    const cn = norm(cName)
    const fw = firstWord(cName)
    if (cn === st || fw === st) return 3
    if ((cn.startsWith(st) && st.length >= 5) || (st.startsWith(cn) && cn.length >= 5)) return 2
    if ((cn.includes(st) && st.length >= 6) || (st.includes(cn) && cn.length >= 6)) return 1
    return 0
  }

  // Resolve every junk row to a target company; abort if any is unmapped.
  const mapping: { junk: (typeof junk)[number]; target: (typeof companies)[number] }[] = []
  const unmapped: string[] = []
  for (const j of junk) {
    let target = null as (typeof companies)[number] | null
    if (OVERRIDES[j.name]) {
      target = companies.find((c) => c.name === OVERRIDES[j.name]) ?? null
    } else {
      let bestScore = 0
      for (const c of companies) {
        const s = rank(j.name, c.name)
        if (s > bestScore) {
          bestScore = s
          target = c
        }
      }
      if (bestScore < 1) target = null
    }
    if (target) mapping.push({ junk: j, target })
    else unmapped.push(j.name)
  }

  console.log(`Junk rows: ${junk.length} | mapped: ${mapping.length} | unmapped: ${unmapped.length}`)
  if (unmapped.length) {
    console.error('ABORT — unmapped junk rows:\n' + unmapped.map((n) => '  ' + n).join('\n'))
    await app.close()
    process.exit(1)
  }

  const DRY = process.env.DRY_RUN === '1'
  if (DRY) {
    console.log('\n=== DRY RUN — mapping only, no changes ===')
    for (const { junk: j, target } of mapping) {
      console.log(`  "${j.name}"  ->  "${target.name}" [${target.resolutionStatus}]  url=${urlToStore(j.name)}`)
    }
    await app.close()
    return
  }

  // Choose one careers URL per target company (prefer an ATS/board URL).
  const urlByCompany = new Map<string, string>()
  for (const { junk: j, target } of mapping) {
    const candidate = urlToStore(j.name)
    const current = urlByCompany.get(target.id)
    if (!current || (ATS.test(candidate) && !ATS.test(current))) {
      urlByCompany.set(target.id, candidate)
    }
  }

  // Apply: fill empty careersUrl, delete junk rows.
  const affected: string[] = []
  for (const [companyId, url] of urlByCompany) {
    const company = companies.find((c) => c.id === companyId)!
    if (!company.careersUrl) {
      await prisma.remoteCompany.update({ where: { id: companyId }, data: { careersUrl: url } })
      console.log(`  set url  "${company.name}"  ->  ${url}`)
      if (company.resolutionStatus !== 'resolved') affected.push(companyId)
    } else {
      console.log(`  keep url "${company.name}"  (already: ${company.careersUrl})`)
    }
  }
  const deleted = await prisma.remoteCompany.deleteMany({ where: { id: { in: junk.map((j) => j.id) } } })
  console.log(`\nDeleted ${deleted.count} junk rows.`)

  // Re-resolve the companies that just gained a URL and were not resolved.
  console.log(`\nRe-resolving ${affected.length} newly-URL'd unresolved companies…`)
  let nowResolved = 0
  for (const id of affected) {
    try {
      const view = await service.resolveById(id)
      console.log(`  ${view.resolutionStatus === 'resolved' ? '✓ resolved' : '· still not found'}  ${view.name}`)
      if (view.resolutionStatus === 'resolved') nowResolved += 1
    } catch (e) {
      console.log(`  ! error resolving ${id}: ${String(e).slice(0, 100)}`)
    }
  }

  const finalCount = await prisma.remoteCompany.count()
  console.log(`\nDone. ${nowResolved}/${affected.length} newly resolved. List is now ${finalCount} companies.`)
  await app.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
