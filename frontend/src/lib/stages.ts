'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

export const STAGE_LIMIT = 10

export const STAGE_IDS = {
  applied: 'applied',
  offer: 'offer',
  hired: 'hired',
  closed: 'closed',
} as const

export type StageBucket = 'applying' | 'progress' | 'offer' | 'closed'
export type StageId = string

export type StageRecord = {
  id: StageId
  name: string
  bucket: StageBucket
}

export type StageCatalog = {
  applying: StageRecord
  progress: StageRecord[]
  offer: [StageRecord, StageRecord]
  closed: StageRecord[]
}

export type StageVisual = {
  fraction: number
  state: 'start' | 'progress' | 'offer' | 'done' | 'closed'
}

const STORAGE_KEY = 'astir.stages.v1'

export const DEFAULT_STAGE_CATALOG: StageCatalog = {
  applying: { id: STAGE_IDS.applied, name: 'Applied', bucket: 'applying' },
  progress: [
    { id: 'progress-1', name: '1st stage', bucket: 'progress' },
    { id: 'progress-2', name: '2nd stage', bucket: 'progress' },
    { id: 'progress-3', name: '3rd stage', bucket: 'progress' },
  ],
  offer: [
    { id: STAGE_IDS.offer, name: 'Offer', bucket: 'offer' },
    { id: STAGE_IDS.hired, name: 'Hired', bucket: 'offer' },
  ],
  closed: [{ id: STAGE_IDS.closed, name: 'Closed', bucket: 'closed' }],
}

export const DEFAULT_STAGE_IDS = flattenStages(DEFAULT_STAGE_CATALOG).map((stage) => stage.id)

const LEGACY_LABEL_TO_ID: Record<string, StageId> = {
  applied: STAGE_IDS.applied,
  rejected: STAGE_IDS.closed,
  closed: STAGE_IDS.closed,
  offer: STAGE_IDS.offer,
  hired: STAGE_IDS.hired,
  '1st stage': 'progress-1',
  '2nd stage': 'progress-2',
  '3rd stage': 'progress-3',
}

function cleanName(value: unknown, fallback: string): string {
  const name = typeof value === 'string' ? value.trim() : ''
  return name || fallback
}

function stage(id: StageId, name: string, bucket: StageBucket): StageRecord {
  return { id, name, bucket }
}

export function flattenStages(catalog: StageCatalog): StageRecord[] {
  return [catalog.applying, ...catalog.progress, ...catalog.offer, ...catalog.closed]
}

export function pipelineStageIds(catalog: StageCatalog): StageId[] {
  return [...catalog.progress.map((item) => item.id), STAGE_IDS.offer, STAGE_IDS.hired]
}

export function stageById(catalog: StageCatalog, id: StageId): StageRecord {
  const normalized = normalizeStageId(id)
  const found = flattenStages(catalog).find((item) => item.id === normalized)
  if (found) return found
  if (isClosedStage(normalized)) return catalog.closed[0]
  return catalog.applying
}

export function stageLabel(catalog: StageCatalog, id: StageId): string {
  return stageById(catalog, normalizeStageId(id)).name
}

export function normalizeStageId(stageId?: string | null, legacyStatus?: string | null): StageId {
  const raw = (stageId || legacyStatus || '').trim()
  if (!raw) return STAGE_IDS.applied
  const lower = raw.toLowerCase()
  if (LEGACY_LABEL_TO_ID[lower]) return LEGACY_LABEL_TO_ID[lower]
  if (
    raw === STAGE_IDS.applied ||
    raw === STAGE_IDS.offer ||
    raw === STAGE_IDS.hired ||
    raw === STAGE_IDS.closed ||
    raw.startsWith('progress-') ||
    raw.startsWith('closed-')
  ) {
    return raw
  }
  return STAGE_IDS.applied
}

export function stageRank(catalog: StageCatalog, id: StageId): number {
  const normalized = normalizeStageId(id)
  const rank = flattenStages(catalog).findIndex((stageItem) => stageItem.id === normalized)
  if (rank >= 0) return rank
  if (isClosedStage(normalized)) {
    return flattenStages(catalog).findIndex((stageItem) => stageItem.id === catalog.closed[0].id)
  }
  return 0
}

export function isPipelineStage(catalog: StageCatalog, id: StageId): boolean {
  return pipelineStageIds(catalog).includes(normalizeStageId(id))
}

export function isClosedStage(id: StageId): boolean {
  const normalized = normalizeStageId(id)
  return normalized === STAGE_IDS.closed || normalized.startsWith('closed-')
}

export function stageColorKey(id: StageId): string {
  const normalized = normalizeStageId(id)
  if (normalized === STAGE_IDS.applied) return 'applied'
  if (normalized === STAGE_IDS.offer) return 'offer'
  if (normalized === STAGE_IDS.hired) return 'hired'
  if (isClosedStage(normalized)) return 'closed'
  return 'progress'
}

export function stageVisual(catalog: StageCatalog, id: StageId): StageVisual {
  const normalized = normalizeStageId(id)
  if (normalized === STAGE_IDS.applied) return { fraction: 0, state: 'start' }
  if (normalized === STAGE_IDS.offer) return { fraction: 1, state: 'offer' }
  if (normalized === STAGE_IDS.hired) return { fraction: 1, state: 'done' }
  if (isClosedStage(normalized)) return { fraction: 0, state: 'closed' }

  const index = catalog.progress.findIndex((stageItem) => stageItem.id === normalized)
  const count = catalog.progress.length
  return {
    fraction: index >= 0 && count > 0 ? (index + 1) / (count + 1) : 0,
    state: 'progress',
  }
}

function sanitizeCatalog(input: unknown): StageCatalog {
  const parsed = input as Partial<StageCatalog> | null
  const defaults = DEFAULT_STAGE_CATALOG
  const progressInput = Array.isArray(parsed?.progress) ? parsed.progress : defaults.progress
  const progress = progressInput
    .slice(0, STAGE_LIMIT)
    .map((item, index) => {
      const fallback = defaults.progress[index]?.name ?? `${index + 1} stage`
      const id =
        typeof item?.id === 'string' && item.id.trim()
          ? item.id.trim()
          : `progress-${Date.now()}-${index}`
      return stage(id, cleanName(item?.name, fallback), 'progress')
    })
  const legacyClosed = parsed?.closed as StageRecord | StageRecord[] | undefined
  const closedInput = Array.isArray(legacyClosed)
    ? legacyClosed
    : legacyClosed
      ? [legacyClosed]
      : defaults.closed
  const closed = closedInput
    .slice(0, STAGE_LIMIT)
    .map((item, index) => {
      const fallback = defaults.closed[index]?.name ?? 'Closed'
      const storedId = typeof item?.id === 'string' ? item.id.trim() : ''
      const id = storedId || (index === 0 ? STAGE_IDS.closed : `closed-${Date.now()}-${index}`)
      return stage(id, cleanName(item?.name, fallback), 'closed')
    })

  return {
    applying: stage(
      STAGE_IDS.applied,
      cleanName(parsed?.applying?.name, defaults.applying.name),
      'applying',
    ),
    progress: progress.length > 0 ? progress : [defaults.progress[0]],
    offer: [
      stage(
        STAGE_IDS.offer,
        cleanName(Array.isArray(parsed?.offer) ? parsed.offer[0]?.name : undefined, defaults.offer[0].name),
        'offer',
      ),
      stage(
        STAGE_IDS.hired,
        cleanName(Array.isArray(parsed?.offer) ? parsed.offer[1]?.name : undefined, defaults.offer[1].name),
        'offer',
      ),
    ],
    closed: closed.length > 0 ? closed : [defaults.closed[0]],
  }
}

function readCatalog(): StageCatalog {
  if (typeof window === 'undefined') return DEFAULT_STAGE_CATALOG
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STAGE_CATALOG
    return sanitizeCatalog(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_STAGE_CATALOG
  }
}

const listeners = new Set<() => void>()
let snapshot: StageCatalog = readCatalog()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      snapshot = readCatalog()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot(): StageCatalog {
  return snapshot
}

function getServerSnapshot(): StageCatalog {
  return DEFAULT_STAGE_CATALOG
}

function persist(next: StageCatalog) {
  snapshot = sanitizeCatalog(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // In-memory state still updates if storage is unavailable.
  }
  emit()
}

export type StageConfig = {
  catalog: StageCatalog
  allStages: StageRecord[]
  pipelineStages: StageRecord[]
  isDefault: boolean
  labelFor: (id: StageId) => string
  visualFor: (id: StageId) => StageVisual
  colorFor: (id: StageId) => string
  isPipeline: (id: StageId) => boolean
  rankOf: (id: StageId) => number
  renameStage: (id: StageId, name: string) => void
  addProgressStage: () => StageRecord | null
  removeProgressStage: (id: StageId) => void
  moveProgressStage: (id: StageId, direction: -1 | 1) => void
  reorderProgressStage: (id: StageId, targetId: StageId) => void
  addClosedStage: () => StageRecord | null
  removeClosedStage: (id: StageId) => void
  reorderClosedStage: (id: StageId, targetId: StageId) => void
  reset: () => void
}

export function useStageConfig(): StageConfig {
  const catalog = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    const fresh = readCatalog()
    if (JSON.stringify(fresh) !== JSON.stringify(snapshot)) {
      snapshot = fresh
      emit()
    }
  }, [])

  const allStages = flattenStages(catalog)
  const pipelineStages = allStages.filter((item) => isPipelineStage(catalog, item.id))

  const renameStage = useCallback((id: StageId, name: string) => {
    persist({
      applying:
        id === STAGE_IDS.applied ? { ...snapshot.applying, name } : snapshot.applying,
      progress: snapshot.progress.map((item) => (item.id === id ? { ...item, name } : item)),
      offer: snapshot.offer.map((item) => (item.id === id ? { ...item, name } : item)) as [
        StageRecord,
        StageRecord,
      ],
      closed: snapshot.closed.map((item) => (item.id === id ? { ...item, name } : item)),
    })
  }, [])

  const addProgressStage = useCallback(() => {
    if (snapshot.progress.length >= STAGE_LIMIT) return null
    const next = stage(`progress-${Date.now()}`, '', 'progress')
    persist({ ...snapshot, progress: [...snapshot.progress, next] })
    return next
  }, [])

  const removeProgressStage = useCallback((id: StageId) => {
    if (snapshot.progress.length <= 1) return
    persist({ ...snapshot, progress: snapshot.progress.filter((item) => item.id !== id) })
  }, [])

  const moveProgressStage = useCallback((id: StageId, direction: -1 | 1) => {
    const index = snapshot.progress.findIndex((item) => item.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= snapshot.progress.length) return
    const progress = [...snapshot.progress]
    const [item] = progress.splice(index, 1)
    progress.splice(nextIndex, 0, item)
    persist({ ...snapshot, progress })
  }, [])

  const reorderProgressStage = useCallback((id: StageId, targetId: StageId) => {
    const from = snapshot.progress.findIndex((item) => item.id === id)
    const to = snapshot.progress.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const progress = [...snapshot.progress]
    const [item] = progress.splice(from, 1)
    progress.splice(to, 0, item)
    persist({ ...snapshot, progress })
  }, [])

  const addClosedStage = useCallback(() => {
    if (snapshot.closed.length >= STAGE_LIMIT) return null
    const next = stage(`closed-${Date.now()}`, '', 'closed')
    persist({ ...snapshot, closed: [...snapshot.closed, next] })
    return next
  }, [])

  const removeClosedStage = useCallback((id: StageId) => {
    if (snapshot.closed.length <= 1) return
    persist({ ...snapshot, closed: snapshot.closed.filter((item) => item.id !== id) })
  }, [])

  const reorderClosedStage = useCallback((id: StageId, targetId: StageId) => {
    const from = snapshot.closed.findIndex((item) => item.id === id)
    const to = snapshot.closed.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const closed = [...snapshot.closed]
    const [item] = closed.splice(from, 1)
    closed.splice(to, 0, item)
    persist({ ...snapshot, closed })
  }, [])

  const reset = useCallback(() => persist(DEFAULT_STAGE_CATALOG), [])

  return {
    catalog,
    allStages,
    pipelineStages,
    isDefault: JSON.stringify(catalog) === JSON.stringify(DEFAULT_STAGE_CATALOG),
    labelFor: (id) => stageLabel(catalog, id),
    visualFor: (id) => stageVisual(catalog, id),
    colorFor: stageColorKey,
    isPipeline: (id) => isPipelineStage(catalog, id),
    rankOf: (id) => stageRank(catalog, id),
    renameStage,
    addProgressStage,
    removeProgressStage,
    moveProgressStage,
    reorderProgressStage,
    addClosedStage,
    removeClosedStage,
    reorderClosedStage,
    reset,
  }
}
