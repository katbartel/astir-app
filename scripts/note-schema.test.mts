// Proves the notes schema enforces what docs/notes-editor.md says it enforces,
// and that step 3's migration output is valid against it.
//
//   node scripts/note-schema.test.mts [--dump scripts/.note-migration/note-v1-*.json]
//
// The point of these checks is not that the code works. It is that the structural
// invariants are the schema's job, so they hold without anyone remembering them.

import { readFileSync, readdirSync } from 'node:fs'
import { noteSchema } from '../frontend/src/components/applications/noteSchema.ts'
import { migrateNote } from '../frontend/src/lib/noteMigration.ts'
import { Node as PmNode } from '@tiptap/pm/model'

const schema = noteSchema()

let passed = 0
let failed = 0

const ok = (name: string) => {
  passed += 1
  console.log(`  ok    ${name}`)
}
const bad = (name: string, detail: string) => {
  failed += 1
  console.log(`  FAIL  ${name}`)
  console.log(`        ${detail}`)
}
const is = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) ok(name)
  else bad(name, `expected ${b}, got ${a}`)
}

/** Building this must succeed. */
const allows = (name: string, build: () => unknown) => {
  try {
    build()
    ok(name)
  } catch (error) {
    bad(name, `threw ${String(error)}`)
  }
}

/** Building this must be impossible. A schema that merely discourages is not one. */
const forbids = (name: string, build: () => unknown) => {
  try {
    build()
    bad(name, 'the schema allowed it')
  } catch {
    ok(name)
  }
}

const t = (text: string) => schema.text(text)
const node = (type: string, attrs: Record<string, unknown> | null, content: unknown[] = []) =>
  schema.nodes[type].createChecked(attrs, content as never)
const para = (text = 'x') => node('paragraph', null, [t(text)])
const title = (text = 'T') => node('sectionTitle', null, [t(text)])
const body = (content: unknown[] = [para()]) => node('sectionBody', null, content)
const section = (content = [title(), body()]) => node('section', { collapsed: false }, content)

console.log('\nthe node and mark sets are exactly what the spec lists')

is(
  'nodes',
  Object.keys(schema.nodes).sort(),
  ['bullet', 'check', 'doc', 'hardBreak', 'paragraph', 'quote', 'section', 'sectionBody', 'sectionTitle', 'text'],
)
is('marks', Object.keys(schema.marks).sort(), ['bold', 'italic', 'link', 'strike'])
is('no underline mark', schema.marks.underline, undefined)
for (const banned of ['heading', 'codeBlock', 'code', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule']) {
  is(`no ${banned} node`, schema.nodes[banned], undefined)
}

console.log('\ngroups')

is('paragraph is a row and a block', [schema.nodes.paragraph.isInGroup('row'), schema.nodes.paragraph.isInGroup('block')], [true, true])
is('check is a row and a block', [schema.nodes.check.isInGroup('row'), schema.nodes.check.isInGroup('block')], [true, true])
is('bullet is a row and a block', [schema.nodes.bullet.isInGroup('row'), schema.nodes.bullet.isInGroup('block')], [true, true])
is('quote is a block but not a row', [schema.nodes.quote.isInGroup('row'), schema.nodes.quote.isInGroup('block')], [false, true])
is('section is in no group', [schema.nodes.section.isInGroup('row'), schema.nodes.section.isInGroup('block')], [false, false])

console.log('\nwhat the document accepts')

allows('a paragraph at top level', () => node('doc', null, [para()]))
allows('a section at top level', () => node('doc', null, [section()]))
allows('a quote at top level', () => node('doc', null, [node('quote', null, [para()])]))
allows('a check and a bullet at top level', () => node('doc', null, [node('check', { checked: true }, [t('a')]), node('bullet', null, [t('b')])]))
forbids('an empty document', () => node('doc', null, []))
forbids('a bare sectionTitle at top level', () => node('doc', null, [title()]))
forbids('a bare sectionBody at top level', () => node('doc', null, [body()]))

console.log('\nsections never nest, and it is the schema that says so')

forbids('a section inside a section body', () => body([section()]))
forbids('a section inside a quote', () => node('quote', null, [section()]))
forbids('a section nested via the document', () => node('section', { collapsed: false }, [title(), body([section()])]))
allows('a quote inside a section body', () => body([node('quote', null, [para()])]))
allows('a check inside a section body', () => body([node('check', { checked: false }, [t('a')])]))

console.log('\nquotes never nest')

forbids('a quote inside a quote', () => node('quote', null, [node('quote', null, [para()])]))
allows('rows inside a quote', () => node('quote', null, [para(), node('check', { checked: false }, [t('a')])]))

console.log('\none marker per row is a type, not a rule')

forbids('a check inside a check', () => node('check', { checked: false }, [node('check', { checked: false }, [t('a')])]))
forbids('a bullet inside a check', () => node('check', { checked: false }, [node('bullet', null, [t('a')])]))
forbids('a paragraph inside a paragraph', () => node('paragraph', null, [para()]))
allows('inline content inside a check', () => node('check', { checked: false }, [t('a')]))

console.log('\nthe section shape')

forbids('a section with no body', () => node('section', { collapsed: false }, [title()]))
forbids('a section with no title', () => node('section', { collapsed: false }, [body()]))
forbids('a section with the parts swapped', () => node('section', { collapsed: false }, [body(), title()]))
forbids('an empty section body', () => node('sectionBody', null, []))
allows('an empty title', () => node('sectionTitle', null, []))
allows('a body of one empty paragraph', () => node('sectionBody', null, [schema.nodes.paragraph.createChecked(null)]))
is('collapsed defaults to false', section().attrs.collapsed, false)
allows('a collapsed section', () => node('section', { collapsed: true }, [title(), body()]))

console.log('\nmarks and inline content')

allows('bold on text in a check', () => node('check', { checked: false }, [schema.text('a', [schema.marks.bold.create()])]))
allows('a link with an href', () =>
  node('paragraph', null, [schema.text('go', [schema.marks.link.create({ href: 'https://x.test/' })])]),
)
allows('a hard break inside a row', () => node('paragraph', null, [t('a'), schema.nodes.hardBreak.create(), t('b')]))
allows('a hard break inside a section title', () => node('sectionTitle', null, [t('a'), schema.nodes.hardBreak.create()]))
is('the link mark is not inclusive, so typing after a link is unmarked', schema.marks.link.spec.inclusive, false)

console.log('\nempty rows are real nodes')

allows('an empty paragraph', () => schema.nodes.paragraph.createChecked(null))
allows('an empty check', () => schema.nodes.check.createChecked({ checked: false }))
allows('an empty bullet', () => schema.nodes.bullet.createChecked(null))
is('an empty paragraph has a node size of 2, so it occupies a position', schema.nodes.paragraph.createChecked(null).nodeSize, 2)

console.log('\nstep 3 output is valid step 4 input')

// Every migrated row must parse as a document and pass ProseMirror's own content
// check. This is the join between the migration and the schema: if the mapping
// ever emits something the schema cannot hold, it fails here rather than in front
// of Kate.
/** The newest snapshot taken by migrate-notes.mts, unless one is named. */
function findLatestDump(): string | null {
  const dir = 'scripts/.note-migration'
  try {
    const files = readdirSync(dir)
      .filter((name) => name.startsWith('note-v1-') && name.endsWith('.json'))
      .sort()
    return files.length > 0 ? `${dir}/${files[files.length - 1]}` : null
  } catch {
    return null
  }
}

const dumpArg = process.argv.indexOf('--dump')
const dumpPath = dumpArg >= 0 ? process.argv[dumpArg + 1] : findLatestDump()

if (!dumpPath) {
  console.log('  skip  no dump found; pass --dump <file> to check real rows')
} else {
  type Row = { id: string; company: string; role: string; note: unknown }
  const rows = JSON.parse(readFileSync(dumpPath, 'utf8')) as Row[]
  let checked = 0
  let broke = 0
  for (const row of rows) {
    if (row.note === null || row.note === undefined) continue
    const { note } = migrateNote(row.note)
    try {
      const doc = PmNode.fromJSON(schema, note.doc)
      doc.check()
      checked += 1
    } catch (error) {
      broke += 1
      bad(`${row.company} / ${row.role}`, String(error))
    }
  }
  if (broke === 0) ok(`all ${checked} migrated rows from ${dumpPath} are schema-valid`)
}

console.log('')
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
