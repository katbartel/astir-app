// One-time migration of stored notes from v1 (NoteBlock[]) to v2 (a ProseMirror
// document). See docs/notes-editor.md section 4.
//
//   node scripts/migrate-notes.mts                  dry run, writes nothing
//   node scripts/migrate-notes.mts --snapshot-only  take the snapshot, write no notes
//   node scripts/migrate-notes.mts --write          snapshot, verify, then write
//   node scripts/migrate-notes.mts --dump f.json    dry run against a dump file
//
// Rules this script enforces, not just follows:
//   * Dry run is the default. Writing needs --write.
//   * v1 is never overwritten in place. --write snapshots to a backup table and
//     to a JSON file on disk first, and prints both names before touching a row.
//   * A row whose shape the migration does not recognise stops the whole run.
//     There is no fallback conversion path and there must never be one.
//
// The mapping itself lives in frontend/src/lib/noteMigration.ts, so the app's
// load path and this script cannot disagree about what a v1 note means.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addEncodings,
  emptyEncodings,
  migrateNote,
  UnknownNoteShape,
  type Encodings,
  type StoredNote,
} from '../frontend/src/lib/noteMigration.ts'

type Row = { id: string; company: string; role: string; note: unknown }

const args = process.argv.slice(2)
const flag = (name: string): boolean => args.includes(name)
const value = (name: string, fallback: string): string => {
  const at = args.indexOf(name)
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}

const WRITE = flag('--write')
const SNAPSHOT_ONLY = flag('--snapshot-only')
const CONTAINER = value('--container', 'careerapp_july-db-1')
const DB_USER = value('--user', 'astir')
const DB_NAME = value('--db', 'astir')
const DUMP = args.includes('--dump') ? value('--dump', '') : ''
const OUT_DIR = value('--out', 'scripts/.note-migration')
const COLUMN = Number(value('--column', '56'))
const STAMP = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')

// --- database access ---
// psql through the running container, which is how this repo reads its database
// everywhere else. No new dependency and no credentials in the script.

function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-A', '-t', '-c', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ).trim()
}

function psqlScript(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { encoding: 'utf8', input: sql, maxBuffer: 64 * 1024 * 1024 },
  ).trim()
}

function loadRows(): Row[] {
  if (DUMP) {
    say(`reading ${DUMP}`)
    return JSON.parse(readFileSync(DUMP, 'utf8')) as Row[]
  }
  say(`reading applications from ${CONTAINER}`)
  const json = psql(
    `select coalesce(json_agg(json_build_object('id',id,'company',company,'role',role,'note',note)),'[]')
     from applications where note is not null`,
  )
  return JSON.parse(json) as Row[]
}

// --- output helpers ---

const line = (char = '-') => char.repeat(COLUMN * 2 + 3)
const say = (text: string) => console.log(text)
const head = (text: string) => {
  console.log('')
  console.log(text)
  console.log(line('='))
}

function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    if (raw.length <= width) {
      out.push(raw)
      continue
    }
    for (let at = 0; at < raw.length; at += width) out.push(raw.slice(at, at + width))
  }
  return out
}

function sideBySide(leftTitle: string, left: string, rightTitle: string, right: string): void {
  const l = [leftTitle, line('-').slice(0, COLUMN), ...wrap(left, COLUMN)]
  const r = [rightTitle, line('-').slice(0, COLUMN), ...wrap(right, COLUMN)]
  const rows = Math.max(l.length, r.length)
  for (let index = 0; index < rows; index += 1) {
    const a = (l[index] ?? '').padEnd(COLUMN)
    const b = r[index] ?? ''
    console.log(`${a} | ${b}`)
  }
}

/** A compact one-line-per-row view of a migrated document, easier to scan than JSON. */
function outline(note: StoredNote): string {
  const walk = (nodes: unknown[], depth: number): string[] =>
    nodes.flatMap((raw) => {
      const node = raw as { type: string; attrs?: Record<string, unknown>; content?: unknown[]; text?: string; marks?: { type: string }[] }
      const pad = '  '.repeat(depth)
      if (node.type === 'text') {
        const marks = node.marks?.length ? ` [${node.marks.map((m) => m.type).join(',')}]` : ''
        return [`${pad}"${node.text}"${marks}`]
      }
      const attrs = node.attrs ? ` ${JSON.stringify(node.attrs)}` : ''
      const inlineOnly = (node.content ?? []).every((c) => (c as { type: string }).type === 'text')
      if (inlineOnly) {
        const texts = (node.content ?? []).map((c) => {
          const t = c as { text: string; marks?: { type: string }[] }
          return `"${t.text}"${t.marks?.length ? ` [${t.marks.map((m) => m.type).join(',')}]` : ''}`
        })
        return [`${pad}${node.type}${attrs}${texts.length ? ` ${texts.join(' + ')}` : ' (empty)'}`]
      }
      return [`${pad}${node.type}${attrs}`, ...walk(node.content ?? [], depth + 1)]
    })
  return walk(note.doc.content ?? [], 0).join('\n')
}

// --- the run ---

type Converted = { row: Row; note: StoredNote; encodings: Encodings }
type Failure = { row: Row; reason: string; at: unknown }

const rows = loadRows()
const converted: Converted[] = []
const failures: Failure[] = []
const totals = emptyEncodings()
let nullNotes = 0
let alreadyV2 = 0

for (const row of rows) {
  if (row.note === null || row.note === undefined) {
    nullNotes += 1
    continue
  }
  if ((row.note as { v?: number }).v === 2) {
    alreadyV2 += 1
    continue
  }
  try {
    const result = migrateNote(row.note)
    converted.push({ row, note: result.note, encodings: result.encodings })
    addEncodings(totals, result.encodings)
  } catch (error) {
    if (error instanceof UnknownNoteShape) failures.push({ row, reason: error.message, at: error.at })
    else throw error
  }
}

head(`Note migration, v1 to v2 ${WRITE ? '(WRITE)' : '(dry run)'}`)
say(`rows with a note          ${rows.length}`)
say(`  already v2, skipped     ${alreadyV2}`)
say(`  note is JSON null       ${nullNotes}  (nothing to migrate, left alone)`)
say(`  converted               ${converted.length}`)
say(`  halted on shape         ${failures.length}`)

head('Encodings found')
const report: [string, number][] = [
  ['checkbox + U+0020 space', totals.checkSpace],
  ['checkbox + U+00A0 space', totals.checkNbsp],
  ['checkbox with no text', totals.checkBare],
  ['checkbox text still starts with a space (preserved)', totals.checkExtraSpace],
  ['whitespace in front of the box (dropped)', totals.checkSpaceBeforeBox],
  ['bullet "\\u2022\\u0020" prefix', totals.bullet],
  ['collapse to section', totals.collapse],
  ['quote', totals.quote],
  ['underline (dropped)', totals.underline],
  ['strike (kept)', totals.strike],
  ['href to link mark', totals.href],
  ['bold (kept)', totals.bold],
  ['italic (kept)', totals.italic],
  ['blank rows preserved', totals.blankRow],
  ['containers lifted out', totals.lifted],
]
for (const [label, count] of report) say(`  ${String(count).padStart(4)}  ${label}`)

// Notes that are nothing but empty rows, more than one of them. A single empty
// paragraph is just an empty note and needs no attention; several in a row is a
// note that looks empty, stays empty, and will not show its placeholder, because
// the document is not a single empty paragraph. Faithful to v1 either way.
const blankOnly = converted.filter(
  (c) =>
    (c.note.doc.content ?? []).length > 1 &&
    (c.note.doc.content ?? []).every((node) => node.type === 'paragraph' && !node.content),
)
const emptyNotes = converted.filter((c) => (c.note.doc.content ?? []).length === 1 && !(c.note.doc.content ?? [])[0].content)
say('')
say(`  ${String(emptyNotes.length).padStart(4)}  notes that are simply empty (one empty paragraph, correct)`)
say(`  ${String(blankOnly.length).padStart(4)}  notes that are several blank rows and nothing else`)
for (const c of blankOnly) {
  say(`        ${c.row.company} / ${c.row.role}: ${(c.note.doc.content ?? []).length} blank rows`)
}
say('')
say('Counts are occurrences, not rows. A row can hold several.')
say('astir.v1 task notes are not in this report: a script cannot read a browser\'s')
say('localStorage. That store migrates on load through the same readNote(), and is')
say('written back as v2 on the next save.')

if (failures.length > 0) {
  head(`HALTED: ${failures.length} row(s) matched no known shape`)
  say('Nothing was written. There is no fallback conversion path, so these get')
  say('looked at by hand before the run goes again.')
  for (const failure of failures) {
    console.log('')
    say(`${failure.row.company} / ${failure.row.role}  (id ${failure.row.id})`)
    say(`  reason: ${failure.reason}`)
    say(`  at:     ${JSON.stringify(failure.at)}`)
    say(`  v1:     ${JSON.stringify(failure.row.note)}`)
  }
  process.exit(1)
}

// --- samples ---

const json = (value: unknown) => JSON.stringify(value, null, 1)
const find = (predicate: (c: Converted) => boolean) => converted.find(predicate)
const has = (c: Converted, key: string) => JSON.stringify(c.row.note).includes(`"${key}"`)

// Preference order per sample: the cleanest illustration first, then anything
// that shows the encoding at all. Real data does not always offer a tidy example.
// A row already shown for an earlier sample is not shown again: five samples of
// five different rows says more than the same note five times.
const used = new Set<string>()
const prefer = (...predicates: ((c: Converted) => boolean)[]) => {
  for (const predicate of predicates) {
    const hit = find((c) => !used.has(c.row.id) && predicate(c))
    if (hit) {
      used.add(hit.row.id)
      return hit
    }
  }
  return undefined
}

const plain = (c: Converted) => !has(c, 'collapse') && !has(c, 'quote')

// Nothing in the database uses the v1 bullet, so the bullet mapping would go
// unreviewed. This fixture is the encoding the old editor wrote for one, kept
// here so the conversion can still be looked at. It is clearly labelled as not
// being real data.
const FIXTURES: Record<string, unknown> = {
  '4. the bullet encoding': {
    kind: 'blocks',
    blocks: [
      { type: 'text', text: '• first bullet\n• second bullet\n\nplain line after' },
    ],
  },
}

const samples: [string, Converted | undefined][] = [
  ['1. a collapse becomes a section', prefer((c) => has(c, 'collapse'))],
  [
    '2. a quote stays a quote',
    prefer(
      (c) => has(c, 'quote') && !has(c, 'collapse'),
      (c) => has(c, 'quote'),
    ),
  ],
  [
    '3. the checkbox encoding, marker space stripped',
    prefer(
      (c) => c.encodings.checkNbsp > 0 && plain(c),
      (c) => c.encodings.checkSpace > 0 && plain(c),
      (c) => c.encodings.checkNbsp > 0 || c.encodings.checkSpace > 0,
    ),
  ],
  ['4. the bullet encoding', prefer((c) => c.encodings.bullet > 0)],
  [
    '5. a plain multi-line note',
    prefer(
      (c) => plain(c) && !has(c, 'check') && (c.note.doc.content ?? []).length > 2,
      (c) => plain(c) && !has(c, 'check') && (c.note.doc.content ?? []).length > 1,
    ),
  ],
]

head('Five samples, v1 on the left, v2 on the right')
for (const [label, sample] of samples) {
  console.log('')
  if (!sample) {
    say(`${label}: no row in the database uses this encoding.`)
    const fixture = FIXTURES[label]
    if (!fixture) continue
    say('Shown against a fixture instead, so the conversion is still reviewable.')
    console.log('')
    const result = migrateNote(fixture)
    sideBySide('v1 (fixture, not from the database)', json(fixture), 'v2', json(result.note))
    console.log('')
    say('v2 as rows:')
    say(
      outline(result.note)
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n'),
    )
    continue
  }
  say(`${label}   ${sample.row.company} / ${sample.row.role}`)
  console.log('')
  sideBySide('v1 (stored)', json(sample.row.note), 'v2 (would be written)', json(sample.note))
  console.log('')
  say('v2 as rows:')
  say(
    outline(sample.note)
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  )
}

// --- write ---

if (!WRITE && !SNAPSHOT_ONLY) {
  head('Dry run. Nothing was written.')
  say('Re-run with --write to convert the column, or --snapshot-only to take the')
  say('snapshot without converting anything.')
  process.exit(0)
}

/**
 * Take the snapshot and prove it is usable before anything is written. A snapshot
 * nobody verified is not a safety net, it is a belief about one.
 */
function snapshot(): { backupTable: string; dumpFile: string } {
  if (DUMP) {
    console.log('')
    say('Refusing to snapshot from a dump file: the snapshot must come from the')
    say('database it protects. Drop --dump.')
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const backupTable = `applications_note_v1_${STAMP}`
  const dumpFile = join(OUT_DIR, `note-v1-${STAMP}.json`)
  const plannedFile = join(OUT_DIR, `note-v2-${STAMP}.json`)

  head('Snapshot')
  writeFileSync(dumpFile, JSON.stringify(rows, null, 1))
  say(`  v1 dump      ${dumpFile}`)
  writeFileSync(plannedFile, JSON.stringify(converted.map((c) => ({ id: c.row.id, note: c.note })), null, 1))
  say(`  v2 planned   ${plannedFile}`)
  psqlScript(`create table ${backupTable} as select id, note from applications where note is not null;`)
  say(`  backup table ${backupTable}`)

  say('')
  say('Verifying the snapshot')
  const sourceCount = Number(psql('select count(*) from applications where note is not null'))
  const backupCount = Number(psql(`select count(*) from ${backupTable}`))
  const parsed = JSON.parse(readFileSync(dumpFile, 'utf8')) as Row[]

  const checks: [string, boolean, string][] = [
    ['the dump parses', Array.isArray(parsed), Array.isArray(parsed) ? `an array of ${parsed.length}` : `a ${typeof parsed}`],
    ['the dump holds every row', parsed.length === sourceCount, `${parsed.length} in the dump, ${sourceCount} in the table`],
    ['the backup table holds every row', backupCount === sourceCount, `${backupCount} backed up, ${sourceCount} in the table`],
    ['the rows read are the rows counted', rows.length === sourceCount, `${rows.length} read, ${sourceCount} counted`],
  ]
  let ok = true
  for (const [what, passed, detail] of checks) {
    say(`  ${passed ? 'ok  ' : 'FAIL'}  ${what}  (${detail})`)
    if (!passed) ok = false
  }
  if (!ok) {
    console.log('')
    say('HALTED before writing anything. The snapshot did not verify, so there is')
    say(`no safety net. The backup table ${backupTable} is left in place to inspect.`)
    process.exit(1)
  }
  return { backupTable, dumpFile }
}

const { backupTable, dumpFile } = snapshot()

if (SNAPSHOT_ONLY) {
  head('Snapshot taken. No notes were written.')
  say(`  dump          ${dumpFile}`)
  say(`  backup table  ${backupTable}`)
  say('')
  say('Rollback, if it is ever needed, is one line:')
  say(`  update applications a set note = b.note from ${backupTable} b where a.id = b.id;`)
  process.exit(0)
}

const updates = converted
  .map((c) => {
    const payload = JSON.stringify(c.note).replace(/'/g, "''")
    return `update applications set note = '${payload}'::jsonb where id = '${c.row.id}';`
  })
  .join('\n')

head('Writing')
psqlScript(`begin;\n${updates}\ncommit;`)
say(`  ${converted.length} rows written`)

const remaining = psql(
  `select count(*) from applications where note is not null and (note->>'v') is distinct from '2'`,
)
say(`  rows still not v2: ${remaining}  (JSON-null notes are counted here)`)
head('Done')
say('Rollback, if it is ever needed, is one line:')
say(`  update applications a set note = b.note from ${backupTable} b where a.id = b.id;`)
