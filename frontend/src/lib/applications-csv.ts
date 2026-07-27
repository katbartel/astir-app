// CSV import/export for logged applications, so people can move data in and
// out of the spreadsheets they used before. Export includes read-only posting
// columns (Location/Type/Posted); import only maps the fields the create API
// accepts (company, role, stage, link, applied date, note).

import {
  type Application,
  type ApplicationInput,
  type Status,
  normalizeMode,
  normalizeStatus,
  noteFromText,
  noteText,
  plainDate,
  toDateKey,
  todayKey,
} from './applications'
import { DEFAULT_STAGE_CATALOG, STAGE_IDS, flattenStages, stageLabel } from './stages'

const EXPORT_COLUMNS = [
  'Company',
  'Role',
  'Stage',
  'Link',
  'Location',
  'Type',
  'Posted',
  'Applied',
  'Note',
] as const

type CsvColumnKey = 'company' | 'role' | 'status' | 'link' | 'appliedDate' | 'note'

// Header aliases so a hand-kept spreadsheet doesn't have to match our labels
// exactly. Matched case-insensitively against the trimmed header cell.
const HEADER_ALIASES: Record<CsvColumnKey, string[]> = {
  company: ['company', 'employer', 'organisation', 'organization'],
  role: ['role', 'position', 'title', 'job title', 'job'],
  status: ['stage', 'status'],
  link: ['link', 'url', 'job link', 'job url', 'posting', 'posting url'],
  appliedDate: ['applied', 'applied date', 'date applied', 'applied on', 'date'],
  note: ['note', 'notes', 'comment', 'comments'],
}

function csvCell(value: string | null | undefined): string {
  const text = value ?? ''
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function applicationsToCsv(applications: Application[]): string {
  const lines = [EXPORT_COLUMNS.map(csvCell).join(',')]
  for (const application of applications) {
    const cells = [
      application.company,
      application.role,
      stageLabel(DEFAULT_STAGE_CATALOG, normalizeStatus(application.status)),
      application.link ?? application.posting?.url ?? '',
      application.posting?.location ?? '',
      application.posting?.workMode ? normalizeMode(application.posting.workMode) : '',
      plainDate(application.posting?.postedAt),
      plainDate(application.appliedDate),
      noteText(application.note),
    ]
    lines.push(cells.map(csvCell).join(','))
  }
  return lines.join('\r\n')
}

// Split raw CSV text into a grid of cells. Handles quoted fields, escaped
// quotes (""), and CRLF/LF line endings; strips a leading BOM.
export function parseCsv(input: string): string[][] {
  let text = input
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\r') {
      // handled by the following \n (or ignored for lone CR)
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop fully blank rows (trailing newline, empty spacer rows).
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

// Match a spreadsheet's stage text to one of our stages, case-insensitively,
// with a few common synonyms folded into "Closed". Unknown values fall back to
// normalizeStatus (which defaults to "Applied").
function csvStatus(raw: string): Status {
  const value = raw.trim().toLowerCase()
  if (!value) return STAGE_IDS.applied
  const exact = flattenStages(DEFAULT_STAGE_CATALOG).find((option) => option.name.toLowerCase() === value)
  if (exact) return exact.id
  if (['rejected', 'declined', 'withdrawn', 'archived'].includes(value)) return STAGE_IDS.closed
  return normalizeStatus(raw)
}

// Accept our own YYYY-MM-DD keys plus whatever Date can parse (e.g. "9 July
// 2026", "07/09/2026"). Returns null when the cell is empty/unparseable so the
// caller can fall back to today.
function toDateKeyLenient(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : toDateKey(parsed)
}

// Placeholder for a required field the CSV didn't provide. We still import the
// row so nothing silently disappears; the user edits the em dash out later.
const MISSING = '—'

export type CsvImportResult = {
  rows: ApplicationInput[]
  incomplete: number
  skipped: number
}

// Turn CSV text into create-ready inputs. A row missing a company or role is
// still imported (the missing field becomes an em dash) and counted as
// incomplete; only a row with neither is dropped as having no application.
export function parseApplicationsCsv(text: string): CsvImportResult {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], incomplete: 0, skipped: 0 }

  const header = table[0].map((cell) => cell.trim().toLowerCase())
  const columnIndex = (key: CsvColumnKey): number => {
    for (const alias of HEADER_ALIASES[key]) {
      const index = header.indexOf(alias)
      if (index >= 0) return index
    }
    return -1
  }

  const indices = {
    company: columnIndex('company'),
    role: columnIndex('role'),
    status: columnIndex('status'),
    link: columnIndex('link'),
    appliedDate: columnIndex('appliedDate'),
    note: columnIndex('note'),
  }

  const cellAt = (cells: string[], index: number): string =>
    index >= 0 && index < cells.length ? cells[index].trim() : ''

  const rows: ApplicationInput[] = []
  let incomplete = 0
  let skipped = 0

  for (const cells of table.slice(1)) {
    const company = cellAt(cells, indices.company)
    const role = cellAt(cells, indices.role)
    // Neither field present: there's no application here, so drop it silently.
    if (!company && !role) {
      skipped += 1
      continue
    }
    if (!company || !role) incomplete += 1
    const note = cellAt(cells, indices.note)
    rows.push({
      company: company || MISSING,
      role: role || MISSING,
      status: csvStatus(cellAt(cells, indices.status)),
      link: cellAt(cells, indices.link) || undefined,
      appliedDate: toDateKeyLenient(cellAt(cells, indices.appliedDate)) ?? todayKey(),
      note: note ? noteFromText(note) : undefined,
    })
  }

  return { rows, incomplete, skipped }
}
