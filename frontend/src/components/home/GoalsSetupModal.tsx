'use client'

import { useState } from 'react'
import {
  type ActivityId,
  type Goal,
  activity,
  activityOrder,
  goalFromId,
  numericLimits,
} from '@/lib/goals'
import { MinusIcon, PlusIcon } from '../icons'

// "Edit goals" setup surface. Ports the prototype's goals modal: toggle which
// activities are on for the week, and set the numeric ones' targets. Nothing
// persists until Save, so it edits a local draft.
export function GoalsSetupModal({
  initial,
  onClose,
  onSave,
}: {
  initial: Goal[]
  onClose: () => void
  onSave: (goals: Goal[]) => void
}) {
  const [draft, setDraft] = useState<Goal[]>(() => initial.map((goal) => ({ ...goal })))

  function toggle(id: ActivityId) {
    setDraft((current) => {
      if (current.some((goal) => goal.id === id)) {
        return current.filter((goal) => goal.id !== id)
      }
      return [...current, goalFromId(id)].sort(
        (a, b) => activityOrder.indexOf(a.id) - activityOrder.indexOf(b.id),
      )
    })
  }

  function adjust(id: ActivityId, delta: number) {
    setDraft((current) =>
      current.map((goal) => {
        if (goal.id !== id) return goal
        const limits = numericLimits[id]
        return { ...goal, target: Math.max(limits.min, Math.min(limits.max, goal.target + delta)) }
      }),
    )
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal goals-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goalsModalTitle"
      >
        <div className="modal-head">
          <h2 id="goalsModalTitle">Edit goals</h2>
        </div>
        <div className="setup-hint">
          Pick what this week is for. Numbers are yours to set, and only you see them.
        </div>
        <div className="setup-list">
          {activityOrder.map((id) => {
            const info = activity[id]
            const goal = draft.find((item) => item.id === id)
            const selected = Boolean(goal)
            const showStepper = selected && info.type === 'numeric'
            return (
              <div
                key={id}
                className={`setup-row${selected ? ' selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('[data-draft-adjust]')) return
                  toggle(id)
                }}
                onKeyDown={(event) => {
                  if ((event.target as HTMLElement).closest('[data-draft-adjust]')) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggle(id)
                  }
                }}
              >
                <span>{info.name}</span>
                {showStepper ? (
                  <div className="setup-stepper">
                    <button
                      className="setup-round"
                      type="button"
                      data-draft-adjust
                      aria-label={`Decrease ${info.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        adjust(id, -1)
                      }}
                    >
                      <MinusIcon />
                    </button>
                    <span>{goal!.target}</span>
                    <button
                      className="setup-round"
                      type="button"
                      data-draft-adjust
                      aria-label={`Increase ${info.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        adjust(id, 1)
                      }}
                    >
                      <PlusIcon />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="setup-footer">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn solid" type="button" onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </section>
    </div>
  )
}
