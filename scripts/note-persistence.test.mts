// Integration: a real note round-trips through the real store, both adapters, no
// fakes. See docs/notes-editor.md 4.5 and the failure log.
//
//   node scripts/harness/build.mjs && node scripts/note-persistence.test.mts
//
// This is the check that was missing. Every editor suite bundles the component
// and fakes the save (window.SAVED, an in-memory STORE), so the path that
// actually persists — adapter -> API -> Prisma -> Postgres -> read, and the
// astir.v1 localStorage read/write — had never run once. A v2 note was silently
// downgraded to { kind: 'blocks' } on write, because the update DTO modelled only
// the v1 shape and ValidationPipe({ whitelist: true }) stripped `v` and `doc`.
//
// Both halves do the same thing: build a v2 document, persist it through the real
// code, reload from the real store, and assert the document is identical.

import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser } from 'playwright-core'
import { readNote } from '../frontend/src/lib/noteMigration.ts'
import { canonicalDoc } from '../frontend/src/components/applications/noteSchema.ts'

// The pipeline adapter (frontend/src/lib/applications.ts) cannot be imported here:
// it value-imports sibling modules that Node's TS loader will not resolve
// extensionless. So the calls below issue the identical HTTP the adapter does —
// same method, path, JSON body, and Content-Type — which exercises the exact
// server path the bug lived in (the DTO, the service, Prisma, the column, the
// read). readNote and canonicalDoc are the real ones.

const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173'
const DB = 'careerapp_july-db-1'
const STORE_HARNESS = pathToFileURL(resolve('scripts/.harness/store.html')).href

let failed = 0
const ok = (what: string) => console.log(`  ok    ${what}`)

// Compare structure, not prototypes: canonicalDoc builds attrs with a null
// prototype, while a value that has been through JSON (the API response, or
// localStorage) is a plain object. deepEqual is prototype-sensitive; the round
// trip is about the content.
const asPlain = (value: unknown) => JSON.parse(JSON.stringify(value))

function sh(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

// A non-trivial document, so the round trip covers marks, a checked box, and a
// section body — not just a single run of text.
const noteDoc = canonicalDoc({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'persist me', marks: [{ type: 'bold' }] }] },
    { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'done' }] },
    {
      type: 'section',
      attrs: { collapsed: false },
      content: [
        { type: 'sectionTitle', content: [{ type: 'text', text: 'Notes' }] },
        { type: 'sectionBody', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }] },
      ],
    },
  ],
})
const storedNote = { v: 2 as const, kind: 'blocks', doc: noteDoc }

// --- Part A: the pipeline path, through the real API to real Postgres ---

type ApiRow = { id: string; note: unknown }

async function api(token: string, method: string, path: string, body?: unknown): Promise<ApiRow | ApiRow[] | null> {
  const response = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `astir_session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path} -> HTTP ${response.status}`)
  return response.status === 204 ? null : ((await response.json()) as ApiRow | ApiRow[])
}

async function pipelineRoundTrip() {
  console.log('\nPipeline: POST/PATCH/GET -> API -> Prisma -> Postgres -> read')
  const row = sh('docker', ['exec', DB, 'psql', '-U', 'astir', '-d', 'astir', '-A', '-t', '-c',
    "select id||'|'||email from users order by created_at limit 1"])
  const [id, email] = row.split('|')
  const token = sh('docker', ['compose', 'exec', '-T', 'backend', 'node', '-e',
    `const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'${id}',email:'${email}'},process.env.JWT_SECRET||'dev-only-jwt-secret',{expiresIn:'1h'}))`])
    .split('\n').pop() as string

  let appId = ''
  try {
    // A throwaway application, so no real note is touched.
    const created = (await api(token, 'POST', '/api/applications', {
      company: 'ZZ note-persistence probe',
      role: 'round trip',
      appliedDate: '2026-08-04',
    })) as ApiRow
    appId = created.id

    // Persist the v2 note, exactly as updateApplication does.
    await api(token, 'PATCH', `/api/applications/${appId}`, { note: storedNote })

    // A reload reads the note with the same GET the app uses on mount.
    const all = (await api(token, 'GET', '/api/applications')) as ApiRow[]
    const back = all.find((application) => application.id === appId)
    assert.ok(back, 'the application came back from the reload')

    // The specific regression: the envelope must arrive whole, not stripped to
    // { kind: 'blocks' } with v and doc gone.
    const raw = back!.note as { v?: number; doc?: unknown } | null
    assert.ok(raw && raw.v === 2 && raw.doc, `the v2 envelope survived the write, not stripped: ${JSON.stringify(raw)}`)

    const parsed = readNote(back!.note)
    assert.equal(parsed.v, 2, 'it read back as v2')
    assert.deepEqual(asPlain(parsed.doc), asPlain(noteDoc), 'the document is identical after persist and reload')
    ok('a v2 note round-trips through the API and Postgres, identical')
  } finally {
    if (appId) await api(token, 'DELETE', `/api/applications/${appId}`).catch(() => {})
  }
}

// --- Part B: the astir.v1 adapter, through real localStorage ---

async function astirV1RoundTrip(browser: Browser) {
  console.log('\nastir.v1: setTaskNote -> writeWeek -> localStorage -> reload -> read')
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.log(`  page error: ${error.message}`))
  await page.goto(STORE_HARNESS)
  await page.waitForFunction(() => !!window.GOALS)

  // Write a v2 note onto a real task, through the real functions, into real
  // window.localStorage under 'astir.v1'.
  const taskId = await page.evaluate((doc) => {
    const G = window.GOALS
    const key = G.weekKeyFor()
    let week = G.readWeek(key)
    week = G.addTask(week, 'prep', 'round trip task')
    const task = week.tasks.prep[week.tasks.prep.length - 1]
    week = G.setTaskNote(week, 'prep', task.id, { v: 2, kind: 'blocks', doc } as never)
    G.writeWeek(key, week)
    return task.id
  }, noteDoc)

  // A real reload. localStorage persists across it; the faked store never did.
  await page.reload()
  await page.waitForFunction(() => !!window.GOALS)

  const parsed = await page.evaluate((id) => {
    const G = window.GOALS
    const week = G.readWeek(G.weekKeyFor())
    const task = week.tasks.prep.find((candidate) => candidate.id === id)
    return task ? window.readNote(task.note) : null
  }, taskId)

  assert.ok(parsed, 'the task came back from localStorage after the reload')
  assert.equal(parsed!.v, 2, 'it read back as v2')
  assert.deepEqual(asPlain(parsed!.doc), asPlain(noteDoc), 'the document is identical after persist and reload')
  ok('a v2 task note round-trips through real localStorage, identical')
  await page.close()
}

async function main() {
  console.log('Note persistence, end to end, no fakes')
  console.log('='.repeat(70))

  try {
    await pipelineRoundTrip()
  } catch (error) {
    failed += 1
    console.log(`  FAIL  pipeline: ${error instanceof Error ? error.message : String(error)}`)
  }

  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' })
    await astirV1RoundTrip(browser)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  astir.v1: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await browser?.close()
  }

  console.log('='.repeat(70))
  console.log(failed === 0 ? 'both adapters persist a v2 note and read it back identical' : `${failed} adapter(s) failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
