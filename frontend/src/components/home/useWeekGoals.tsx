'use client'

import { useCallback, useEffect, useState } from 'react'
import { todayKey } from '@/lib/applications'
import { type Note } from '@/lib/applications'
import {
  type Goal,
  type TaskTileId,
  type Week,
  addStep,
  addTask,
  adjustRest,
  emptyWeek,
  readCurrentWeek,
  removeStep,
  removeTask,
  setTaskNote,
  toggleStep,
  toggleTask,
  weekKeyFor,
  writeWeek,
} from '@/lib/goals'

// Owns this week's goal state. Starts empty on the server and first client
// render (so hydration matches, same as the Greeting), then hydrates from
// localStorage and persists every mutation back to the shared store.
export function useWeekGoals() {
  const [week, setWeek] = useState<Week>(emptyWeek)
  const [key, setKey] = useState('')

  useEffect(() => {
    const currentKey = weekKeyFor()
    setKey(currentKey)
    setWeek(readCurrentWeek(currentKey))
  }, [])

  const mutate = useCallback(
    (next: (current: Week) => Week) => {
      setWeek((current) => {
        const updated = next(current)
        if (key) writeWeek(key, updated)
        return updated
      })
    },
    [key],
  )

  const setGoals = useCallback(
    (goals: Goal[]) => {
      mutate((current) => ({ ...current, goals }))
    },
    [mutate],
  )

  // Rest keeps its manual +/- (nudges the inferred-days baseline).
  const stepRest = useCallback((delta: number) => mutate((current) => adjustRest(current, delta)), [mutate])

  // Task-checklist operations for the Connecting / Prep / Paperwork tiles.
  const tasks = {
    add: useCallback(
      (tile: TaskTileId, text: string) => mutate((current) => addTask(current, tile, text)),
      [mutate],
    ),
    remove: useCallback(
      (tile: TaskTileId, taskId: string) => mutate((current) => removeTask(current, tile, taskId)),
      [mutate],
    ),
    toggle: useCallback(
      (tile: TaskTileId, taskId: string) => mutate((current) => toggleTask(current, tile, taskId, todayKey())),
      [mutate],
    ),
    setNote: useCallback(
      (tile: TaskTileId, taskId: string, note: Note | null) =>
        mutate((current) => setTaskNote(current, tile, taskId, note)),
      [mutate],
    ),
    addStep: useCallback(
      (tile: TaskTileId, taskId: string, text: string) =>
        mutate((current) => addStep(current, tile, taskId, text)),
      [mutate],
    ),
    toggleStep: useCallback(
      (tile: TaskTileId, taskId: string, stepId: string) =>
        mutate((current) => toggleStep(current, tile, taskId, stepId)),
      [mutate],
    ),
    removeStep: useCallback(
      (tile: TaskTileId, taskId: string, stepId: string) =>
        mutate((current) => removeStep(current, tile, taskId, stepId)),
      [mutate],
    ),
  }

  return { week, setGoals, stepRest, tasks }
}
