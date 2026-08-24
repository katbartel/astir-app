// Counts the encodings in the Home weekly-goals notes, the ones stored per task
// inside the astir.v1 localStorage object. See docs/notes-editor.md 4.5.
//
// A script cannot read a browser's localStorage, so this takes an export:
//
//   1. Open the app in the browser you actually use, in devtools:
//        copy(localStorage.getItem('astir.v1'))
//      or, to a file:
//        console.log(localStorage.getItem('astir.v1'))
//   2. Save that string to a file, then:
//        node scripts/count-astir-notes.mts --file astir-v1.json
//
// It reads only, writes nothing, and reports exactly the table the Postgres rows
// got, so the localStorage half of the migration is planned on counts rather than
// on an assumption.

import { readFileSync } from 'node:fs'
import {
  addEncodings,
  emptyEncodings,
  isV2,
  migrateNote,
  UnknownNoteShape,
} from '../frontend/src/lib/noteMigration.ts'
import { canonicalDoc } from '../frontend/src/components/applications/noteSchema.ts'

const args = process.argv.slice(2)
const at = args.indexOf('--file')
const file = at >= 0 ? args[at + 1] : ''

if (!file) {
  console.log('Usage: node scripts/count-astir-notes.mts --file <export.json>')
  console.log("Export with: copy(localStorage.getItem('astir.v1')) in devtools.")
  process.exit(1)
}

const raw = readFileSync(file, 'utf8').trim()
// The export is the localStorage string, which is itself JSON. Accept either that
// string or a file that already holds the parsed object.
let store: unknown
try {
  store = JSON.parse(raw)
  if (typeof store === 'string') store = JSON.parse(store)
} catch (error) {
  console.log(`could not parse ${file}: ${String(error)}`)
  process.exit(1)
}

type Found = { where: string; note: unknown }
const found: Found[] = []

/**
 * Walk the whole store rather than assuming a shape. The goals object has moved
 * before, and a note that has drifted somewhere unexpected still needs counting.
 */
function walk(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`))
    return
  }
  const record = value as Record<string, unknown>
  if ('note' in record) found.push({ where: `${path}.note`, note: record.note })
  for (const [key, child] of Object.entries(record)) {
    if (key === 'note') continue
    walk(child, `${path}.${key}`)
  }
}
walk(store, 'astir.v1')

const totals = emptyEncodings()
let nulls = 0
let already = 0
let converted = 0
const halted: { where: string; reason: string; note: unknown }[] = []

for (const entry of found) {
  if (entry.note === null || entry.note === undefined) {
    nulls += 1
    continue
  }
  if (isV2(entry.note)) {
    already += 1
    continue
  }
  try {
    const result = migrateNote(entry.note)
    canonicalDoc(result.note.doc) // proves the schema can hold it
    addEncodings(totals, result.encodings)
    converted += 1
  } catch (error) {
    halted.push({
      where: entry.where,
      reason: error instanceof UnknownNoteShape ? error.message : String(error),
      note: entry.note,
    })
  }
}

const line = (label: string, count: number) => console.log(`  ${String(count).padStart(4)}  ${label}`)

console.log('')
console.log(`astir.v1 notes in ${file}`)
console.log('='.repeat(70))
line('note fields found', found.length)
line('null or missing', nulls)
line('already v2', already)
line('convert cleanly', converted)
line('unrecognised shape', halted.length)

console.log('')
console.log('Encodings found')
console.log('='.repeat(70))
line('checkbox + U+0020 space', totals.checkSpace)
line('checkbox + U+00A0 space', totals.checkNbsp)
line('checkbox with no text', totals.checkBare)
line('checkbox text still starts with a space (preserved)', totals.checkExtraSpace)
line('whitespace in front of the box (dropped)', totals.checkSpaceBeforeBox)
line('bullet "\\u2022\\u0020" prefix', totals.bullet)
line('collapse to section', totals.collapse)
line('quote', totals.quote)
line('underline (dropped)', totals.underline)
line('strike (kept)', totals.strike)
line('href to link mark', totals.href)
line('bold (kept)', totals.bold)
line('italic (kept)', totals.italic)
line('blank rows preserved', totals.blankRow)
line('containers lifted out', totals.lifted)

if (halted.length > 0) {
  console.log('')
  console.log('Unrecognised, one line each. These would render read-only, not migrate.')
  console.log('='.repeat(70))
  for (const entry of halted) {
    console.log(`  ${entry.where}`)
    console.log(`    reason: ${entry.reason}`)
    console.log(`    value:  ${JSON.stringify(entry.note).slice(0, 200)}`)
  }
}

console.log('')
console.log('Nothing was written. This script only reads.')
