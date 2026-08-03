// Checks on the v1 to v2 mapping, for the paths the real column does not
// exercise. Run: node scripts/migrate-notes.test.mts
//
// The database has no bullets, no nested containers, and no two-checkbox lines,
// so those conversions would otherwise ship unverified.

import {
  migrateNote,
  UnknownNoteShape,
  type PmNode,
  type StoredNote,
} from '../frontend/src/lib/noteMigration.ts'

let failed = 0
let passed = 0

const check = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    passed += 1
    console.log(`  ok    ${name}`)
    return
  }
  failed += 1
  console.log(`  FAIL  ${name}`)
  console.log(`        expected ${b}`)
  console.log(`        actual   ${a}`)
}

const halts = (name: string, note: unknown, fragment: string) => {
  try {
    migrateNote(note)
    failed += 1
    console.log(`  FAIL  ${name}: converted instead of halting`)
  } catch (error) {
    if (error instanceof UnknownNoteShape && error.message.includes(fragment)) {
      passed += 1
      console.log(`  ok    ${name}`)
      return
    }
    failed += 1
    console.log(`  FAIL  ${name}: wrong error ${String(error)}`)
  }
}

const v1 = (blocks: unknown[]) => ({ kind: 'blocks', blocks })
const doc = (note: StoredNote) => note.doc.content ?? []
/** Row types in order, so a test reads as the shape it expects. */
const shape = (note: StoredNote): string[] =>
  doc(note).map((node: PmNode) => {
    const text = (node.content ?? []).map((c) => c.text ?? '').join('')
    return node.content ? `${node.type}:${text}` : `${node.type}:`
  })
const run = (blocks: unknown[]) => migrateNote(v1(blocks))

console.log('\nlines and the terminator rule')

check(
  'a "\\n" before a container terminates the line, it does not open a blank one',
  shape(run([{ type: 'text', text: 'a\n' }, { type: 'collapse', summary: 'S', open: true, blocks: [] }]).note),
  ['paragraph:a', 'section:'],
)
check(
  '"\\n\\n" before a container keeps the real blank line',
  shape(run([{ type: 'text', text: 'a\n\n' }, { type: 'collapse', summary: 'S', open: true, blocks: [] }]).note),
  ['paragraph:a', 'paragraph:', 'section:'],
)
check(
  'a trailing "\\n" is a trailing blank line',
  shape(run([{ type: 'text', text: 'a\n' }]).note),
  ['paragraph:a', 'paragraph:'],
)
check(
  'no trailing blank after a container that ends the note',
  shape(run([{ type: 'collapse', summary: 'S', open: true, blocks: [] }]).note),
  ['section:'],
)
check('an empty note is one empty paragraph', shape(run([]).note), ['paragraph:'])
check(
  'mid-note blank lines survive',
  shape(run([{ type: 'text', text: 'a\n\nb' }]).note),
  ['paragraph:a', 'paragraph:', 'paragraph:b'],
)

console.log('\nmarkers')

check(
  'the U+0020 marker space is stripped',
  shape(run([{ type: 'check', checked: false, text: '' }, { type: 'text', text: ' one' }]).note),
  ['check:one'],
)
check(
  'the U+00A0 marker space is stripped too',
  shape(run([{ type: 'check', checked: false, text: '' }, { type: 'text', text: ' one' }]).note),
  ['check:one'],
)
check(
  'a second space is content and stays',
  shape(run([{ type: 'check', checked: false, text: '' }, { type: 'text', text: '  one' }]).note),
  ['check: one'],
)
check(
  'checked state carries over',
  doc(run([{ type: 'check', checked: true, text: '' }, { type: 'text', text: ' one' }]).note)[0].attrs,
  { checked: true },
)
check(
  'the marker space is taken from after the box, not from before it',
  shape(run([
    { type: 'text', text: ' ' },
    { type: 'check', checked: true, text: '' },
    { type: 'text', text: ' one' },
  ]).note),
  ['check:one'],
)
check(
  'whitespace in front of the box is counted as dropped',
  run([
    { type: 'text', text: ' ' },
    { type: 'check', checked: true, text: '' },
    { type: 'text', text: ' one' },
  ]).encodings.checkSpaceBeforeBox,
  1,
)
check(
  'the bullet prefix becomes a bullet row',
  shape(run([{ type: 'text', text: '• one\n• two' }]).note),
  ['bullet:one', 'bullet:two'],
)
check(
  'a bullet glyph mid-line is not a marker',
  shape(run([{ type: 'text', text: 'see • here' }]).note),
  ['paragraph:see • here'],
)

console.log('\nmarks')

check(
  'underline is dropped and its text kept',
  doc(run([{ type: 'text', text: 'kept', underline: true }]).note)[0].content,
  [{ type: 'text', text: 'kept' }],
)
check(
  'href becomes a link mark',
  doc(run([{ type: 'text', text: 'go', href: 'https://x.test/' }]).note)[0].content,
  [{ type: 'text', text: 'go', marks: [{ type: 'link', attrs: { href: 'https://x.test/' } }] }],
)
check(
  'bold and strike survive together',
  doc(run([{ type: 'text', text: 'x', bold: true, strike: true }]).note)[0].content,
  [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'strike' }] }],
)

console.log('\ncontainers')

const section = run([
  {
    type: 'collapse',
    summary: 'Title',
    open: false,
    blocks: [{ type: 'check', checked: true, text: '' }, { type: 'text', text: ' inside' }],
  },
]).note
check('a collapse becomes a collapsed section', doc(section)[0].attrs, { collapsed: true })
check('the summary becomes the title', doc(section)[0].content?.[0].content, [{ type: 'text', text: 'Title' }])
check('the body keeps its rows', (doc(section)[0].content?.[1].content ?? []).map((n) => n.type), ['check'])
check(
  'an empty section body gets one empty paragraph',
  (doc(run([{ type: 'collapse', summary: 'S', open: true, blocks: [] }]).note)[0].content?.[1].content ?? []).map(
    (n) => n.type,
  ),
  ['paragraph'],
)

const nested = run([
  {
    type: 'collapse',
    summary: 'Outer',
    open: true,
    blocks: [
      { type: 'text', text: 'body' },
      { type: 'collapse', summary: 'Inner', open: true, blocks: [{ type: 'text', text: 'deep' }] },
    ],
  },
]).note
check('a nested section is lifted out after its parent', shape(nested), ['section:', 'section:'])
check(
  'the lifted section keeps its title',
  doc(nested)[1].content?.[0].content,
  [{ type: 'text', text: 'Inner' }],
)
check('lifting is counted', run([
  {
    type: 'collapse',
    summary: 'Outer',
    open: true,
    blocks: [{ type: 'collapse', summary: 'Inner', open: true, blocks: [] }],
  },
]).encodings.lifted, 1)

const quoted = run([{ type: 'quote', blocks: [{ type: 'text', text: 'said' }] }]).note
check('a quote stays a quote', shape(quoted), ['quote:'])
check('the quote keeps its rows', (doc(quoted)[0].content ?? []).map((n) => n.type), ['paragraph'])
check(
  'a quote inside a section body stays there',
  (doc(
    run([
      {
        type: 'collapse',
        summary: 'S',
        open: true,
        blocks: [{ type: 'quote', blocks: [{ type: 'text', text: 'q' }] }],
      },
    ]).note,
  )[0].content?.[1].content ?? []).map((n) => n.type),
  ['quote'],
)

console.log('\nthe envelope')

check('kind is carried through', run([]).note.kind, 'blocks')
check('text is carried through', migrateNote({ kind: 'blocks', text: 'plain', blocks: [] }).note.text, 'plain')
check('v is 2', run([]).note.v, 2)
check('a null note becomes an empty note', shape(migrateNote(null).note), ['paragraph:'])

console.log('\nshapes that must halt the run')

halts('two checkboxes on one line', v1([
  { type: 'check', checked: false, text: '' },
  { type: 'text', text: ' one' },
  { type: 'check', checked: false, text: '' },
  { type: 'text', text: ' two' },
]), 'checkboxes on one line')
halts('real text in front of a checkbox', v1([
  { type: 'text', text: 'words' },
  { type: 'check', checked: false, text: '' },
  { type: 'text', text: ' one' },
]), 'text before the checkbox')
halts('an unknown block type', v1([{ type: 'heading', text: 'x' }]), 'unknown block type')
halts('an unknown key on a text block', v1([{ type: 'text', text: 'x', colour: 'red' }]), 'unknown key "colour"')
halts('an unknown key on the envelope', { kind: 'blocks', blocks: [], extra: 1 }, 'unknown key "extra"')
halts('a check that carries its own text', v1([{ type: 'check', checked: false, text: 'words' }]), 'carries its own text')
halts('a non-boolean checked', v1([{ type: 'check', checked: 'yes', text: '' }]), 'checked is a string')
halts('a collapse without a summary', v1([{ type: 'collapse', open: true, blocks: [] }]), 'summary is')
halts('blocks that is not an array', { kind: 'blocks', blocks: 'nope' }, 'blocks is a string')
halts('a note that is an array', [1, 2], 'expected an object')
halts('an unknown type nested inside a collapse', v1([
  { type: 'collapse', summary: 'S', open: true, blocks: [{ type: 'table', text: '' }] },
]), 'unknown block type')

console.log('')
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
