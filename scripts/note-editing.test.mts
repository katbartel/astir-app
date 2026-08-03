// Every case in docs/notes-editor.md section 6, run against real ProseMirror
// state with no DOM. Run: node scripts/note-editing.test.mts
//
// Notation: a document is written as rows, and the caret is a "|" inside the text.
// Assertions are before-and-after pictures, so a failure shows the shape that came
// out rather than a position number.

import { EditorState, TextSelection, type Command } from '@tiptap/pm/state'
import { Fragment, type Node as PmNode, type Schema } from '@tiptap/pm/model'
import { noteSchema } from '../frontend/src/components/applications/noteSchema.ts'
import {
  applyRowType,
  noteBackspace,
  noteDelete,
  noteEnter,
  noteHardBreak,
  setRowType,
  sliceForParsed,
  sliceForText,
  toggleCheckedAt,
  toggleCollapsedAt,
} from '../frontend/src/components/applications/noteEditing.ts'

const schema: Schema = noteSchema()
const CARET = '‸'

let passed = 0
let failed = 0
const eq = (name: string, actual: string, expected: string) => {
  if (actual.trim() === expected.trim()) {
    passed += 1
    console.log(`  ok    ${name}`)
    return
  }
  failed += 1
  console.log(`  FAIL  ${name}`)
  console.log(`        expected:\n${expected.trim().split('\n').map((l) => `          ${l}`).join('\n')}`)
  console.log(`        actual:\n${actual.trim().split('\n').map((l) => `          ${l}`).join('\n')}`)
}

// --- building documents ---

type Row = ['p' | 'check' | 'checked' | 'bullet', string]
type Spec = Row | ['quote', Row[]] | ['section' | 'closed', string, Row[]]

function rowNode(spec: Row): PmNode {
  const [kind, text] = spec
  const content = text === '' ? Fragment.empty : Fragment.from(schema.text(text))
  if (kind === 'p') return schema.nodes.paragraph.createChecked(null, content)
  if (kind === 'bullet') return schema.nodes.bullet.createChecked(null, content)
  return schema.nodes.check.createChecked({ checked: kind === 'checked' }, content)
}

function specNode(spec: Spec): PmNode {
  if (spec[0] === 'quote') return schema.nodes.quote.createChecked(null, (spec[1] as Row[]).map(rowNode))
  if (spec[0] === 'section' || spec[0] === 'closed') {
    const [, title, rows] = spec as ['section' | 'closed', string, Row[]]
    return schema.nodes.section.createChecked({ collapsed: spec[0] === 'closed' }, [
      schema.nodes.sectionTitle.createChecked(null, title === '' ? Fragment.empty : Fragment.from(schema.text(title))),
      schema.nodes.sectionBody.createChecked(null, rows.map(rowNode)),
    ])
  }
  return rowNode(spec as Row)
}

/** Build a state, with the caret where the CARET marker was. */
function build(specs: Spec[]): EditorState {
  const doc = schema.nodes.doc.createChecked(null, specs.map(specNode))
  let at = -1
  doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text) {
      const index = node.text.indexOf(CARET)
      if (index >= 0) at = pos + index
    }
    return at < 0
  })
  if (at < 0) throw new Error('no caret marker in the spec')
  const state = EditorState.create({ schema, doc })
  const tr = state.tr.delete(at, at + 1)
  tr.setSelection(TextSelection.create(tr.doc, at))
  return state.apply(tr)
}

/** Render a state as rows, with the caret drawn back in. */
function show(state: EditorState): string {
  const { from, to } = state.selection
  const lines: string[] = []
  const walk = (node: PmNode, base: number, depth: number) => {
    node.forEach((child, offset) => {
      const pos = base + offset + 1
      const pad = '  '.repeat(depth)
      const name = child.type.name
      if (name === 'section') {
        lines.push(`${pad}section[${child.attrs.collapsed ? 'closed' : 'open'}]`)
        walk(child, pos, depth + 1)
        return
      }
      if (name === 'sectionBody' || name === 'quote') {
        lines.push(`${pad}${name}`)
        walk(child, pos, depth + 1)
        return
      }
      // a row or a title: draw its inline content with the caret in place
      let text = ''
      child.forEach((inline, inlineOffset) => {
        const start = pos + 1 + inlineOffset
        if (inline.type.name === 'hardBreak') {
          text += '<br>'
          return
        }
        const raw = inline.text ?? ''
        for (let index = 0; index < raw.length; index += 1) {
          if (start + index === from && from === to) text += '|'
          text += raw[index]
        }
        const marks = inline.marks.map((mark) => mark.type.name)
        if (marks.length > 0) text += `{${marks.join(',')}}`
      })
      const end = pos + 1 + child.content.size
      if (from === to && from === end) text += '|'
      else if (from === to && from === pos + 1 && text.indexOf('|') < 0) text = `|${text}`
      const label = name === 'check' ? `check[${child.attrs.checked ? 'x' : ' '}]` : name === 'paragraph' ? 'p' : name
      lines.push(`${pad}${label} "${text}"`)
    })
  }
  walk(state.doc, -1, 0)
  return lines.join('\n')
}

function run(state: EditorState, command: Command): EditorState {
  let next = state
  command(state, (tr) => {
    next = state.apply(tr)
  })
  return next
}

const after = (specs: Spec[], command: Command) => show(run(build(specs), command))

// --- Enter ---

console.log('\nEnter, on a row')

eq(
  'non-empty paragraph, caret at end: a new paragraph below, caret in it',
  after([['p', `abc${CARET}`]], noteEnter),
  `
p "abc"
p "|"`,
)
eq(
  'non-empty check, caret at end: a new check below, unchecked',
  after([['checked', `abc${CARET}`]], noteEnter),
  `
check[x] "abc"
check[ ] "|"`,
)
eq(
  'non-empty bullet, caret at end: a new bullet below',
  after([['bullet', `abc${CARET}`]], noteEnter),
  `
bullet "abc"
bullet "|"`,
)
eq(
  'caret at offset 0: a new empty row ABOVE, same type and same checked state, caret on it',
  after([['checked', `${CARET}abc`]], noteEnter),
  `
check[x] "|"
check[x] "abc"`,
)
eq(
  'mid-text: the tail moves to a new row below, caret at its start',
  after([['p', `ab${CARET}cd`]], noteEnter),
  `
p "ab"
p "|cd"`,
)
eq(
  'mid-text in a checked check: the new row is unchecked',
  after([['checked', `ab${CARET}cd`]], noteEnter),
  `
check[x] "ab"
check[ ] "|cd"`,
)
eq(
  'an empty check drops its marker and nothing else happens',
  after([['check', CARET]], noteEnter),
  `
p "|"`,
)
eq(
  'an empty bullet drops its marker',
  after([['bullet', CARET]], noteEnter),
  `
p "|"`,
)
eq(
  'an empty paragraph at top level: a new empty paragraph below',
  after([['p', CARET]], noteEnter),
  `
p ""
p "|"`,
)

console.log('\nEnter, leaving a container')

eq(
  'an empty paragraph in a section body moves out, after the section',
  after([['section', 'T', [['check', 'one'], ['p', CARET]]]], noteEnter),
  `
section[open]
  sectionTitle "T"
  sectionBody
    check[ ] "one"
p "|"`,
)
eq(
  'the only row of a body moves out, and the body keeps an empty paragraph',
  after([['section', 'T', [['p', CARET]]]], noteEnter),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p ""
p "|"`,
)
eq(
  'an empty paragraph in a quote moves out, after the quote',
  after([['quote', [['p', 'said'], ['p', CARET]]]], noteEnter),
  `
quote
  p "said"
p "|"`,
)

console.log('\nEnter, in a section title')

eq(
  'caret at offset 0 of a non-empty title: a paragraph opens above, the section moves down',
  after([['section', `${CARET}T`, [['p', 'body']]]], noteEnter),
  `
p "|"
section[open]
  sectionTitle "T"
  sectionBody
    p "body"`,
)
eq(
  'mid-title: the title keeps the head, the tail becomes the body first row',
  after([['section', `Ti${CARET}tle`, [['p', 'body']]]], noteEnter),
  `
section[open]
  sectionTitle "Ti"
  sectionBody
    p "|tle"
    p "body"`,
)
eq(
  'at the end of a title, when the body first row is empty: reuse it, do not add another',
  after([['section', `T${CARET}`, [['p', '']]]], noteEnter),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p "|"`,
)
eq(
  'at the end of a title, when the body first row has text: open a new first row',
  after([['section', `T${CARET}`, [['p', 'body']]]], noteEnter),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p "|"
    p "body"`,
)

console.log('\nthe Enter ladder: continue, drop the marker, leave')

{
  let state = build([['section', 'T', [['check', `one${CARET}`]]]])
  state = run(state, noteEnter)
  eq(
    'press 1: a new check, still inside',
    show(state),
    `
section[open]
  sectionTitle "T"
  sectionBody
    check[ ] "one"
    check[ ] "|"`,
  )
  state = run(state, noteEnter)
  eq(
    'press 2: the marker goes, still inside',
    show(state),
    `
section[open]
  sectionTitle "T"
  sectionBody
    check[ ] "one"
    p "|"`,
  )
  state = run(state, noteEnter)
  eq(
    'press 3: out of the section',
    show(state),
    `
section[open]
  sectionTitle "T"
  sectionBody
    check[ ] "one"
p "|"`,
  )
}

console.log('\nEnter with a selection')

{
  const state = build([['p', `ab${CARET}cd`]])
  const selected = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.selection.from, state.selection.from + 2)),
  )
  eq(
    'the selection is deleted and the row splits, in one transaction',
    show(run(selected, noteEnter)),
    `
p "ab"
p "|"`,
  )
}

// --- Backspace ---

console.log('\nBackspace at offset 0')

eq(
  'a check with text drops its marker, and nothing is deleted',
  after([['checked', `${CARET}abc`]], noteBackspace),
  `
p "|abc"`,
)
eq(
  'a bullet with text drops its marker',
  after([['bullet', `${CARET}abc`]], noteBackspace),
  `
p "|abc"`,
)
eq(
  'a paragraph merges into the previous row of the same container',
  after([['p', 'one'], ['p', `${CARET}two`]], noteBackspace),
  `
p "one|two"`,
)
eq(
  'the first row of a section body leaves the section, no merge',
  after([['section', 'T', [['p', `${CARET}one`], ['p', 'two']]]], noteBackspace),
  `
p "|one"
section[open]
  sectionTitle "T"
  sectionBody
    p "two"`,
)
eq(
  'the only row of a body leaves it, and the body keeps an empty paragraph',
  after([['section', 'T', [['p', `${CARET}one`]]]], noteBackspace),
  `
p "|one"
section[open]
  sectionTitle "T"
  sectionBody
    p ""`,
)
eq(
  'the first row of a quote leaves the quote',
  after([['quote', [['p', `${CARET}one`]]]], noteBackspace),
  `
p "|one"
quote
  p ""`,
)
eq(
  'a section header dissolves: the title becomes a paragraph and the body is promoted in order',
  after([['section', `${CARET}Title`, [['check', 'one'], ['p', 'two']]]], noteBackspace),
  `
p "|Title"
check[ ] "one"
p "two"`,
)
eq(
  'the first row of the note is a no-op',
  after([['p', `${CARET}one`]], noteBackspace),
  `
p "|one"`,
)
eq(
  'a paragraph after a section is not absorbed into it',
  after([['section', 'T', [['p', 'inside']]], ['p', `${CARET}after`]], noteBackspace),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p "inside"
p "|after"`,
)

// --- Delete ---

console.log('\nDelete at the end of a row')

eq(
  'the next row of the same container is merged in',
  after([['p', `one${CARET}`], ['p', 'two']], noteDelete),
  `
p "one|two"`,
)
eq(
  'the last row of a section body is a no-op: nothing is pulled in',
  after([['section', 'T', [['p', `one${CARET}`]]], ['p', 'after']], noteDelete),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p "one|"
p "after"`,
)
eq(
  'the end of a section title is a no-op: a title never merges with its body',
  after([['section', `T${CARET}`, [['p', 'body']]]], noteDelete),
  `
section[open]
  sectionTitle "T|"
  sectionBody
    p "body"`,
)
eq(
  'a row before a section is a no-op: a section is never absorbed',
  after([['p', `one${CARET}`], ['section', 'T', [['p', 'inside']]]], noteDelete),
  `
p "one|"
section[open]
  sectionTitle "T"
  sectionBody
    p "inside"`,
)
eq(
  'the last row of the note is a no-op',
  after([['p', `one${CARET}`]], noteDelete),
  `
p "one|"`,
)

// --- conversion and toggles ---

console.log('\ntype conversion')

eq(
  'a paragraph becomes a check, text kept',
  after([['p', `ab${CARET}c`]], setRowType('check')),
  `
check[ ] "ab|c"`,
)
eq(
  'a check becomes a bullet: one marker replaces the other',
  after([['checked', `ab${CARET}c`]], setRowType('bullet')),
  `
bullet "ab|c"`,
)
eq(
  'a bullet becomes a check',
  after([['bullet', `ab${CARET}c`]], setRowType('check')),
  `
check[ ] "ab|c"`,
)
eq(
  'a check becomes a paragraph',
  after([['checked', `ab${CARET}c`]], setRowType('paragraph')),
  `
p "ab|c"`,
)

console.log('\ntoggles, both transactions so both are undoable')

{
  const state = build([['check', `one${CARET}`]])
  eq('the checkbox toggles from its attribute', show(run(state, toggleCheckedAt(0))), `check[x] "one|"`)
  const toggled = run(state, toggleCheckedAt(0))
  eq('and back', show(run(toggled, toggleCheckedAt(0))), `check[ ] "one|"`)
}
{
  const state = build([['section', 'T', [['check', `one${CARET}`]]]])
  eq(
    'the section collapses from its attribute, and the body is untouched',
    show(run(state, toggleCollapsedAt(0))),
    `
section[closed]
  sectionTitle "T"
  sectionBody
    check[ ] "one|"`,
  )
}

console.log('\nShift+Enter')

eq(
  'a soft break, in place, no new row',
  after([['p', `ab${CARET}cd`]], noteHardBreak),
  `
p "ab<br>|cd"`,
)
eq(
  'a soft break in a section title stays in the title',
  after([['section', `T${CARET}`, [['p', 'body']]]], noteHardBreak),
  `
section[open]
  sectionTitle "T<br>|"
  sectionBody
    p "body"`,
)

// --- paste ---

console.log('\npaste')

const sliceRows = (text: string) => {
  const slice = sliceForText(schema, text)
  const out: string[] = []
  slice.content.forEach((node) => {
    const label = node.type.name === 'check' ? `check[${node.attrs.checked ? 'x' : ' '}]` : node.type.name === 'paragraph' ? 'p' : node.type.name
    out.push(`${label} "${node.textContent}"`)
  })
  return out.join('\n')
}

eq(
  'plain text splits on newlines and reads the markers',
  sliceRows('one\n- two\n[] three\n[x] four\n[ ] five'),
  `
p "one"
bullet "two"
check[ ] "three"
check[x] "four"
check[ ] "five"`,
)
eq(
  'blank lines in a paste are preserved as empty paragraphs',
  sliceRows('one\n\ntwo'),
  `
p "one"
p ""
p "two"`,
)
eq('a single line stays one row', sliceRows('just this'), 'p "just this"')

{
  // A parsed slice holding a quote and a section is flattened to rows: no paste can
  // create a container.
  const parsed = new (Object.getPrototypeOf(sliceForText(schema, 'x')).constructor)(
    Fragment.from([
      schema.nodes.quote.createChecked(null, [schema.nodes.paragraph.createChecked(null, Fragment.from(schema.text('quoted')))]),
      schema.nodes.section.createChecked({ collapsed: false }, [
        schema.nodes.sectionTitle.createChecked(null, Fragment.from(schema.text('Title'))),
        schema.nodes.sectionBody.createChecked(null, [schema.nodes.paragraph.createChecked(null, Fragment.from(schema.text('inside')))]),
      ]),
      schema.nodes.paragraph.createChecked(null, Fragment.from(schema.text('- listy'))),
    ]),
    0,
    0,
  )
  const flat = sliceForParsed(schema, parsed)
  const out: string[] = []
  flat.content.forEach((node) => {
    const label = node.type.name === 'check' ? `check[${node.attrs.checked ? 'x' : ' '}]` : node.type.name === 'paragraph' ? 'p' : node.type.name
    out.push(`${label} "${node.textContent}"`)
  })
  eq(
    'pasted containers are flattened to their rows, and markers still read',
    out.join('\n'),
    `
p "quoted"
p "Title"
p "inside"
bullet "listy"`,
  )
}

console.log('\nrow type on a transaction')

{
  const state = build([['p', `ab${CARET}c`]])
  const tr = state.tr
  applyRowType(tr, 'check')
  eq('applyRowType works on a transaction, for chains and input rules', show(state.apply(tr)), `check[ ] "ab|c"`)
}

console.log('\ncrossing a container boundary: content never does, the caret always may')

eq(
  'a row with text after a section is a no-op: text would be absorbed',
  after([['section', 'T', [['p', 'inside']]], ['p', `${CARET}after`]], noteBackspace),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p "inside"
p "|after"`,
)
eq(
  'an empty row after an open section is deleted, caret to the end of its last body row',
  after([['section', 'T', [['p', 'one'], ['check', 'two']]], ['p', CARET]], noteBackspace),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p "one"
    check[ ] "two|"`,
)
eq(
  'an empty row after a CLOSED section puts the caret in the title, never in the hidden body',
  after([['closed', 'Title', [['p', 'hidden']]], ['p', CARET]], noteBackspace),
  `
section[closed]
  sectionTitle "Title|"
  sectionBody
    p "hidden"`,
)
eq(
  'an empty row after a quote is deleted, caret to the end of its last row',
  after([['quote', [['p', 'said'], ['p', 'again']]], ['p', CARET]], noteBackspace),
  `
quote
  p "said"
  p "again|"`,
)
eq(
  'a row with text before a section is a no-op on Delete',
  after([['p', `one${CARET}`], ['section', 'T', [['p', 'inside']]]], noteDelete),
  `
p "one|"
section[open]
  sectionTitle "T"
  sectionBody
    p "inside"`,
)
eq(
  'an empty row before an open section is deleted, caret to the start of its first body row',
  after([['p', CARET], ['section', 'T', [['p', 'one'], ['p', 'two']]]], noteDelete),
  `
section[open]
  sectionTitle "T"
  sectionBody
    p "|one"
    p "two"`,
)
eq(
  'an empty row before a CLOSED section puts the caret in the title',
  after([['p', CARET], ['closed', 'Title', [['p', 'hidden']]]], noteDelete),
  `
section[closed]
  sectionTitle "|Title"
  sectionBody
    p "hidden"`,
)
eq(
  'an empty row before a quote is deleted, caret to the start of its first row',
  after([['p', CARET], ['quote', [['p', 'said']]]], noteDelete),
  `
quote
  p "|said"`,
)

console.log('')
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
