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
  deferred(
    '3. a blank line above a collapsed section survives a drag',
    'needs drag (5d). The blank-line half is covered by step 1 and addition d.',
  )

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

  // 9
  deferred(
    '9. selecting text and dragging the pointer outside the field leaves the note open',
    'needs the field mounted inside a pipeline card with its disclosure (step 6). The rule it tests, invariant 15, has no code yet to violate.',
  )

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
