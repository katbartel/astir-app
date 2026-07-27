// Client-side model + API for logged applications. Mirrors the prototype's
// application handling (prototype/app.js) against the real backend
// (/api/applications). The backend persists; these helpers are the only place
// the frontend talks to it.

import {
  DEFAULT_STAGE_CATALOG,
  DEFAULT_STAGE_IDS,
  type StageId,
  isPipelineStage,
  normalizeStageId,
  stageColorKey as stageColorKeyForId,
  stageRank as stageRankForId,
  stageVisual,
} from './stages'

export const STATUS_OPTIONS = DEFAULT_STAGE_IDS

export type Status = StageId

// Stages that count as "in motion" and show on the Pipeline screen. Applied
// and Closed sit outside it.
export const PIPELINE_STAGES: Status[] = DEFAULT_STAGE_CATALOG.progress
  .map((stage) => stage.id)
  .concat(['offer', 'hired'])

export type NoteBlock =
  | {
      type: 'text'
      text: string
      bold?: boolean
      italic?: boolean
      underline?: boolean
      strike?: boolean
      href?: string
    }
  | { type: 'check'; checked: boolean; text: string }
  | { type: 'quote'; blocks: NoteBlock[] }
  | { type: 'collapse'; summary: string; open: boolean; blocks: NoteBlock[] }

export type Note = { kind: string; text?: string; blocks: NoteBlock[] }

export type Posting = {
  url: string
  postedAt: string | null
  firstSeenAt: string
  location: string | null
  workMode: string | null
  locations: string[]
}

export type Application = {
  id: string
  listingId: string | null
  company: string
  role: string
  link: string | null
  stageId: StageId
  status: Status
  appliedDate: string
  stageChangedAt: string
  note: Note | null
  posting: Posting | null
}

export type ApplicationInput = {
  listingId?: string | null
  company: string
  role: string
  link?: string
  stageId?: StageId
  status?: Status
  appliedDate: string
  note?: Note | null
}

export function normalizeStatus(status: string | null | undefined): Status {
  return normalizeStageId(status)
}

export function isPipelineStatus(status: string): boolean {
  return isPipelineStage(DEFAULT_STAGE_CATALOG, normalizeStatus(status))
}

export function stageRank(status: string): number {
  return stageRankForId(DEFAULT_STAGE_CATALOG, normalizeStatus(status))
}

// Short key for a status, used as the `data-stage` attribute that drives stage
// colors in the CSS (see the --stage-* tokens). Kept separate from the labels
// so the stored/display names stay untouched.
export function stageColorKey(status: string): string {
  return stageColorKeyForId(normalizeStatus(status))
}

// Progress of a status along the on-track journey (Applied … Hired). Closed
// sits off-track. Drives how far the stage ring fills. Derived from position
// in the ordered list, so it still holds if stages are added or disabled.
export type StageProgress = {
  fraction: number
  state: 'start' | 'progress' | 'done' | 'closed'
}

export function stageProgress(status: string): StageProgress {
  const visual = stageVisual(DEFAULT_STAGE_CATALOG, normalizeStatus(status))
  return {
    fraction: visual.fraction,
    state: visual.state === 'offer' ? 'progress' : visual.state,
  }
}

// Normalize a free-form work mode to one of the three display labels, matching
// the prototype's normalizeMode.
export function normalizeMode(mode: string | null | undefined): string {
  const value = String(mode || 'Remote').toLowerCase()
  if (value.includes('site')) return 'On-site'
  if (value.includes('hybrid')) return 'Hybrid'
  return 'Remote'
}

// One block -> its plain text, recursing through quote/collapse containers.
function blockPlainText(block: NoteBlock): string {
  if (block.type === 'quote') return block.blocks.map(blockPlainText).join('')
  if (block.type === 'collapse') {
    return [block.summary, ...block.blocks.map(blockPlainText)].filter(Boolean).join(' ')
  }
  return block.text || ''
}

// Blocks -> flat text, used to seed the modal textarea.
export function noteText(note: Note | null | undefined): string {
  if (!note) return ''
  if (Array.isArray(note.blocks) && note.blocks.length > 0) {
    return note.blocks.map(blockPlainText).join('')
  }
  return note.text || ''
}

export function noteFromText(text: string): Note {
  const trimmed = text.trim()
  return { kind: 'blocks', text: trimmed, blocks: trimmed ? [{ type: 'text', text: trimmed }] : [] }
}

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return (await response.json()) as T
}

export async function fetchApplications(): Promise<Application[]> {
  const rows = await asJson<Application[]>(await fetch('/api/applications'))
  return rows.map((application) => {
    const stageId = normalizeStageId(application.stageId, application.status)
    return { ...application, stageId, status: stageId }
  })
}

function applicationBody(input: Partial<ApplicationInput>): Partial<ApplicationInput> {
  const body = { ...input }
  if (input.stageId || input.status) {
    body.stageId = normalizeStageId(input.stageId, input.status)
    delete body.status
  }
  return body
}

export async function createApplication(input: ApplicationInput): Promise<Application> {
  return asJson<Application>(
    await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(applicationBody(input)),
    }),
  )
}

export async function updateApplication(
  id: string,
  input: Partial<ApplicationInput>,
): Promise<Application> {
  return asJson<Application>(
    await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(applicationBody(input)),
    }),
  )
}

export async function deleteApplication(id: string): Promise<void> {
  const response = await fetch(`/api/applications/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`Delete failed: ${response.status}`)
  }
}

// --- date helpers (local-time date keys, matching the prototype) ---

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

// Posted-date metadata for watchlist roles and job-board listings: "DD Month"
// (e.g. "09 July"). Missing or unparseable dates show an em-dash.
export function formatPostedDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  return `${day} ${MONTH_NAMES[date.getMonth()]}`
}

// "9 July 2026" — the plain display form used across the tables and cards.
export function plainDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = value.length === 10 ? parseDateKey(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

// "Today" / "Yesterday" / plain date — used on the applied-date trigger.
export function formatDisplayDate(key: string): string {
  const today = todayKey()
  if (key === today) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === toDateKey(yesterday)) return 'Yesterday'
  return plainDate(key)
}

export { MONTH_NAMES }
