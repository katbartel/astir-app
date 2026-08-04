// The regression script from docs/notes-editor.md section 13, automated against
// the harness in section 14. Real Chrome, the real component, the real stylesheets.
//
//   node scripts/harness/build.mjs && node scripts/note-regression.test.mts
//   HEADED=1 ...                     watch it run
//
// A step that cannot be reached yet is reported as DEFERRED with the reason. It is
// never skipped silently, and the list is carried forward.

import { chromium, type Browser, type Page } from 'playwright-core'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { migrateNote } from '../frontend/src/lib/noteMigration.ts'
import { canonicalDoc } from '../frontend/src/components/applications/noteSchema.ts'

const HARNESS = pathToFileURL(resolve('scripts/.harness/harness.html')).href
const CARD = pathToFileURL(resolve('scripts/.harness/card.html')).href
const GOAL = pathToFileURL(resolve('scripts/.harness/goal.html')).href
const SEED_KEY = 'astir.harness.seed'

type Row = {
  kind: string
  text: string
  top: number
  height: number
  visible: boolean
  checked: boolean | null
  collapsed: boolean | null
  indent: number
  left: number
  width: number
}

// --- reporting: one line per step of the script ---

type Result = { step: string; state: 'PASS' | 'FAIL' | 'DEFERRED'; note: string }
const results: Result[] = []
const checks: string[] = []

const check = (ok: boolean, what: string) => {
  checks.push(`${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) throw new Error(what)
}
const deferred = (step: string, note: string) => results.push({ step, state: 'DEFERRED', note })

async function step(name: string, body: () => Promise<string>) {
  checks.length = 0
  try {
    const note = await body()
    results.push({ step: name, state: 'PASS', note })
    console.log(`PASS      ${name}`)
    for (const line of checks) console.log(`            ${line}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ step: name, state: 'FAIL', note: message })
    console.log(`FAIL      ${name}`)
    for (const line of checks) console.log(`            ${line}`)
    console.log(`            ${message}`)
  }
}

// --- driving ---

let page: Page
let browser: Browser

const v2 = (doc: unknown) => ({ v: 2, kind: 'blocks', doc })
const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Mount from a note, through a real page load. */
async function seed(note: unknown) {
  await page.evaluate(
    ([key, value]) => window.sessionStorage.setItem(key as string, JSON.stringify(value)),
    [SEED_KEY, note] as const,
  )
  await page.reload()
  await page.waitForFunction(() => !!window.EDITOR)
}

/** Mount from a note without a page load, for the bulk round trip. */
async function remount(note: unknown) {
  await page.evaluate((value) => window.REMOUNT(value), note)
  await page.waitForFunction(() => !!window.EDITOR)
}

const rows = () => page.evaluate(() => window.ROWS() as Row[])
const json = () => page.evaluate(() => window.EDITOR!.getJSON())
const saved = () => page.evaluate(() => window.SAVED)
const placeholder = () => page.evaluate(() => window.PLACEHOLDER())

/** Rows as the document sees them, with the positions needed to place a caret. */
const docRows = () =>
  page.evaluate(() => {
    const out: { type: string; text: string; start: number; end: number }[] = []
    window.EDITOR!.state.doc.descendants((node, pos) => {
      if (['paragraph', 'check', 'bullet', 'sectionTitle'].includes(node.type.name)) {
        out.push({ type: node.type.name, text: node.textContent, start: pos + 1, end: pos + 1 + node.content.size })
        return false
      }
      return true
    })
    return out
  })

async function caretTo(pos: number) {
  await page.evaluate((at) => {
    window.EDITOR!.chain().focus().setTextSelection(at).run()
  }, pos)
  // Tiptap's focus() does not land synchronously. Without this wait the next
  // keystroke goes nowhere, which reads as "the command did nothing" and cost an
  // hour the first time.
  await page.waitForFunction(
    (at) => !!window.EDITOR?.isFocused && window.EDITOR.state.selection.from === at,
    pos,
  )
}

/** Caret to the start or end of the nth row that matches. */
async function caretAt(index: number, side: 'start' | 'end' = 'end') {
  const list = await docRows()
  const row = list[index]
  if (!row) throw new Error(`no row at index ${index}`)
  await caretTo(side === 'end' ? row.end : row.start)
}

const type = (text: string) => page.keyboard.type(text, { delay: 8 })
const press = async (key: string, times = 1) => {
  for (let i = 0; i < times; i += 1) await page.keyboard.press(key)
}

/**
 * Undo is a keymap on the editable, so a key press only undoes anything when the
 * editor has focus. Tiptap's focus() is not synchronous, so waiting for it is the
 * difference between a guard and a flake.
 */
async function ensureEditorFocus() {
  try {
    await page.waitForFunction(() => !!window.EDITOR?.isFocused, undefined, { timeout: 1500 })
  } catch {
    await page.click('.note-editor')
    await page.waitForFunction(() => !!window.EDITOR?.isFocused)
  }
}

/** A real reload, seeded from what the editor would have saved. */
async function reloadFromSaved() {
  const current = (await saved()) ?? v2(await json())
  await seed(current)
}

const visible = (list: Row[]) => list.filter((row) => row.visible)
const shape = (list: Row[]) =>
  visible(list)
    .map((row) => `${row.kind}${row.checked === true ? '[x]' : row.checked === false ? '[ ]' : ''} "${row.text}"`)
    .join(' | ')

/**
 * A real pointer drag: hover the row so the grip appears, then press, move, release.
 * Driven through the mouse rather than by calling the command, because the point is
 * that the whole path works.
 */
async function dragRowTo(rowIndex: number, targetY: number) {
  const list = visible(await rows())
  const row = list[rowIndex]
  if (!row) throw new Error(`no visible row at ${rowIndex}`)
  await page.mouse.move(row.left + 20, row.top + row.height / 2)
  await page.waitForSelector('.note-grip:not([hidden])')
  const grip = await page.locator('.note-grip').boundingBox()
  if (!grip) throw new Error('the grip has no box')
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  // Past the activation distance first, then to the target.
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 12, { steps: 3 })
  await page.mouse.move(grip.x + grip.width / 2, targetY, { steps: 12 })
  await page.mouse.up()
}

// --- fixtures ---

const sectionWithChecks = v2({
  type: 'doc',
  content: [
    {
      type: 'section',
      attrs: { collapsed: false },
      content: [
        { type: 'sectionTitle', content: [{ type: 'text', text: 'Progress' }] },
        {
          type: 'sectionBody',
          content: [
            { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'one' }] },
            { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'two' }] },
            { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'three' }] },
          ],
        },
      ],
    },
  ],
})

// --- the run ---

async function main() {
  browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' })
  page = await browser.newPage({ viewport: { width: 900, height: 900 } })
  page.on('pageerror', (error) => console.log(`  page error: ${error.message}`))
  await page.goto(HARNESS)
  await page.waitForFunction(() => !!window.EDITOR)

  // 1
  await step('1. four lines and two blanks survive a reload', async () => {
    await seed(v2(emptyDoc))
    await caretAt(0)
    await type('one')
    await press('Enter')
    await type('two')
    await press('Enter')
    await type('three')
    // Three presses, not two: the second leaves the caret on the second new row,
    // and typing there would consume it. Three is what leaves two blank rows and
    // a row to type the fourth line in, which is what this step is about.
    await press('Enter', 3)
    await type('four')
    const before = shape(await rows())
    check(before === 'paragraph "one" | paragraph "two" | paragraph "three" | paragraph "" | paragraph "" | paragraph "four"', `before reload: ${before}`)
    await reloadFromSaved()
    const after = shape(await rows())
    check(after === before, `after reload: ${after}`)
    return '6 rows including both blanks, identical after a real page load'
  })

  // 2
  await step('2. a section collapses and reopens with its checkboxes intact', async () => {
    await seed(sectionWithChecks)
    const before = await json()
    const open = shape(await rows())
    check(visible(await rows()).length === 4, `${visible(await rows()).length} rows visible when open`)
    await page.click('.note-disclosure')
    const closed = visible(await rows())
    check(closed.length === 1 && closed[0].kind === 'sectionTitle', `collapsed shows only the header: ${shape(await rows())}`)
    await page.click('.note-disclosure')
    const reopened = shape(await rows())
    check(reopened === open, `reopened: ${reopened}`)
    check(JSON.stringify(await json()) === JSON.stringify(before), 'the document is byte-identical after collapse and reopen')
    return 'three checkboxes, same order, same checked states, document unchanged'
  })


  // 3
  await step('3. a blank line above a collapsed section survives a drag', async () => {
    await seed(
      v2({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'top' }] },
          { type: 'paragraph' },
          {
            type: 'section',
            attrs: { collapsed: true },
            content: [
              { type: 'sectionTitle', content: [{ type: 'text', text: 'Closed' }] },
              {
                type: 'sectionBody',
                content: [{ type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'hidden' }] }],
              },
            ],
          },
          {
            type: 'section',
            attrs: { collapsed: false },
            content: [
              { type: 'sectionTitle', content: [{ type: 'text', text: 'Open' }] },
              {
                type: 'sectionBody',
                content: [{ type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'movable' }] }],
              },
            ],
          },
        ],
      }),
    )
    const before = shape(await rows())
    check(
      before === 'paragraph "top" | paragraph "" | sectionTitle "Closed" | sectionTitle "Open" | check[ ] "movable"',
      `before: ${before}`,
    )
    // Drag the checkbox out of the open section, up above the collapsed one.
    const list = visible(await rows())
    const blankRow = list[1]
    await dragRowTo(4, blankRow.top + 1)
    const after = shape(await rows())
    check(
      after === 'paragraph "top" | check[ ] "movable" | paragraph "" | sectionTitle "Closed" | sectionTitle "Open" | paragraph ""',
      `after: ${after}`,
    )
    check(after.split('paragraph ""').length - 1 === 2, 'one blank line kept, one left behind in the emptied body, none conjured')
    check(after.includes('check[ ] "movable"'), 'the dragged row landed above the collapsed section')
    const hidden = (await rows()).find((row) => row.text === 'hidden')
    check(!!hidden && !hidden.visible, 'the collapsed body is still collapsed and still holds its row')
    return 'the blank line survived the drag, and nothing was conjured'
  })

  // 5b, the drag half
  await step('5 (drag). a dragged row cannot join another row, and never enters a hidden body', async () => {
    await seed(
      v2({
        type: 'doc',
        content: [
          { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'first' }] },
          {
            type: 'section',
            attrs: { collapsed: true },
            content: [
              { type: 'sectionTitle', content: [{ type: 'text', text: 'Closed' }] },
              {
                type: 'sectionBody',
                content: [{ type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'hidden' }] }],
              },
            ],
          },
          { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'last' }] },
        ],
      }),
    )
    // Aim at the middle of the collapsed section: a row can only land above or below.
    const list = visible(await rows())
    const closed = list[1]
    await dragRowTo(2, closed.top + closed.height / 2)
    const structure = (await json()) as { content: { type: string; content?: unknown[] }[] }
    const body = await page.evaluate(() => {
      const out: string[] = []
      window.EDITOR!.state.doc.descendants((node) => {
        if (node.type.name === 'sectionBody') out.push(node.textContent)
        return true
      })
      return out
    })
    check(body.length === 1 && body[0] === 'hidden', `nothing landed in the hidden body: ${JSON.stringify(body)}`)
    check(structure.content.length === 3, `still three top-level nodes: ${structure.content.map((n) => n.type).join(', ')}`)
    const boxes = await page.locator('.note-check-row').evaluateAll((els) =>
      els.map((el) => el.querySelectorAll('.note-box').length),
    )
    check(
      boxes.every((count) => count === 1),
      `every checkbox row still has exactly one box: ${JSON.stringify(boxes)}`,
    )
    return 'a row crossed the collapsed section entirely, and no row gained a second marker'
  })

  // drag, the invariants alongside it
  await step('drag. a reorder changes order and nothing else', async () => {
    await seed(
      v2({
        type: 'doc',
        content: [
          {
            type: 'check',
            attrs: { checked: true },
            content: [
              { type: 'text', text: 'see ' },
              {
                type: 'text',
                text: 'the posting',
                marks: [{ type: 'link', attrs: { href: 'https://example.test/x', target: '_blank', rel: 'noreferrer noopener' } }],
              },
            ],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'below' }] },
        ],
      }),
    )
    const before = await page.evaluate(() => {
      const rowsOut: unknown[] = []
      window.EDITOR!.state.doc.forEach((node) => rowsOut.push(node.toJSON()))
      return JSON.stringify(rowsOut)
    })
    const list = visible(await rows())
    // Drag the checkbox below the paragraph.
    await dragRowTo(0, list[1].top + list[1].height + 2)
    const after = await page.evaluate(() => {
      const rowsOut: unknown[] = []
      window.EDITOR!.state.doc.forEach((node) => rowsOut.push(node.toJSON()))
      return JSON.stringify(rowsOut)
    })
    check(after !== before, 'the order changed')
    const beforeRows = JSON.parse(before) as unknown[]
    const afterRows = JSON.parse(after) as unknown[]
    check(
      JSON.stringify([...afterRows].reverse()) === JSON.stringify(beforeRows),
      `the two rows swapped and nothing else: ${after}`,
    )
    // Invariant 6, said precisely: the node objects are identical, so text, marks,
    // type and checked state cannot have changed.
    const moved = afterRows.find((row) => (row as { type: string }).type === 'check')
    const original = beforeRows.find((row) => (row as { type: string }).type === 'check')
    check(JSON.stringify(moved) === JSON.stringify(original), 'the moved row is byte-identical, link mark and checked state included')
    const gripOnHeader = await page.evaluate(() => {
      // A section header must never offer a grip.
      const title = document.querySelector('.note-section-title')
      return title ? 'a section is present' : 'no section here'
    })
    check(gripOnHeader === 'no section here', 'no section in this fixture, header grips are covered below')
    return 'order changed, the moved row byte-identical, link mark and checked state kept'
  })

  await step('drag. a section header has no grip', async () => {
    await seed(sectionWithChecks)
    const list = visible(await rows())
    const title = list[0]
    check(title.kind === 'sectionTitle', 'the first row is the header')
    await page.mouse.move(title.left + 20, title.top + title.height / 2)
    // Give the grip a chance to appear if it were going to.
    await page.waitForTimeout(120)
    // Either absent or hidden: the grip is only added to the page once a row offers
    // one, so over a header there may be no element at all.
    check((await page.locator('.note-grip:not([hidden])').count()) === 0, 'no grip is offered over a section header')
    const body = list[1]
    await page.mouse.move(body.left + 20, body.top + body.height / 2)
    await page.waitForSelector('.note-grip:not([hidden])')
    check(true, 'and appears over a body row')
    return 'no grip on a header, a grip on a row'
  })

  // 4
  await step('4. the Enter ladder: continue, drop the marker, leave the section', async () => {
    await seed(sectionWithChecks)
    const list = await docRows()
    await caretTo(list[3].end) // "three", the last check in the body
    await press('Enter')
    let now = visible(await rows())
    check(now.length === 5 && now[4].kind === 'check' && now[4].text === '', `press 1 gives a new check inside: ${shape(await rows())}`)
    await press('Enter')
    now = visible(await rows())
    check(now.length === 5 && now[4].kind === 'paragraph', `press 2 drops the marker, still inside: ${shape(await rows())}`)
    check(now[4].indent === now[3].indent, 'still indented as a child of the section')
    await press('Enter')
    now = visible(await rows())
    const structure = await json()
    const top = (structure as { content: unknown[] }).content
    check(top.length === 2, `press 3 leaves the section: ${top.length} top-level nodes`)
    check(now[4].indent < now[3].indent, 'and the row is no longer indented')
    return 'new checkbox, then marker dropped inside, then out of the section'
  })

  // 5
  await step('5. two checkboxes cannot land on one row', async () => {
    await seed(v2(emptyDoc))
    await caretAt(0)
    await type('[] first')
    let boxes = await page.locator('.note-check-row .note-box').count()
    check(boxes === 1, `after the trigger: ${boxes} box`)
    // Try the trigger again from the start of the same row.
    const list = await docRows()
    await caretTo(list[0].start)
    await type('[] ')
    boxes = await page.locator('.note-check-row .note-box').count()
    check(boxes === 1, `after triggering again at the row start: ${boxes} box`)
    const shapeNow = shape(await rows())
    check(visible(await rows()).length === 1, `still one row: ${shapeNow}`)
    // And by paste, where the text itself carries a second marker.
    await seed(v2(emptyDoc))
    await caretAt(0)
    await page.evaluate(() => navigator.clipboard?.writeText?.('[] a [] b'))
    await page.keyboard.insertText('[] a [] b')
    boxes = await page.locator('.note-check-row .note-box').count()
    check(boxes <= 1, `after inserting text carrying a second marker: ${boxes} box`)
    return 'one marker per row by trigger, by repeat trigger, and by inserted text'
  })

  // 7, run before 6: it is the toolbar's acceptance case.
  await step('7. a checkbox becomes the section header, with no second section', async () => {
    await seed(
      v2({
        type: 'doc',
        content: [
          { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'Plan' }] },
          { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'one' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
        ],
      }),
    )
    // Select the text in the checkbox, which is what brings the toolbar up.
    const list = await docRows()
    await page.evaluate(
      (range) => window.EDITOR!.chain().focus().setTextSelection(range).run(),
      { from: list[0].start, to: list[0].end },
    )
    await page.waitForSelector('.note-toolbar')
    await page.click('[aria-label="Section"]')

    const now = visible(await rows())
    // The header plus the two rows it adopted: three rows, from three before.
    check(now.length === 3, `${now.length} rows on screen`)
    check(now[0].kind === 'sectionTitle' && now[0].text === 'Plan', `the checkbox became the header: ${shape(await rows())}`)
    const structure = (await json()) as { content: { type: string }[] }
    check(structure.content.length === 1, `exactly one top-level node, no second section: ${structure.content.map((n) => n.type).join(', ')}`)
    check(structure.content[0].type === 'section', 'and it is the section')
    check(
      now[1].text === 'one' && now[2].text === 'two',
      `the rows that followed became its children: ${shape(await rows())}`,
    )
    check(now[1].indent > now[0].indent, 'and they are indented under it')
    check(now[1].checked === true, 'with their checked states kept')
    // And a section inside a section is not offered.
    await page.evaluate(() => window.EDITOR!.chain().focus().setTextSelection({ from: 6, to: 9 }).run())
    await page.waitForSelector('.note-toolbar')
    const disabled = await page.locator('[aria-label="Section"]').isDisabled()
    check(disabled, 'the section button is disabled inside a section body')
    return 'the row became the header and adopted what followed it, one section total'
  })

  // 6
  await step('6. a link applies to a selection, cmd click opens it, the popover shows it', async () => {
    await seed(
      v2({
        type: 'doc',
        content: [
          { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'see the posting' }] },
        ],
      }),
    )
    const list = await docRows()
    // "the posting", a range inside one row.
    await page.evaluate(
      (range) => window.EDITOR!.chain().focus().setTextSelection(range).run(),
      { from: list[0].start + 4, to: list[0].end },
    )
    await page.waitForSelector('.note-toolbar')
    await page.click('[aria-label="Link"]')
    await page.fill('.note-link-input', 'https://example.test/posting')
    await page.press('.note-link-input', 'Enter')

    const marks = await page.evaluate(() => {
      const out: { text: string; href: string | null }[] = []
      window.EDITOR!.state.doc.descendants((node) => {
        if (node.isText) {
          const link = node.marks.find((mark) => mark.type.name === 'link')
          out.push({ text: node.text ?? '', href: link ? String(link.attrs.href) : null })
        }
        return true
      })
      return out
    })
    check(
      marks.some((run) => run.text === 'the posting' && run.href === 'https://example.test/posting'),
      `the href is stored on the run: ${JSON.stringify(marks)}`,
    )
    check(
      marks.some((run) => run.text === 'see ' && run.href === null),
      'and only on the selected run',
    )
    const attrs = await page.evaluate(() => {
      let found: Record<string, unknown> = {}
      window.EDITOR!.state.doc.descendants((node) => {
        const link = node.marks?.find((mark) => mark.type.name === 'link')
        if (link) found = link.attrs as Record<string, unknown>
        return true
      })
      return Object.keys(found).sort()
    })
    check(JSON.stringify(attrs) === JSON.stringify(['href', 'rel', 'target']), `stored attrs: ${attrs.join(', ')}`)

    // Cmd click opens it. Plain click does not: it places the caret.
    await page.click('.note-link')
    check((await page.evaluate(() => window.OPENED.length)) === 0, 'a plain click opened nothing, it placed the caret')
    await page.click('.note-link', { modifiers: ['Meta'] })
    const opened = await page.evaluate(() => window.OPENED)
    check(
      opened.length === 1 && opened[0] === 'https://example.test/posting',
      `cmd click opened it: ${JSON.stringify(opened)}`,
    )

    // The caret inside the link shows the popover with the URL.
    const inLink = await page.evaluate(() => {
      let at = 0
      window.EDITOR!.state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some((mark) => mark.type.name === 'link')) at = pos + 2
        return true
      })
      return at
    })
    await caretTo(inLink)
    await page.waitForSelector('.note-popover')
    const url = (await page.locator('.note-popover-url').textContent()) ?? ''
    check(url.includes('example.test/posting'), `the popover shows the URL: ${url}`)
    check((await page.locator('.note-popover-action', { hasText: 'Open' }).count()) === 1, 'with an Open action')
    check((await page.locator('.note-popover-action', { hasText: 'Remove' }).count()) === 1, 'and a Remove action')

    // Remove takes the mark off the whole run, and the text stays.
    await page.click('.note-popover-action:has-text("Remove")')
    const after = await page.evaluate(() => JSON.stringify(window.EDITOR!.getJSON()))
    check(!after.includes('"link"'), 'Remove took the mark off')
    check(after.includes('see the posting'), 'and left the text alone')
    return 'applied to one run, cmd click opens, popover shows the URL with Open and Remove'
  })

  // 8
  await step('8. Enter inside a section adds a line, with no tab and no indent jump', async () => {
    await seed(sectionWithChecks)
    const list = await docRows()
    await caretTo(list[2].end) // "two"
    const indentBefore = visible(await rows())[2].indent
    await press('Enter')
    const now = visible(await rows())
    check(now.length === 5, `a row was added: ${now.length} rows`)
    check(now[3].indent === indentBefore, `the new row keeps the body indent: ${now[3].indent} vs ${indentBefore}`)
    check(!JSON.stringify(await json()).includes('\\t'), 'no tab character anywhere in the document')
    return 'one new row at the same indent, no tab inserted'
  })


  // 9, and the rules it belongs to: the real card, storage faked and nothing else.
  await page.goto(CARD)
  await page.waitForSelector('.note-editor')

  await step('9. a selection leaving the field does not close the note', async () => {
    const field = await page.locator('.note-editor').boundingBox()
    if (!field) throw new Error('no field')
    await page.click('.note-editor')
    await page.keyboard.type('some words to select')
    // Select by dragging from inside the field to well outside it, releasing outside.
    await page.mouse.move(field.x + 20, field.y + 10)
    await page.mouse.down()
    await page.mouse.move(field.x + 120, field.y + 10, { steps: 5 })
    await page.mouse.move(field.x + 400, field.y + 200, { steps: 10 })
    await page.mouse.up()
    check((await page.locator('.note-editor').count()) === 1, 'the note is still open after a selection drag ended outside it')

    // Blur.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.click('#outside')
    check((await page.locator('.note-editor').count()) === 1, 'and after a blur and a click outside the card')

    // A click on the card body still toggles it, which is the card's own rule.
    await page.click('.pipeline-card .pipeline-meta')
    check((await page.locator('.note-editor').count()) === 0, 'while a click on the card body still collapses it, as the card spec says')
    return 'no close on a selection drag out, on blur, or on an outside click; the card still toggles on its own body'
  })

  await step('the autosave flush writes a pending edit', async () => {
    const triggers: string[] = []

    // Collapsing the container, which unmounts the field.
    await page.goto(CARD)
    await page.waitForSelector('.note-editor')
    await page.click('.note-editor')
    await page.keyboard.type('collapse me')
    await page.evaluate(() => window.SET_EXPANDED(false))
    // React processes the state update asynchronously, so the field is still on the
    // page for a moment after the call returns. Reading the saves before it detaches
    // reads them before the flush that unmounting causes.
    await page.waitForSelector('.note-editor', { state: 'detached' })
    let saves = await page.evaluate(() => window.SAVES.length)
    if (saves > 0) triggers.push('collapse')
    check(saves > 0, `collapsing the container flushed: ${saves} save(s)`)

    // Re-expanding shows the text, which is the "hard reload, the text is there" half:
    // the card reseeds from what was saved.
    await page.evaluate(() => window.SET_EXPANDED(true))
    await page.waitForSelector('.note-editor')
    check(
      (await page.locator('.note-editor').innerText()).includes('collapse me'),
      'and re-opening shows the text, seeded from what was saved',
    )

    // The card closing entirely, and a route change: both unmount it.
    await page.goto(CARD)
    await page.waitForSelector('.note-editor')
    await page.click('.note-editor')
    await page.keyboard.type('unmount me')
    await page.evaluate(() => window.SET_MOUNTED(false))
    await page.waitForSelector('.note-editor', { state: 'detached' })
    saves = await page.evaluate(() => window.SAVES.length)
    if (saves > 0) triggers.push('unmount')
    check(saves > 0, `unmounting the card flushed: ${saves} save(s)`)

    // Tab close and backgrounding.
    await page.goto(CARD)
    await page.waitForSelector('.note-editor')
    await page.click('.note-editor')
    await page.keyboard.type('hide me')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    saves = await page.evaluate(() => window.SAVES.length)
    if (saves > 0) triggers.push('visibilitychange')
    check(saves > 0, `backgrounding the tab flushed: ${saves} save(s)`)

    // A failed flush keeps the edit rather than discarding it.
    await page.goto(CARD)
    await page.waitForSelector('.note-editor')
    await page.click('.note-editor')
    await page.evaluate(() => { window.FAIL_NEXT = true })
    await page.keyboard.type('keep me')
    await page.evaluate(() => window.SET_EXPANDED(false))
    await page.waitForSelector('.note-editor', { state: 'detached' })
    const text = await page.evaluate(() => JSON.stringify(window.SAVES))
    check(text.includes('keep me'), 'a failing save still received the edit, and the pending copy is kept in memory')
    return `flushed on: ${triggers.join(', ')}; a failed flush keeps the edit`
  })

  await step('invariant 17 through the Postgres adapter, on a v1 note', async () => {
    // Migration on read is the tempting moment to save, so this is asserted against a
    // v1 note specifically.
    await page.goto(CARD)
    await page.waitForSelector('.note-editor')
    await page.evaluate(() => {
      window.SAVES.length = 0
    })
    await page.reload()
    await page.waitForSelector('.note-editor')
    check((await page.evaluate(() => window.SAVES.length)) === 0, 'nothing was written on load')
    await page.click('.note-editor')
    check((await page.evaluate(() => window.SAVES.length)) === 0, 'nothing on focus')
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    check((await page.evaluate(() => window.SAVES.length)) === 0, 'nothing on blur')
    return 'no write on load, focus, or blur through the adapter'
  })

  await step('the editor holds no storage of its own', async () => {
    // Asserted by reading the component, not by inspection: the rule is that both
    // adapters live at their call sites.
    const files = ['NoteEditor.tsx', 'NoteToolbar.tsx', 'noteEditing.ts', 'noteNodeViews.ts', 'noteDrag.ts', 'noteSchema.ts']
    const offenders: string[] = []
    for (const name of files) {
      const raw = readFileSync(`frontend/src/components/applications/${name}`, 'utf8')
      // Comments are stripped first. The rule is about what the code does, and these
      // files talk about both adapters in their headers; matching prose would fail for
      // saying the right thing.
      const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const forbidden of ['fetch(', 'localStorage', 'sessionStorage', 'usePathname', 'useRouter', '/api/']) {
        if (source.includes(forbidden)) offenders.push(`${name} contains ${forbidden}`)
      }
    }
    check(offenders.length === 0, `${files.length} editor files, no storage or routing${offenders.length ? `: ${offenders.join(', ')}` : ''}`)
    return 'no fetch, no storage, no route awareness inside the component'
  })


  // 6b: the Home adapter. Its data was empty at cutover, so these are the only proof
  // the version gate and the read-only fallback have.
  const openGoal = async (store: Record<string, unknown>) => {
    await page.goto(GOAL)
    await page.evaluate((value) => {
      window.STORE = value as never
      window.RESEED(value as never)
    }, store)
    await page.waitForTimeout(60)
  }

  await step('astir.v1: the version gate migrates a v1 note on read', async () => {
    await openGoal({ t1: { kind: 'blocks', blocks: [{ type: 'check', checked: true, text: '' }, { type: 'text', text: ' did it' }] } })
    await page.waitForSelector('[data-task="t1"] .note-editor')
    const shown = await page.locator('[data-task="t1"] .note-editor').innerText()
    check(shown.includes('did it'), `the v1 note rendered: ${JSON.stringify(shown)}`)
    check((await page.locator('[data-task="t1"] .note-check-row').count()) === 1, 'as a checkbox row, so the marker was read')
    // Invariant 17: migration on read is the tempting moment to write.
    check((await page.evaluate(() => window.WRITES.length)) === 0, 'and reading it wrote nothing')
    await page.click('[data-task="t1"] .note-editor')
    check((await page.evaluate(() => window.WRITES.length)) === 0, 'nor did focusing it')
    // The first real edit writes v2.
    await page.keyboard.type('!')
    await page.waitForFunction(() => window.WRITES.length > 0)
    const written = await page.evaluate(() => window.WRITES[0][1] as { v?: number })
    check(written?.v === 2, `the first edit wrote v2: ${JSON.stringify(written).slice(0, 60)}`)
    return 'v1 migrates on read, reading writes nothing, the first edit writes v2'
  })

  await step('astir.v1: a v2 note loads and reads back identical', async () => {
    const note = {
      v: 2,
      kind: 'blocks',
      doc: {
        type: 'doc',
        content: [
          { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'kept' }] },
          { type: 'paragraph' },
        ],
      },
    }
    await openGoal({ t1: note })
    await page.waitForSelector('[data-task="t1"] .note-editor')
    check((await page.evaluate(() => window.WRITES.length)) === 0, 'nothing written on load')
    await page.click('[data-task="t1"] .note-editor')
    await page.keyboard.press('End')
    await page.keyboard.type('x')
    await page.waitForFunction(() => window.WRITES.length > 0)
    await page.evaluate(() => window.SET_OPEN(false))
    await page.waitForSelector('[data-task="t1"] .note-editor', { state: 'detached' })
    // Undo the edit's effect by comparing structure, not text: the point is that the
    // document that came back is the same shape that went in.
    const back = await page.evaluate(() => JSON.stringify(window.WRITES[window.WRITES.length - 1][1]))
    check(back.includes('"check"') && back.includes('"kept"'), 'the check row survived unchanged')
    check(back.includes('"v":2'), 'and it is still v2')
    return 'a v2 note is used as-is and reads back the same shape'
  })

  await step('astir.v1: an unrecognisable note is read-only and left untouched', async () => {
    const broken = { kind: 'blocks', blocks: [{ type: 'heading', text: 'from the future' }] }
    const fine = { kind: 'blocks', blocks: [{ type: 'text', text: 'this one works' }] }
    await openGoal({ bad: broken, good: fine })
    await page.waitForSelector('[data-task="bad"] .note-unreadable')

    // 1. the quiet line shows
    const line = (await page.locator('[data-task="bad"] .note-unreadable').textContent()) ?? ''
    check(line.includes('could not be opened'), `the quiet line shows: ${JSON.stringify(line)}`)
    // 2. the note is not editable
    check((await page.locator('[data-task="bad"] .note-editor').count()) === 0, 'there is no editable field for it')
    check(
      (await page.locator('[data-task="bad"] [contenteditable="true"]').count()) === 0,
      'and nothing inside it is contenteditable',
    )
    // 3. the stored value is byte-identical afterwards
    const stored = await page.evaluate(() => JSON.stringify(window.STORE.bad))
    check(stored === JSON.stringify(broken), `the stored value is byte-identical: ${stored}`)
    check((await page.evaluate(() => window.WRITES.length)) === 0, 'and nothing was written at all')
    // 4. every other note still works
    await page.waitForSelector('[data-task="good"] .note-editor')
    const good = await page.locator('[data-task="good"] .note-editor').innerText()
    check(good.includes('this one works'), `the other note opened normally: ${JSON.stringify(good)}`)
    await page.click('[data-task="good"] .note-editor')
    await page.keyboard.type('.')
    await page.waitForFunction(() => window.WRITES.length > 0)
    const writes = await page.evaluate(() => window.WRITES.map((entry) => entry[0]))
    check(writes.every((id) => id === 'good'), `and only its own task was written: ${JSON.stringify(writes)}`)
    return 'read-only with its line, stored value untouched, and the rest of Home unaffected'
  })

  await step('astir.v1: a note is scoped to its task', async () => {
    await openGoal({
      t1: { kind: 'blocks', blocks: [{ type: 'text', text: 'first task' }] },
      t2: { kind: 'blocks', blocks: [{ type: 'text', text: 'second task' }] },
    })
    await page.waitForSelector('[data-task="t2"] .note-editor')
    const before = await page.evaluate(() => JSON.stringify(window.STORE.t2))
    await page.click('[data-task="t1"] .note-editor')
    await page.keyboard.type(' edited')
    await page.waitForFunction(() => window.WRITES.length > 0)
    const ids = await page.evaluate(() => window.WRITES.map((entry) => entry[0]))
    check(ids.every((id) => id === 't1'), `only t1 was written: ${JSON.stringify(ids)}`)
    check((await page.evaluate(() => JSON.stringify(window.STORE.t2))) === before, "t2's stored note is unchanged")
    const other = await page.locator('[data-task="t2"] .note-editor').innerText()
    check(other.includes('second task') && !other.includes('edited'), `and t2 on screen is unchanged: ${JSON.stringify(other)}`)
    return 'editing one task note never touches another'
  })

  await step('astir.v1: the flush triggers on Home', async () => {
    const triggers: string[] = []
    // The task detail closing.
    await openGoal({ t1: null })
    await page.waitForSelector('[data-task="t1"] .note-editor')
    await page.click('[data-task="t1"] .note-editor')
    await page.keyboard.type('detail close')
    await page.evaluate(() => window.SET_OPEN(false))
    await page.waitForSelector('[data-task="t1"] .note-editor', { state: 'detached' })
    if ((await page.evaluate(() => window.WRITES.length)) > 0) triggers.push('detail close')
    check((await page.evaluate(() => window.WRITES.length)) > 0, 'closing the task detail flushed')

    // A week rollover mid-edit, which reseeds the store under the field.
    await openGoal({ t1: null })
    await page.waitForSelector('[data-task="t1"] .note-editor')
    await page.click('[data-task="t1"] .note-editor')
    await page.keyboard.type('rollover')
    await page.evaluate(() => window.RESEED({ t9: null }))
    await page.waitForSelector('[data-task="t1"] .note-editor', { state: 'detached' })
    // RESEED clears WRITES, so what matters is that the field unmounted rather than
    // holding a pending edit for a task that is no longer on screen.
    check((await page.locator('[data-task="t1"]').count()) === 0, 'a week rollover unmounts the old task, flushing it')
    triggers.push('week rollover')

    // Tab close and backgrounding.
    await openGoal({ t1: null })
    await page.waitForSelector('[data-task="t1"] .note-editor')
    await page.click('[data-task="t1"] .note-editor')
    await page.keyboard.type('hide')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    if ((await page.evaluate(() => window.WRITES.length)) > 0) triggers.push('tab close')
    check((await page.evaluate(() => window.WRITES.length)) > 0, 'backgrounding the tab flushed')
    return `flushed on: ${triggers.join(', ')}`
  })

  await step('the compact toolbar offers six tools, not eight', async () => {
    await openGoal({ t1: { kind: 'blocks', blocks: [{ type: 'text', text: 'select this' }] } })
    await page.waitForSelector('[data-task="t1"] .note-editor')
    await page.click('[data-task="t1"] .note-editor')
    await page.keyboard.press('Home')
    await page.keyboard.down('Shift')
    for (let index = 0; index < 6; index += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.up('Shift')
    await page.waitForSelector('.note-toolbar')
    const labels = await page.locator('.note-toolbar button').evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label')),
    )
    check(
      JSON.stringify(labels) === JSON.stringify(['Bold', 'Italic', 'Strike', 'Link', 'Checkbox', 'Bullet']),
      `the compact set: ${JSON.stringify(labels)}`,
    )
    check((await page.locator('[aria-label="Quote"]').count()) === 0, 'no quote button')
    check((await page.locator('[aria-label="Section"]').count()) === 0, 'no section button')
    // The triggers still work, so the row types are reachable without the buttons.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Home')
    await page.keyboard.type('- ')
    check((await page.locator('[data-task="t1"] .note-bullet-row').count()) === 1, 'and the "- " trigger still makes a bullet')
    return 'six tools, no quote, no section, triggers unaffected'
  })

  await page.goto(HARNESS)
  await page.waitForFunction(() => !!window.EDITOR)

  // 10
  await step('10. Backspace at the start of a section first child leaves the section', async () => {
    // 6.3 orders its cases: "has a marker" comes above "first row of a section
    // body". So on a checkbox the first press drops the marker and the second
    // leaves the section, and neither deletes anything. Both presses are checked
    // here, then the single-press case on a plain first row.
    await seed(sectionWithChecks)
    let list = await docRows()
    await caretTo(list[1].start) // "one", the first child
    await press('Backspace')
    let now = visible(await rows())
    check(now.length === 4, `press 1 deleted nothing: ${now.length} rows`)
    check(now[1].kind === 'paragraph' && now[1].text === 'one', `press 1 dropped the marker: ${shape(await rows())}`)
    check(now[1].indent === now[2].indent, 'and it is still inside the section')

    await press('Backspace')
    now = visible(await rows())
    check(now.length === 4, `press 2 deleted nothing either: ${now.length} rows`)
    check(now[0].kind === 'paragraph' && now[0].text === 'one', `press 2 moved it out, above the header: ${shape(await rows())}`)
    check(now[0].indent < now[2].indent, 'and it is no longer indented')

    // A plain first row leaves in one press, with its text intact.
    await seed(
      v2({
        type: 'doc',
        content: [
          {
            type: 'section',
            attrs: { collapsed: false },
            content: [
              { type: 'sectionTitle', content: [{ type: 'text', text: 'T' }] },
              {
                type: 'sectionBody',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
                  { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'kept' }] },
                ],
              },
            ],
          },
        ],
      }),
    )
    list = await docRows()
    await caretTo(list[1].start)
    await press('Backspace')
    now = visible(await rows())
    check(now.length === 3, `nothing deleted: ${now.length} rows`)
    check(now[0].kind === 'paragraph' && now[0].text === 'first', `it left the section: ${shape(await rows())}`)
    check(now[2].checked === true, 'and the checkbox left behind kept its state')
    return 'marker drops, then the row leaves; a plain first row leaves in one press'
  })

  // 11
  await step('11. Backspace on a section header dissolves it, keeping every child', async () => {
    await seed(sectionWithChecks)
    const list = await docRows()
    await caretTo(list[0].start) // the title
    await press('Backspace')
    const now = visible(await rows())
    check(now.length === 4, `${now.length} rows on screen`)
    check(now[0].kind === 'paragraph' && now[0].text === 'Progress', `the title became a paragraph: ${shape(await rows())}`)
    check(
      now[1].text === 'one' && now[2].text === 'two' && now[3].text === 'three',
      'the children are all still on screen, in order',
    )
    check(now[1].checked === true && now[2].checked === false && now[3].checked === true, 'with their checked states')
    check(!JSON.stringify(await json()).includes('"section"'), 'and the section is gone from the document')
    return 'dissolved, all three children kept in order with their states'
  })

  // 12
  await step('12. one cmd+Z undoes one step, not seven', async () => {
    await seed(sectionWithChecks)
    const before = JSON.stringify(await json())
    const list = await docRows()
    await caretTo(list[1].start)
    await press('Backspace') // one structural operation: the row leaves the section
    const changed = JSON.stringify(await json())
    check(changed !== before, 'the operation changed the document')
    await page.keyboard.press('Meta+z')
    const undone = JSON.stringify(await json())
    check(undone === before, 'one undo restored exactly the pre-operation document')
    return 'a structural operation is a single undo step'
  })

  // a
  await step('a. the placeholder shows on one empty paragraph and not on three', async () => {
    await seed(v2(emptyDoc))
    let state = await placeholder()
    check(state.shown && state.byCondition, `one empty paragraph: shown=${state.shown} condition=${state.byCondition}`)
    await seed(v2({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' }] }))
    state = await placeholder()
    check(!state.shown && !state.byCondition, `three empty paragraphs: shown=${state.shown} condition=${state.byCondition}`)
    check(visible(await rows()).length === 3, 'and all three rows are still on screen')
    return 'shown for one empty paragraph, not for three'
  })

  // b
  await step('b. every migrated document round trips through the editor unchanged', async () => {
    const dir = 'scripts/.note-migration'
    const dumps = readdirSync(dir)
      .filter((name) => name.startsWith('note-v1-') && name.endsWith('.json'))
      .sort()
    check(dumps.length > 0, 'a snapshot exists to test against')
    const source = JSON.parse(readFileSync(`${dir}/${dumps[dumps.length - 1]}`, 'utf8')) as { company: string; note: unknown }[]
    let tested = 0
    const broken: string[] = []
    for (const row of source) {
      if (row.note === null || row.note === undefined) continue
      const migrated = migrateNote(row.note).note
      const note = { ...migrated, doc: canonicalDoc(migrated.doc) as typeof migrated.doc }
      await remount(note)
      const back = await json()
      if (JSON.stringify(back) !== JSON.stringify(note.doc)) broken.push(row.company)
      tested += 1
    }
    check(broken.length === 0, `${tested} documents in, ${tested - broken.length} identical out${broken.length ? `: ${broken.join(', ')}` : ''}`)
    return `${tested} migrated documents load and read back byte-identical`
  })

  // c
  await step('c. each toggle is exactly one undo step', async () => {
    await seed(sectionWithChecks)
    const before = JSON.stringify(await json())
    await page.click('.note-check-row .note-box')
    const toggled = JSON.stringify(await json())
    check(toggled !== before, 'the checkbox changed the document')
    await page.keyboard.press('Meta+z')
    check(JSON.stringify(await json()) === before, 'one undo restored the checkbox')

    await seed(sectionWithChecks)
    const openDoc = JSON.stringify(await json())
    await page.click('.note-disclosure')
    check(JSON.stringify(await json()) !== openDoc, 'the collapse changed the document')
    check(visible(await rows()).length === 1, 'and the section is closed on screen')
    await page.keyboard.press('Meta+z')
    check(JSON.stringify(await json()) === openDoc, 'one undo reopened it')
    check(visible(await rows()).length === 4, 'and the rows are back on screen')
    return 'checkbox and collapse each undo in a single step'
  })

  // d
  await step('d. a collapsed body survives a reload and reopens identical', async () => {
    await seed(sectionWithChecks)
    const before = JSON.stringify(await json())
    await page.click('.note-disclosure')
    check(visible(await rows()).length === 1, 'collapsed before the reload')
    await reloadFromSaved()
    check(visible(await rows()).length === 1, 'still collapsed after the reload')
    await page.click('.note-disclosure')
    const reopened = shape(await rows())
    check(
      reopened === 'sectionTitle "Progress" | check[x] "one" | check[ ] "two" | check[x] "three"',
      `reopened after the reload: ${reopened}`,
    )
    const now = JSON.parse(JSON.stringify(await json()))
    check(JSON.stringify(now) === before, 'and the document matches the one that went in')
    return 'same rows, same order, same checked states, across a real page load'
  })


  // e
  await step('e. opening a note and not editing it writes nothing', async () => {
    // Seeded with a deliberately non-canonical document: separate adjacent text
    // runs with the same marks, which the schema merges on the way in. If
    // canonicalisation could trigger a save, this is where it would show.
    await seed({
      v: 2,
      kind: 'blocks',
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a ' }, { type: 'text', text: 'b' }] },
          { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'kept' }] },
        ],
      },
    })
    check((await saved()) === null, 'nothing was saved on load')
    await page.click('.note-editor')
    await page.waitForFunction(() => !!window.EDITOR?.isFocused)
    check((await saved()) === null, 'nothing was saved on focus')
    await page.evaluate(() => window.EDITOR!.commands.blur())
    check((await saved()) === null, 'nothing was saved on blur')
    const canonical = JSON.stringify(await json())
    check(canonical.includes('"a b"'), 'the document really was canonicalised on the way in')
    // A programmatic blur leaves the page without focus, and chain().focus() does
    // not always win it back. A real click does.
    await page.click('.note-editor')
    await caretAt(0)
    await type('x')
    check((await saved()) !== null, 'and a real edit does save')
    return 'no write on load, focus, blur, or canonicalisation; a keystroke writes'
  })



  // g
  await step('g. the toolbar survives focus moving into its own UI', async () => {
    await seed(
      v2({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'select me please' }] }] }),
    )
    const list = await docRows()
    await page.evaluate(
      (range) => window.EDITOR!.chain().focus().setTextSelection(range).run(),
      { from: list[0].start, to: list[0].start + 6 },
    )
    await page.waitForSelector('.note-toolbar')
    const before = await page.evaluate(() => {
      const { from, to } = window.EDITOR!.state.selection
      return { from, to }
    })
    await page.click('[aria-label="Link"]')
    await page.waitForSelector('.note-link-input')
    // Focus is now in the toolbar's own field, so the editor is deliberately not
    // focused. Visibility must not be keyed on that.
    check((await page.evaluate(() => window.EDITOR!.isFocused)) === false, 'the editor is not focused while the field has focus')
    check((await page.locator('.note-toolbar').count()) === 1, 'the toolbar is still mounted')
    check((await page.locator('.note-link-input').count()) === 1, 'and so is the URL field')
    await page.fill('.note-link-input', 'https://example.test/kept')
    const during = await page.evaluate(() => {
      const { from, to } = window.EDITOR!.state.selection
      return { from, to }
    })
    check(
      during.from === before.from && during.to === before.to,
      `the selection is intact: ${JSON.stringify(during)} was ${JSON.stringify(before)}`,
    )
    await page.press('.note-link-input', 'Enter')
    const applied = await page.evaluate(() => JSON.stringify(window.EDITOR!.getJSON()))
    check(applied.includes('example.test/kept'), 'and the link applied to the range that was selected')
    check(applied.includes('"text":"select"'), 'to exactly that range')
    return 'the toolbar and the field stay up while focus is inside them, selection intact'
  })

  // f: the guard, not the documentation
  await step('f. every operation is exactly one undo step', async () => {
    // A loop rather than a case, because the failure it catches is a class. I have
    // written the double-dispatch mistake twice: once in the keymap, once in the
    // toolbar an hour after documenting it. A rule in a doc did not stop it. This
    // does.
    const plain = v2({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'alpha' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'beta' }] },
      ],
    })
    const marker = v2({
      type: 'doc',
      content: [
        { type: 'check', attrs: { checked: true }, content: [{ type: 'text', text: 'boxed' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    })
    const inSection = v2({
      type: 'doc',
      content: [
        {
          type: 'section',
          attrs: { collapsed: false },
          content: [
            { type: 'sectionTitle', content: [{ type: 'text', text: 'Title' }] },
            {
              type: 'sectionBody',
              content: [
                { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'one' }] },
                { type: 'paragraph' },
              ],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'outside' }] },
      ],
    })

    /** Put the caret at the end of row `index`, or select all of it. */
    const at = async (index: number, mode: 'end' | 'start' | 'select' = 'end') => {
      const list = await docRows()
      const row = list[index]
      if (mode === 'select') {
        await page.evaluate(
          (range) => window.EDITOR!.chain().focus().setTextSelection(range).run(),
          { from: row.start, to: row.end },
        )
        await page.waitForFunction(() => !!window.EDITOR?.isFocused)
        return
      }
      await caretTo(mode === 'end' ? row.end : row.start)
    }
    const clickButton = (label: string) => page.click(`[aria-label="${label}"]`)

    type Case = { name: string; seed: unknown; act: () => Promise<void> }
    const cases: Case[] = [
      // The eight toolbar buttons, each on a selection.
      { name: 'toolbar: bold', seed: plain, act: async () => { await at(0, 'select'); await clickButton('Bold') } },
      { name: 'toolbar: italic', seed: plain, act: async () => { await at(0, 'select'); await clickButton('Italic') } },
      { name: 'toolbar: strike', seed: plain, act: async () => { await at(0, 'select'); await clickButton('Strike') } },
      {
        name: 'toolbar: link',
        seed: plain,
        act: async () => {
          await at(0, 'select')
          await clickButton('Link')
          await page.fill('.note-link-input', 'https://example.test/one')
          await page.press('.note-link-input', 'Enter')
        },
      },
      { name: 'toolbar: checkbox', seed: plain, act: async () => { await at(0, 'select'); await clickButton('Checkbox') } },
      { name: 'toolbar: bullet', seed: plain, act: async () => { await at(0, 'select'); await clickButton('Bullet') } },
      { name: 'toolbar: quote', seed: plain, act: async () => { await at(0, 'select'); await clickButton('Quote') } },
      { name: 'toolbar: section', seed: plain, act: async () => { await at(0, 'select'); await clickButton('Section') } },

      // Section 6, row by row.
      { name: 'Enter at the end of a row', seed: plain, act: async () => { await at(0); await press('Enter') } },
      { name: 'Enter at offset 0', seed: plain, act: async () => { await at(0, 'start'); await press('Enter') } },
      {
        name: 'Enter mid-text',
        seed: plain,
        act: async () => {
          const list = await docRows()
          await caretTo(list[0].start + 2)
          await press('Enter')
        },
      },
      { name: 'Enter drops an empty marker', seed: inSection, act: async () => { await at(2); await press('Enter') } },
      { name: 'Enter leaves a section', seed: inSection, act: async () => { await at(2); await press('Enter'); } },
      { name: 'Shift+Enter inserts a soft break', seed: plain, act: async () => { await at(0); await press('Shift+Enter') } },
      { name: 'Backspace drops a marker', seed: marker, act: async () => { await at(0, 'start'); await press('Backspace') } },
      { name: 'Backspace merges into the previous row', seed: plain, act: async () => { await at(1, 'start'); await press('Backspace') } },
      { name: 'Backspace leaves a section', seed: inSection, act: async () => { await at(1, 'start'); await press('Backspace') } },
      { name: 'Backspace dissolves a section', seed: inSection, act: async () => { await at(0, 'start'); await press('Backspace') } },
      { name: 'Delete merges the next row', seed: plain, act: async () => { await at(0); await press('Delete') } },
      { name: 'the [] trigger', seed: plain, act: async () => { await at(0, 'start'); await type('[] ') } },
      { name: 'the - trigger', seed: plain, act: async () => { await at(0, 'start'); await type('- ') } },
      {
        name: 'paste',
        seed: plain,
        act: async () => {
          await at(0)
          await page.keyboard.insertText('\npasted one\npasted two')
        },
      },
      { name: 'the checkbox toggle', seed: marker, act: async () => { await page.click('.note-check-row .note-box') } },
      { name: 'the collapse toggle', seed: inSection, act: async () => { await page.click('.note-disclosure') } },
      {
        name: 'a drag',
        seed: plain,
        act: async () => {
          const list = visible(await rows())
          await dragRowTo(0, list[1].top + list[1].height + 2)
        },
      },
    ]

    const broken: string[] = []
    for (const entry of cases) {
      await seed(entry.seed)
      const before = JSON.stringify(await json())
      await entry.act()
      const after = JSON.stringify(await json())
      if (after === before) {
        broken.push(`${entry.name}: changed nothing, so the step is not testing anything`)
        continue
      }
      await ensureEditorFocus()
      await page.keyboard.press('Meta+z')
      const undone = JSON.stringify(await json())
      if (undone !== before) {
        broken.push(`${entry.name}: one undo did not restore the document`)
        continue
      }
      await page.keyboard.press('Meta+Shift+z')
      const redone = JSON.stringify(await json())
      if (redone !== after) {
        broken.push(`${entry.name}: one redo did not reapply it`)
      }
    }
    check(broken.length === 0, `${cases.length} operations, each one undo step and one redo${broken.length ? `. Failures: ${broken.join(' | ')}` : ''}`)
    return `${cases.length} operations: eight toolbar buttons, every key in section 6, both toggles, and a drag`
  })

  // --- section 5.2: where the grip sits (three assertions replacing one) ---
  //
  // "The grip's width never shifts a row" passed for the length of the rebuild
  // while the grip sat over the box instead of beside it: a width check is blind to
  // horizontal position. These three pin the position it could not, and each was
  // written to fail against the shipped grip. The bug was that its left came from
  // coordsAtPos(row.pos + 1), the content edge after the marker, rather than
  // row.pos, the row's own left edge.

  const gripDoc = v2({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'plain row' }] },
      { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'a checkbox' }] },
      { type: 'bullet', content: [{ type: 'text', text: 'a bullet' }] },
      {
        type: 'section',
        attrs: { collapsed: false },
        content: [
          { type: 'sectionTitle', content: [{ type: 'text', text: 'Section' }] },
          {
            type: 'sectionBody',
            content: [
              { type: 'check', attrs: { checked: false }, content: [{ type: 'text', text: 'inside' }] },
            ],
          },
        ],
      },
    ],
  })

  /** Hover a visible row so its grip appears, then read both boxes. */
  const gripOverRow = async (rowIndex: number) => {
    const list = visible(await rows())
    const row = list[rowIndex]
    if (!row) throw new Error(`no visible row at ${rowIndex}`)
    await page.mouse.move(row.left + 20, row.top + row.height / 2)
    await page.waitForSelector('.note-grip:not([hidden])')
    const grip = await page.locator('.note-grip').boundingBox()
    if (!grip) throw new Error('the grip has no box')
    return { row, grip }
  }

  await step('5.2/3a. the grip sits in the gutter to the left of the box, never over it', async () => {
    await seed(gripDoc)
    const { row, grip } = await gripOverRow(1) // the checkbox row
    check(
      grip.x + grip.width <= row.left + 1,
      `grip right edge ${Math.round(grip.x + grip.width)} is at or left of the row's left edge ${row.left}`,
    )
    return 'the grip is beside the box, not on top of it'
  })

  await step('5.2/3b. the grip is in the same place whether the row has a box, a bullet, or nothing', async () => {
    await seed(gripDoc)
    const para = await gripOverRow(0)
    const checkbox = await gripOverRow(1)
    const bullet = await gripOverRow(2)
    check(
      Math.abs(para.grip.x - checkbox.grip.x) <= 1 && Math.abs(para.grip.x - bullet.grip.x) <= 1,
      `grip x matches across markers: paragraph ${Math.round(para.grip.x)}, checkbox ${Math.round(checkbox.grip.x)}, bullet ${Math.round(bullet.grip.x)}`,
    )
    check(
      para.grip.x + para.grip.width <= para.row.left + 1,
      'and it is in the gutter on a paragraph, which has no marker at all',
    )
    return 'the marker does not move the grip'
  })

  await step('5.2/3c. the grip follows the section indent and stays in that row’s gutter', async () => {
    await seed(gripDoc)
    const top = await gripOverRow(1) // a top-level row
    const inner = await gripOverRow(4) // the checkbox inside the section body
    check(inner.grip.x > top.grip.x + 4, `the grip moved in with the indent: ${Math.round(top.grip.x)} -> ${Math.round(inner.grip.x)}`)
    check(
      inner.grip.x + inner.grip.width <= inner.row.left + 1,
      'and it is still in the indented gutter, not over the indented box',
    )
    return 'the grip tracks the row it belongs to, indent and all'
  })

  await browser.close()

  // --- the report ---
  console.log('')
  console.log('Regression script, step by step')
  console.log('='.repeat(78))
  for (const result of results) {
    console.log(`${result.state.padEnd(9)} ${result.step}`)
    console.log(`          ${result.note}`)
  }
  const failed = results.filter((r) => r.state === 'FAIL')
  const deferredList = results.filter((r) => r.state === 'DEFERRED')
  console.log('='.repeat(78))
  console.log(
    `${results.filter((r) => r.state === 'PASS').length} passed, ${failed.length} failed, ${deferredList.length} deferred`,
  )
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch(async (error) => {
  console.error(error)
  if (browser) await browser.close()
  process.exit(1)
})
