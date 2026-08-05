// Measure the lifted drag card in the REAL app, in the container that serves it.
//
//   node scripts/drag-card-geometry.mts
//
// The card's DOM was correct while the card on screen was unreadable (docs/notes-editor.md
// 8.0, failure log 15.1). The harness cannot be the last word on that: the harness page
// loads the same stylesheet, but the real app renders the editor inside a pipeline card,
// inside the app's own cascade. This measures what a person sees, where they see it.
//
// It presses the grip, measures the card in the air, and then presses Escape, which
// cancels the drag and dispatches no transaction — so the reorder itself writes nothing.
//
// One note IS written: two checkbox rows are typed into a real note so there is something
// to lift, because no note on the board happens to contain a checkbox. The note's exact
// prior value is read first and written back at the end, in a finally block, and the
// restore is verified byte for byte. The target is the note whose stored value is the
// empty `{"kind": "blocks"}` baseline, so the round trip is a no-op even if it fails.

import { chromium, type Browser } from 'playwright-core'
import { execFileSync } from 'node:child_process'

const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173'
const DB = 'careerapp_july-db-1'
const BASELINE = '{"kind": "blocks"}'

const sh = (command: string, args: string[]) => execFileSync(command, args, { encoding: 'utf8' }).trim()
const psql = (statement: string) =>
  sh('docker', ['exec', DB, 'psql', '-U', 'astir', '-d', 'astir', '-A', '-t', '-c', statement])

let failed = 0
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) failed += 1
}

async function main() {
  console.log('\nThe lifted card, measured in the real app')
  console.log('='.repeat(70))

  const [id, email] = psql("select id||'|'||email from users order by created_at limit 1").split('|')
  const token = sh('docker', [
    'compose', 'exec', '-T', 'backend', 'node', '-e',
    `const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'${id}',email:'${email}'},process.env.JWT_SECRET||'dev-only-jwt-secret',{expiresIn:'1h'}))`,
  ]).split('\n').pop() as string
  check(token.length > 50, `signed in as ${email}`)

  // The target note, and its exact stored bytes, before the browser is even opened.
  const [appId, company, before] = psql(
    `select id||'|'||company||'|'||note::text from applications where note::text = '${BASELINE}' limit 1`,
  ).split('|')
  check(!!appId, `target note: ${company}, stored as ${before}`)
  if (!appId) process.exit(1)

  let browser: Browser | null = null
  let dirty = false
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' })
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
    await context.addCookies([{ name: 'astir_session', value: token, domain: 'localhost', path: '/' }])
    const page = await context.newPage()
    await page.goto(`${ORIGIN}/pipeline`, { waitUntil: 'networkidle' })

    await page.locator('.pipeline-card', { hasText: company }).first().click()
    await page.waitForSelector('.note-editor', { timeout: 10_000 })

    // Two checkbox rows, typed the way a person makes them.
    dirty = true
    await page.locator('.note-editor').click()
    await page.keyboard.type('[] recruiter interview', { delay: 12 })
    await page.keyboard.press('Enter')
    await page.keyboard.type('second box', { delay: 12 })
    await page.waitForTimeout(800)
    check(
      (await page.locator('.note-editor .note-check-row').count()) === 2,
      `typed two checkbox rows into ${company}'s note`,
    )

    // The source row, measured before the press: during the drag it is display:none.
    const source = await page.evaluate(() => {
      const el = document.querySelector('.note-editor .note-check-row') as HTMLElement
      const box = el.querySelector('.note-box') as HTMLElement
      const r = el.getBoundingClientRect()
      return {
        text: (el.textContent ?? '').trim(),
        height: Math.round(r.height),
        width: Math.round(r.width),
        boxWidth: Math.round(box.getBoundingClientRect().width),
        left: r.left,
        top: r.top,
      }
    })

    await page.mouse.move(source.left + 60, source.top + source.height / 2)
    await page.waitForSelector(".note-grip[data-on='true']", { timeout: 5000 })
    const grip = (await page.locator('.note-grip').boundingBox())!
    await page.mouse.move(grip.x + 2, grip.y + grip.height - 3)
    await page.mouse.down()
    await page.mouse.move(grip.x + 2, grip.y + grip.height - 3 + 18, { steps: 4 })
    await page.waitForSelector('.note-drag-card', { timeout: 5000 })

    const card = await page.evaluate(() => {
      const el = document.querySelector('.note-drag-card') as HTMLElement
      const box = el.querySelector('.note-box')?.getBoundingClientRect()
      const line = el.querySelector('.note-line')?.getBoundingClientRect()
      const inner = el.querySelector('.note-row') as HTMLElement | null
      const gripClone = el.querySelector('.note-drag-card-grip')?.getBoundingClientRect()
      return {
        width: Math.round(el.offsetWidth),
        text: (el.textContent ?? '').trim(),
        boxWidth: box ? Math.round(box.width) : 0,
        rowHeight: inner ? Math.round(inner.getBoundingClientRect().height) : 0,
        overlap: box && line ? Math.min(box.bottom, line.bottom) - Math.max(box.top, line.top) : 0,
        lineAfterBox: box && line ? line.left >= box.right : false,
        gripWidth: gripClone ? Math.round(gripClone.width) : 0,
        gap: !!document.querySelector('.note-drag-gap'),
        surface: el.classList.contains('note-surface'),
        html: el.outerHTML.slice(0, 260),
      }
    })

    // Escape, not mouseup: a cancelled drag dispatches nothing.
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.waitForTimeout(200)

    console.log(
      `\n  source row: ${JSON.stringify(source.text.slice(0, 40))} ${source.width}x${source.height}, box ${source.boxWidth}`,
    )
    console.log(`  card:       ${card.html}\n`)
    check(card.surface, 'the card carries the row styling context (.note-surface)')
    check(Math.abs(card.width - source.width) <= 1, `full row width: card ${card.width}, row ${source.width}`)
    check(
      card.boxWidth > 0 && card.boxWidth === source.boxWidth,
      `the checkbox renders at the row's width: card ${card.boxWidth}, row ${source.boxWidth}`,
    )
    check(
      card.overlap > 0 && card.lineAfterBox,
      `the text shares a line with the checkbox: overlap ${card.overlap.toFixed(1)}px, line after the box: ${card.lineAfterBox}`,
    )
    check(
      card.rowHeight === source.height,
      `the row renders at its own height: card ${card.rowHeight}, row ${source.height}`,
    )
    check(card.gripWidth > 0, `the grip clone renders at a real width, not a bare mark: ${card.gripWidth}px`)
    check(card.gap, 'a gap opens at the target')
    check((await page.locator('.note-drag-card').count()) === 0, 'Escape put the card away')
  } finally {
    await browser?.close()
    if (dirty) {
      psql(`update applications set note = '${before}'::jsonb where id = '${appId}'`)
      const after = psql(`select note::text from applications where id = '${appId}'`)
      check(after === before, `the note was restored byte for byte: ${after}`)
    }
  }

  console.log('='.repeat(70))
  console.log(failed === 0 ? 'the lifted card renders as a row in the real app' : `${failed} check(s) failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
