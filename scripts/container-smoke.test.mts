// Does the app actually run? Checked in the container that runs it.
//
//   node scripts/container-smoke.test.mts
//
// This exists because of a specific failure: every suite passed, `next build`
// passed, and the app did not start. Everything had been verified on the host, and
// the host's node_modules is not the app's node_modules. See docs/notes-editor.md,
// the architecture section.
//
// It runs first in the suite. A green editor test against a bundled component says
// nothing about whether the container can resolve that component's dependencies.

import { chromium, type Browser } from 'playwright-core'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173'
const DB = 'careerapp_july-db-1'

/** Only these may appear in the console. Everything else is a failure. */
const ALLOWED_NOISE = [
  // The Agentation annotation tool, a dev-only helper on port 4747. Not part of the
  // app, and not running unless someone started it.
  'localhost:4747',
]

let failed = 0
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) failed += 1
}

function sh(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

async function main() {
  console.log('\nContainer smoke check')
  console.log('='.repeat(70))

  // 1. The stack is up.
  let running = ''
  try {
    running = sh('docker', ['compose', 'ps', '--services', '--filter', 'status=running'])
  } catch {
    console.log('  FAIL  docker compose is not available')
    process.exit(1)
  }
  for (const service of ['db', 'backend', 'frontend']) {
    check(running.split('\n').includes(service), `${service} is running`)
  }
  if (failed > 0) {
    console.log('\n  Bring the stack up first: docker compose up -d')
    process.exit(1)
  }

  // 2. The container can see the editor's dependencies. This is the exact regression
  // that motivated this file: a named volume over /app/node_modules keeps whatever it
  // was created with, so `docker compose build` changes the image and not the
  // container.
  const inContainer = sh('docker', [
    'compose',
    'exec',
    '-T',
    'frontend',
    'sh',
    '-c',
    'ls /app/node_modules/@tiptap 2>/dev/null | wc -l',
  ])
  check(Number(inContainer) > 0, `@tiptap resolves inside the container (${inContainer} packages)`)
  if (Number(inContainer) === 0) {
    console.log('\n  The node_modules volume is stale. Either:')
    console.log('    docker compose exec frontend npm install')
    console.log('  or recreate that one volume, by name:')
    console.log('    docker compose stop frontend')
    console.log('    docker volume rm careerapp_july_root_node_modules')
    console.log('    docker compose up -d frontend')
    console.log('  Never `docker compose down -v`: that would take the database with it.')
    process.exit(1)
  }

  // 3. A session, so the assertions are about the real signed-in app rather than an
  // empty shell. A signed-out page returns 200 with nothing in it, which is exactly
  // the kind of pass that hides a broken app.
  let token = ''
  try {
    const row = sh('docker', [
      'exec',
      DB,
      'psql',
      '-U',
      'astir',
      '-d',
      'astir',
      '-A',
      '-t',
      '-c',
      'select id||\'|\'||email from users order by created_at limit 1',
    ])
    const [id, email] = row.split('|')
    check(!!id, `a user exists to sign in as (${email})`)
    token = sh('docker', [
      'compose',
      'exec',
      '-T',
      'backend',
      'node',
      '-e',
      `const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'${id}',email:'${email}'},process.env.JWT_SECRET||'dev-only-jwt-secret',{expiresIn:'1h'}))`,
    ])
      .split('\n')
      .pop() as string
    check(token.length > 50, 'a session token was minted in the backend container')
  } catch (error) {
    check(false, `could not mint a session: ${String(error).slice(0, 120)}`)
    process.exit(1)
  }

  // 4. The pages render, and the notes editor on them is the new one.
  let browser: Browser | null = null
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' })
    const context = await browser.newContext()
    await context.addCookies([{ name: 'astir_session', value: token, domain: 'localhost', path: '/' }])
    const page = await context.newPage()

    const noise: string[] = []
    const allowed = (url: string) => ALLOWED_NOISE.some((entry) => url.includes(entry))
    const record = (text: string) => noise.push(text.slice(0, 200))

    // Resource failures are judged by URL, not by console text. A console message for
    // a failed load says only "Failed to load resource": no URL, so a text allowlist
    // cannot tell an ignorable dev tool from a broken asset, and would have to ignore
    // both. These two handlers see the URL, so nothing is waved through blind.
    page.on('requestfailed', (request) => {
      if (!allowed(request.url())) record(`request failed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
    })
    page.on('response', (response) => {
      if (response.status() >= 400 && !allowed(response.url())) {
        record(`HTTP ${response.status()} ${response.url()}`)
      }
    })
    page.on('console', (message) => {
      // The generic resource-failure line is covered by the two handlers above, with
      // the URL. Everything else the app logs as an error is a failure.
      const text = message.text()
      if (message.type() !== 'error') return
      if (text.startsWith('Failed to load resource')) return
      record(`console: ${text}`)
    })
    page.on('pageerror', (error) => record(`pageerror: ${error.message}`))

    const home = await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
    check(home?.status() === 200, `/ returned ${home?.status()}`)
    check((await page.locator('.rail').count()) === 1, '/ rendered the rail, so it is the app and not an error page')
    check((await page.locator('.goal-tile').count()) > 0, `/ rendered the goals card (${await page.locator('.goal-tile').count()} tiles)`)

    const pipeline = await page.goto(`${ORIGIN}/pipeline`, { waitUntil: 'networkidle' })
    check(pipeline?.status() === 200, `/pipeline returned ${pipeline?.status()}`)
    check((await page.locator('.rail').count()) === 1, '/pipeline rendered the rail')
    const cards = await page.locator('.pipeline-card').count()
    check(cards > 0, `/pipeline rendered ${cards} card(s)`)

    if (cards > 0) {
      await page.locator('.pipeline-card').first().click()
      await page.waitForSelector('.note-editor', { timeout: 10_000 })
      check((await page.locator('.note-editor').count()) === 1, 'expanding a card mounts the new editor')
      check((await page.locator('.note-field').count()) === 0, 'and not the old one')
      const text = await page.locator('.note-editor').first().innerText()
      check(text.length > 0, `the note rendered content (${JSON.stringify(text.slice(0, 40))})`)
    }

    check(noise.length === 0, `no console errors${noise.length ? `: ${[...new Set(noise)].join(' | ')}` : ''}`)
  } finally {
    await browser?.close()
  }

  console.log('='.repeat(70))
  console.log(failed === 0 ? 'the app runs in the container' : `${failed} check(s) failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
