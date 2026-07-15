// Weekly goals model. Mirrors the prototype's goal system (prototype/app.js):
// activity definitions, per-week manual counters, and the progress/gauge math.
//
// The week state lives in the same localStorage store the Greeting uses
// ('astir.v1'), so it survives the eventual localStorage-to-database migration
// alongside `hasVisited`. Applications come from the backend, so the "apply"
// progress is derived from the live application list rather than a stored copy.

import { type Application, toDateKey } from './applications'

export type ActivityId = 'apply' | 'net' | 'prep' | 'docs' | 'rest'

export type Goal = { id: ActivityId; target: number }

export type WeekManual = {
  net: number
  restAdjust: number
  prep: boolean
  docs: boolean
}

export type Week = {
  goals: Goal[]
  manual: WeekManual
  activityDays: Record<string, Record<string, boolean>>
}

type ActivityInfo = { name: string; type: 'numeric' | 'binary'; deep: string }

// Display + gauge order, matching the prototype's activityOrder.
export const activityOrder: ActivityId[] = ['apply', 'net', 'prep', 'docs', 'rest']

export const numericLimits: Record<string, { min: number; max: number; defaultValue: number }> = {
  apply: { min: 1, max: 15, defaultValue: 5 },
  net: { min: 1, max: 10, defaultValue: 3 },
  rest: { min: 1, max: 4, defaultValue: 2 },
}

export const activity: Record<ActivityId, ActivityInfo> = {
  apply: { name: 'Applications', type: 'numeric', deep: '--gold-deep' },
  net: { name: 'Connecting', type: 'numeric', deep: '--net-deep' },
  rest: { name: 'Rest', type: 'numeric', deep: '--rest-deep' },
  prep: { name: 'Prep', type: 'binary', deep: '--prep-deep' },
  docs: { name: 'Paperwork', type: 'binary', deep: '--docs-deep' },
}

// Info-tooltip copy for the tiles that carry one (from the prototype's
// infoButton copy map). The rest render a disabled, copy-less info glyph.
export const goalInfoCopy: Partial<Record<ActivityId, string>> = {
  apply:
    'We automatically update your weekly application count whenever you log an application with us.',
  net: 'One conversation, one count. Log it when it happens.',
  rest: "When you don't show up here, we will just automatically add it as a rest day.",
}

// --- week boundaries (Monday-based, matching the prototype's startOfWeek) ---

export function startOfWeek(date: Date): Date {
  const copy = new Date(date)
  const offset = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - offset)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date: Date, count: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + count)
  copy.setHours(0, 0, 0, 0)
  return copy
}

// --- persistence (shared 'astir.v1' store) ---

const storageKey = 'astir.v1'

export function emptyWeek(): Week {
  return { goals: [], manual: { net: 0, restAdjust: 0, prep: false, docs: false }, activityDays: {} }
}

function normalizeWeek(raw: unknown): Week {
  const week = emptyWeek()
  if (!raw || typeof raw !== 'object') return week
  const value = raw as Partial<Week> & { manual?: Partial<WeekManual> }
  if (Array.isArray(value.goals)) {
    week.goals = value.goals
      .filter((goal): goal is Goal => Boolean(goal) && activityOrder.includes((goal as Goal).id))
      .map((goal) => ({ id: goal.id, target: Number(goal.target) || 1 }))
  }
  const manual: Partial<WeekManual> = value.manual || {}
  week.manual = {
    net: Number(manual.net) || 0,
    restAdjust: Number(manual.restAdjust) || 0,
    prep: Boolean(manual.prep),
    docs: Boolean(manual.docs),
  }
  if (value.activityDays && typeof value.activityDays === 'object') {
    week.activityDays = value.activityDays
  }
  return week
}

type Store = Record<string, unknown>

function readStore(): Store {
  try {
    return (JSON.parse(window.localStorage.getItem(storageKey) || 'null') as Store) || {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(store))
  } catch {
    // localStorage unavailable; goals fall back to the current session only.
  }
}

export function weekKeyFor(date = new Date()): string {
  return toDateKey(startOfWeek(date))
}

export function readWeek(key: string): Week {
  const weeks = readStore().weeks as Record<string, unknown> | undefined
  return normalizeWeek(weeks ? weeks[key] : undefined)
}

// Persist a week, preserving every other key in the shared store (applications,
// watchlist, hasVisited…). Also mirrors the prototype's `lastGoals` bookmark.
export function writeWeek(key: string, week: Week) {
  const store = readStore()
  const weeks = { ...((store.weeks as Record<string, unknown>) || {}) }
  weeks[key] = week
  store.weeks = weeks
  if (week.goals.length > 0) {
    store.lastGoals = week.goals.map((goal) => ({ id: goal.id, target: goal.target }))
  }
  writeStore(store)
}

// --- progress math ---

export function goalTarget(goal: Goal): number {
  return activity[goal.id].type === 'binary' ? 1 : goal.target
}

export function goalFromId(id: ActivityId): Goal {
  return { id, target: activity[id].type === 'numeric' ? numericLimits[id].defaultValue : 1 }
}

function dayHasApplication(applications: Application[], dateKey: string, todayK: string): boolean {
  return applications.some((application) => (application.appliedDate || todayK) === dateKey)
}

function dayHasManualActivity(week: Week, dateKey: string): boolean {
  const day = week.activityDays[dateKey]
  return Boolean(day && Object.values(day).some(Boolean))
}

// Untouched past days this week count as rest (before today, no application and
// no manual activity logged), plus/minus any manual adjustment.
function inferredRestDays(week: Week, applications: Application[], now: Date): number {
  const weekStart = startOfWeek(now)
  const weekEnd = addDays(weekStart, 6)
  const todayK = toDateKey(now)
  let count = 0
  for (let date = new Date(weekStart); date < now && date <= weekEnd; date = addDays(date, 1)) {
    const key = toDateKey(date)
    if (key !== todayK && !dayHasApplication(applications, key, todayK) && !dayHasManualActivity(week, key)) {
      count += 1
    }
  }
  return count
}

export function applicationsThisWeekCount(applications: Application[], now = new Date()): number {
  const weekStart = toDateKey(startOfWeek(now))
  const weekEnd = toDateKey(addDays(startOfWeek(now), 6))
  const todayK = toDateKey(now)
  return applications.filter((application) => {
    const key = application.appliedDate || todayK
    return key >= weekStart && key <= weekEnd
  }).length
}

export function progressFor(
  id: ActivityId,
  week: Week,
  applications: Application[],
  now = new Date(),
): number {
  if (id === 'apply') return applicationsThisWeekCount(applications, now)
  if (id === 'net') return week.manual.net || 0
  if (id === 'rest') return Math.max(0, inferredRestDays(week, applications, now) + (week.manual.restAdjust || 0))
  if (id === 'prep') return week.manual.prep ? 1 : 0
  if (id === 'docs') return week.manual.docs ? 1 : 0
  return 0
}

// Dash offset for the 126-unit gauge arc, matching the prototype's getStrokeOffset.
export function strokeOffset(progress: number, target: number): number {
  const length = 126
  const fraction = target === 0 ? 0 : Math.min(progress, target) / target
  return length - length * fraction
}

// Apply a stepper +/- to a week's manual counters, mirroring the prototype's
// incrementGoal/decrementGoal (and their markManualDay bookkeeping).
export function applyGoalDelta(week: Week, id: ActivityId, delta: number, todayK: string): Week {
  const manual = { ...week.manual }
  let activityDays = week.activityDays
  const mark = (kind: string, value: boolean) => {
    activityDays = { ...activityDays, [todayK]: { ...(activityDays[todayK] || {}), [kind]: value } }
  }
  if (id === 'net') {
    manual.net = Math.max(0, (manual.net || 0) + delta)
    mark('net', manual.net > 0)
  } else if (id === 'rest') {
    manual.restAdjust = (manual.restAdjust || 0) + delta
  } else if (id === 'prep' || id === 'docs') {
    manual[id] = delta > 0
    mark(id, delta > 0)
  }
  return { ...week, manual, activityDays }
}
