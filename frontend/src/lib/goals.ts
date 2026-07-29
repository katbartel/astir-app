// Weekly goals model. Mirrors the prototype's goal system (prototype/app.js):
// activity definitions, per-week manual counters, and the progress/gauge math.
//
// The week state lives in the same localStorage store the Greeting uses
// ('astir.v1'), so it survives the eventual localStorage-to-database migration
// alongside `hasVisited`. Applications come from the backend, so the "apply"
// progress is derived from the live application list rather than a stored copy.

import { type Application, type Note, toDateKey } from './applications'

export type ActivityId = 'apply' | 'net' | 'prep' | 'docs' | 'rest'

export type Goal = { id: ActivityId; target: number }

// A step under a task. Steps never count toward the arc (see the build spec);
// they are private scaffolding for the task, like the note.
export type Step = { id: string; text: string; done: boolean }

// One entry in a task tile's checklist. Only `done` moves the arc; the note and
// steps are memory that never touch the count.
export type Task = {
  id: string
  text: string
  done: boolean
  note: Note | null
  steps: Step[]
}

// The three tiles whose progress is driven by an editable task checklist.
// Applications is a record tile and Rest is inferred, so neither stores tasks.
export type TaskTileId = 'net' | 'prep' | 'docs'
export const taskTileIds: TaskTileId[] = ['net', 'prep', 'docs']

export type WeekTasks = Record<TaskTileId, Task[]>

export type WeekManual = {
  net: number
  restAdjust: number
  prep: boolean
  docs: boolean
}

export type Week = {
  goals: Goal[]
  manual: WeekManual
  tasks: WeekTasks
  activityDays: Record<string, Record<string, boolean>>
}

type ActivityInfo = { name: string; type: 'numeric' | 'binary'; deep: string }

// Display + gauge order, matching the prototype's activityOrder.
export const activityOrder: ActivityId[] = ['apply', 'net', 'prep', 'docs', 'rest']

export const numericLimits: Record<string, { min: number; max: number; defaultValue: number }> = {
  apply: { min: 1, max: 15, defaultValue: 5 },
  net: { min: 1, max: 10, defaultValue: 3 },
  prep: { min: 1, max: 7, defaultValue: 1 },
  docs: { min: 1, max: 7, defaultValue: 1 },
  rest: { min: 1, max: 4, defaultValue: 2 },
}

export const activity: Record<ActivityId, ActivityInfo> = {
  apply: { name: 'Applications', type: 'numeric', deep: '--gold-deep' },
  net: { name: 'Connecting', type: 'numeric', deep: '--net-deep' },
  rest: { name: 'Rest', type: 'numeric', deep: '--rest-deep' },
  // Prep and Paperwork are count-up task checklists (like Connecting), each with
  // its own target; they used to be single done/not-done toggles.
  prep: { name: 'Prep', type: 'numeric', deep: '--prep-deep' },
  docs: { name: 'Paperwork', type: 'numeric', deep: '--docs-deep' },
}

// Header shown at the top of each tile's detail panel.
export const goalHeadCopy: Record<ActivityId, string> = {
  apply: 'Applied this week',
  net: 'Reaching out',
  prep: 'Preparing',
  docs: 'Documents',
  rest: 'Rest days',
}

// Empty-state invitation for each task checklist.
export const taskInviteCopy: Record<TaskTileId, string> = {
  net: 'Add someone you want to reach.',
  prep: 'Add something to prepare.',
  docs: 'Add a document task when one comes up.',
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

export function emptyTasks(): WeekTasks {
  return { net: [], prep: [], docs: [] }
}

export function emptyWeek(): Week {
  return {
    goals: [],
    manual: { net: 0, restAdjust: 0, prep: false, docs: false },
    tasks: emptyTasks(),
    activityDays: {},
  }
}

// Unique id for a task or step. crypto.randomUUID is present in every browser we
// target; the fallback keeps ids working in the rare context that lacks it.
function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
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
  week.tasks = normalizeTasks((value as { tasks?: unknown }).tasks)
  if (value.activityDays && typeof value.activityDays === 'object') {
    week.activityDays = value.activityDays
  }
  return week
}

function normalizeStep(raw: unknown): Step | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<Step>
  if (typeof value.text !== 'string') return null
  return { id: typeof value.id === 'string' ? value.id : newId(), text: value.text, done: Boolean(value.done) }
}

function normalizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<Task> & { note?: unknown }
  if (typeof value.text !== 'string') return null
  const note =
    value.note && typeof value.note === 'object' ? (value.note as Note) : null
  const steps = Array.isArray(value.steps)
    ? value.steps.map(normalizeStep).filter((step): step is Step => step !== null)
    : []
  return {
    id: typeof value.id === 'string' ? value.id : newId(),
    text: value.text,
    done: Boolean(value.done),
    note,
    steps,
  }
}

function normalizeTasks(raw: unknown): WeekTasks {
  const tasks = emptyTasks()
  if (!raw || typeof raw !== 'object') return tasks
  const value = raw as Partial<Record<TaskTileId, unknown>>
  for (const tile of taskTileIds) {
    const list = value[tile]
    if (Array.isArray(list)) {
      tasks[tile] = list.map(normalizeTask).filter((task): task is Task => task !== null)
    }
  }
  return tasks
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

// --- week rollover (silent Monday transition, see the build spec §8) ---

// Build the new week from the previous one: open loops carry, closed loops
// release. Targets carry as this week's defaults; unchecked tasks carry over
// with their notes and steps; done tasks are dropped; the manual counters and
// the fresh week's rest bookkeeping reset. Arcs recompute from zero.
export function rolloverFrom(previous: Week): Week {
  const week = emptyWeek()
  week.goals = previous.goals.map((goal) => ({ id: goal.id, target: goal.target }))
  for (const tile of taskTileIds) {
    week.tasks[tile] = previous.tasks[tile]
      .filter((task) => !task.done)
      .map((task) => ({
        id: task.id,
        text: task.text,
        done: false,
        note: task.note,
        steps: task.steps.map((step) => ({ ...step })),
      }))
  }
  return week
}

// Read this week's state, applying the rollover the first time the week is seen.
// If the week has already been started, return it as stored. Otherwise seed it
// from the most recent prior week and persist that seed so the carry is stable
// (and further reads are plain). Falls back to an empty week with no history.
export function readCurrentWeek(key: string): Week {
  const store = readStore()
  const weeks = (store.weeks as Record<string, unknown>) || {}
  if (weeks[key]) return normalizeWeek(weeks[key])
  const priorKey = Object.keys(weeks)
    .filter((candidate) => candidate < key)
    .sort()
    .pop()
  if (!priorKey) return emptyWeek()
  const rolled = rolloverFrom(normalizeWeek(weeks[priorKey]))
  if (rolled.goals.length === 0) return emptyWeek()
  writeWeek(key, rolled)
  return rolled
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

export function applicationsThisWeek(applications: Application[], now = new Date()): Application[] {
  const weekStart = toDateKey(startOfWeek(now))
  const weekEnd = toDateKey(addDays(startOfWeek(now), 6))
  const todayK = toDateKey(now)
  return applications.filter((application) => {
    const key = application.appliedDate || todayK
    return key >= weekStart && key <= weekEnd
  })
}

export function applicationsThisWeekCount(applications: Application[], now = new Date()): number {
  return applicationsThisWeek(applications, now).length
}

// Weekday labels (Monday, Tuesday…) for the days this week already inferred as
// rest, for the Rest panel's chips. The manual +/- baseline is not reflected
// here; it only nudges the numeric total on the gauge.
export function inferredRestDayLabels(week: Week, applications: Application[], now = new Date()): string[] {
  const weekStart = startOfWeek(now)
  const weekEnd = addDays(weekStart, 6)
  const todayK = toDateKey(now)
  const labels: string[] = []
  for (let date = new Date(weekStart); date < now && date <= weekEnd; date = addDays(date, 1)) {
    const key = toDateKey(date)
    if (key !== todayK && !dayHasApplication(applications, key, todayK) && !dayHasManualActivity(week, key)) {
      labels.push(date.toLocaleDateString(undefined, { weekday: 'long' }))
    }
  }
  return labels
}

export function progressFor(
  id: ActivityId,
  week: Week,
  applications: Application[],
  now = new Date(),
): number {
  if (id === 'apply') return applicationsThisWeekCount(applications, now)
  if (id === 'rest') return Math.max(0, inferredRestDays(week, applications, now) + (week.manual.restAdjust || 0))
  // net/prep/docs count the tasks checked done this week (never the steps).
  return week.tasks[id].filter((task) => task.done).length
}

// Dash offset for the 126-unit gauge arc, matching the prototype's getStrokeOffset.
export function strokeOffset(progress: number, target: number): number {
  const length = 126
  const fraction = target === 0 ? 0 : Math.min(progress, target) / target
  return length - length * fraction
}

// Rest is the one tile still driven by a manual +/-: it keeps an inferred-days
// baseline that the user can nudge up or down. The other tiles moved to task
// checklists, so their manual counters are no longer stepped here.
export function adjustRest(week: Week, delta: number): Week {
  return { ...week, manual: { ...week.manual, restAdjust: (week.manual.restAdjust || 0) + delta } }
}

// --- task mutations (Connecting / Prep / Paperwork) ---

function mapTile(week: Week, tile: TaskTileId, fn: (list: Task[]) => Task[]): Week {
  return { ...week, tasks: { ...week.tasks, [tile]: fn(week.tasks[tile]) } }
}

function mapTask(week: Week, tile: TaskTileId, taskId: string, fn: (task: Task) => Task): Week {
  return mapTile(week, tile, (list) => list.map((task) => (task.id === taskId ? fn(task) : task)))
}

export function addTask(week: Week, tile: TaskTileId, text: string): Week {
  const clean = text.trim()
  if (!clean) return week
  return mapTile(week, tile, (list) => [
    ...list,
    { id: newId(), text: clean, done: false, note: null, steps: [] },
  ])
}

export function removeTask(week: Week, tile: TaskTileId, taskId: string): Week {
  return mapTile(week, tile, (list) => list.filter((task) => task.id !== taskId))
}

// Toggle a task done. Record today as an active day for the tile so a day with
// completed tasks is not later counted as an (untouched) rest day.
export function toggleTask(week: Week, tile: TaskTileId, taskId: string, todayK: string): Week {
  const next = mapTask(week, tile, taskId, (task) => ({ ...task, done: !task.done }))
  const anyDone = next.tasks[tile].some((task) => task.done)
  const day = { ...(next.activityDays[todayK] || {}), [tile]: anyDone }
  return { ...next, activityDays: { ...next.activityDays, [todayK]: day } }
}

export function setTaskText(week: Week, tile: TaskTileId, taskId: string, text: string): Week {
  return mapTask(week, tile, taskId, (task) => ({ ...task, text }))
}

export function setTaskNote(week: Week, tile: TaskTileId, taskId: string, note: Note | null): Week {
  return mapTask(week, tile, taskId, (task) => ({ ...task, note }))
}

export function addStep(week: Week, tile: TaskTileId, taskId: string, text: string): Week {
  const clean = text.trim()
  if (!clean) return week
  return mapTask(week, tile, taskId, (task) => ({
    ...task,
    steps: [...task.steps, { id: newId(), text: clean, done: false }],
  }))
}

export function toggleStep(week: Week, tile: TaskTileId, taskId: string, stepId: string): Week {
  return mapTask(week, tile, taskId, (task) => ({
    ...task,
    steps: task.steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step)),
  }))
}

export function removeStep(week: Week, tile: TaskTileId, taskId: string, stepId: string): Week {
  return mapTask(week, tile, taskId, (task) => ({
    ...task,
    steps: task.steps.filter((step) => step.id !== stepId),
  }))
}
