'use client'

import { type CSSProperties, useState } from 'react'
import { type Application } from '@/lib/applications'
import { STAGE_IDS } from '@/lib/stages'
import {
  type ActivityId,
  type Goal,
  type Task,
  type TaskTileId,
  activity,
  activityOrder,
  applicationsThisWeek,
  goalInfoCopy,
  goalHeadCopy,
  goalTarget,
  inferredRestDayLabels,
  progressFor,
  strokeOffset,
  taskInviteCopy,
  taskTileIds,
} from '@/lib/goals'
import { Greeting } from './Greeting'
import { HeardBackModal } from './applications/HeardBackModal'
import { LogApplicationModal } from './applications/LogApplicationModal'
import { NoteField } from './applications/NoteField'
import { useApplications } from './applications/useApplications'
import { GoalsSetupModal } from './home/GoalsSetupModal'
import { useWeekGoals } from './home/useWeekGoals'
import { CheckIcon, InfoIcon, MinusIcon, PencilIcon, PlusIcon } from './icons'

type TaskOps = ReturnType<typeof useWeekGoals>['tasks']

function gaugeStyle(deep: string, offset: number): CSSProperties {
  return { '--goal-color': `var(${deep})`, '--goal-offset': offset } as CSSProperties
}

function accentStyle(deep: string): CSSProperties {
  return { '--goal-color': `var(${deep})` } as CSSProperties
}

function InfoGlyph({ id }: { id: ActivityId }) {
  const copy = goalInfoCopy[id]
  return copy ? (
    <span className="goal-info" data-info-tooltip={copy}>
      <InfoIcon />
    </span>
  ) : (
    <span className="goal-info disabled-info">
      <InfoIcon />
    </span>
  )
}

function isTaskTile(id: ActivityId | ''): id is TaskTileId {
  return (taskTileIds as string[]).includes(id)
}

// A tile in the selector row. Clicking it opens (or closes) the detail panel
// below the grid; the tile no longer holds any inline controls.
function GoalTile({
  goal,
  progress,
  selected,
  onSelect,
}: {
  goal: Goal
  progress: number
  selected: boolean
  onSelect: (id: ActivityId | '') => void
}) {
  const info = activity[goal.id]
  const target = goalTarget(goal)
  const met = progress >= target
  const classes = ['goal-tile', 'selectable', goal.id, met ? 'met' : '', selected ? 'sel' : '']
    .filter(Boolean)
    .join(' ')

  const toggle = () => onSelect(selected ? '' : goal.id)

  return (
    <article
      className={classes}
      data-goal={goal.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggle()
        }
      }}
    >
      <svg
        className="goal-gauge"
        viewBox="0 0 96 56"
        aria-hidden="true"
        style={gaugeStyle(info.deep, strokeOffset(progress, target))}
      >
        <path className="gauge-track" pathLength={126} d="M8 48a40 40 0 0 1 80 0" />
        <path className="gauge-sweep" pathLength={126} d="M8 48a40 40 0 0 1 80 0" />
        <text className="gauge-ratio" x="48" y="41" textAnchor="middle">
          {progress}/{target}
        </text>
      </svg>
      <div className="goal-title-row">
        <div className="goal-title">{info.name}</div>
        <InfoGlyph id={goal.id} />
      </div>
    </article>
  )
}

// A faded tile for an activity that is not one of this week's goals. Tapping it
// opens the panel, which explains how to turn it on.
function PlaceholderTile({
  id,
  selected,
  onSelect,
}: {
  id: ActivityId
  selected: boolean
  onSelect: (id: ActivityId | '') => void
}) {
  const info = activity[id]
  const toggle = () => onSelect(selected ? '' : id)
  return (
    <article
      className={`goal-tile ghost-tile selectable${selected ? ' sel' : ''}`}
      data-goal={id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggle()
        }
      }}
    >
      <svg className="goal-gauge" viewBox="0 0 96 56" aria-hidden="true" style={gaugeStyle(info.deep, 126)}>
        <path className="gauge-track" pathLength={126} d="M8 48a40 40 0 0 1 80 0" />
        <path className="gauge-sweep" pathLength={126} d="M8 48a40 40 0 0 1 80 0" />
      </svg>
      <div className="goal-title-row">
        <div className="goal-title">{info.name}</div>
        <span className="goal-info disabled-info">
          <InfoIcon />
        </span>
      </div>
    </article>
  )
}

function hasDetail(task: Task): boolean {
  return task.steps.length > 0 || Boolean(task.note?.blocks?.length)
}

// The private detail of a task: a note (the same rich editor as the pipeline
// card) and a flat step list. Neither ever touches the count — only the parent
// checkbox does. Step-draft state is local so each open task keeps its own.
function TaskDetail({ tile, task, ops }: { tile: TaskTileId; task: Task; ops: TaskOps }) {
  const [stepDraft, setStepDraft] = useState('')

  const submitStep = () => {
    if (!stepDraft.trim()) return
    ops.addStep(tile, task.id, stepDraft)
    setStepDraft('')
  }

  return (
    <div className="goal-tdetail">
      <NoteField note={task.note} onChange={(note) => ops.setNote(tile, task.id, note)} />
      {task.steps.length > 0 ? (
        <div className="goal-steps">
          {task.steps.map((step) => (
            <div key={step.id} className={`goal-step-row${step.done ? ' done' : ''}`}>
              <button
                type="button"
                className={`goal-scheck${step.done ? ' on' : ''}`}
                aria-pressed={step.done}
                aria-label={step.done ? `Mark ${step.text} not done` : `Mark ${step.text} done`}
                onClick={() => ops.toggleStep(tile, task.id, step.id)}
              >
                <CheckIcon />
              </button>
              <span className="goal-step-text">{step.text}</span>
              <button
                type="button"
                className="goal-step-del"
                aria-label={`Remove ${step.text}`}
                onClick={() => ops.removeStep(tile, task.id, step.id)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="goal-add-step">
        <input
          type="text"
          placeholder="Add a step"
          value={stepDraft}
          onChange={(event) => setStepDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitStep()
            }
          }}
        />
      </div>
      <div className="goal-hint">Steps and notes are just for you. They do not change your count.</div>
    </div>
  )
}

// The editable checklist for a task tile. Checking a task is the only thing that
// moves the arc; the list itself is just memory (add freely, overshoot is fine).
// A task expands on tap to reveal its note and steps.
function TaskList({
  tile,
  tasks,
  ops,
}: {
  tile: TaskTileId
  tasks: Task[]
  ops: TaskOps
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const submit = () => {
    if (!draft.trim()) return
    ops.add(tile, draft)
    setDraft('')
  }

  const toggleOpen = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      {tasks.length > 0 ? (
        <div className="goal-task-list">
          {tasks.map((task) => {
            const isOpen = open.has(task.id)
            return (
              <div key={task.id} className={`goal-task-item${isOpen ? ' open' : ''}`}>
                <div className={`goal-task-row${task.done ? ' done' : ''}`}>
                  <button
                    type="button"
                    className={`goal-check${task.done ? ' on' : ''}`}
                    aria-pressed={task.done}
                    aria-label={task.done ? `Mark ${task.text} not done` : `Mark ${task.text} done`}
                    onClick={() => ops.toggle(tile, task.id)}
                  >
                    <CheckIcon />
                  </button>
                  <span
                    className="goal-task-open"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => toggleOpen(task.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggleOpen(task.id)
                      }
                    }}
                  >
                    <span className="goal-task-text">{task.text}</span>
                    {hasDetail(task) && !isOpen ? <span className="goal-dot" aria-hidden="true" /> : null}
                    <span className="goal-caret" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="goal-task-del"
                    aria-label={`Remove ${task.text}`}
                    onClick={() => ops.remove(tile, task.id)}
                  >
                    &times;
                  </button>
                </div>
                {isOpen ? <TaskDetail tile={tile} task={task} ops={ops} /> : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="goal-empty">{taskInviteCopy[tile]}</div>
      )}
      <div className="goal-add-row">
        <input
          type="text"
          placeholder="Add a task"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
        <button type="button" className="goal-add-plus" aria-label="Add task" onClick={submit}>
          <PlusIcon />
        </button>
      </div>
    </>
  )
}

function ApplicationsPanel({ apps, onLog }: { apps: Application[]; onLog: () => void }) {
  const week = applicationsThisWeek(apps)
  return (
    <>
      {week.length > 0 ? (
        <div className="goal-records">
          {week.map((application) => (
            <div className="goal-record" key={application.id}>
              <div className="goal-record-main">
                <span className="goal-record-co">{application.company}</span>{' '}
                <span className="goal-record-ro">{application.role}</span>
              </div>
              <span className="goal-record-day">
                {new Date(application.appliedDate).toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="goal-empty">Nothing logged yet this week.</div>
      )}
      <button className="btn ghost goal-log-btn" type="button" onClick={onLog}>
        Log application
      </button>
    </>
  )
}

function RestPanel({ labels, onStep }: { labels: string[]; onStep: (delta: number) => void }) {
  return (
    <>
      {labels.length > 0 ? (
        <div className="goal-rest-chips">
          {labels.map((label, index) => (
            <span className="goal-chip" key={`${label}-${index}`}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="goal-rest-foot">
        <p className="goal-rest-note">
          Rest is counted for you when you take a day off. Nothing to log.
        </p>
        <div className="setup-stepper" aria-label="Adjust rest days">
          <button className="setup-round" type="button" aria-label="Remove a rest day" onClick={() => onStep(-1)}>
            <MinusIcon />
          </button>
          <button className="setup-round" type="button" aria-label="Add a rest day" onClick={() => onStep(1)}>
            <PlusIcon />
          </button>
        </div>
      </div>
    </>
  )
}

function GoalPanel({
  selected,
  goal,
  week,
  apps,
  ops,
  onStepRest,
  onLog,
}: {
  selected: ActivityId
  goal: Goal | undefined
  week: ReturnType<typeof useWeekGoals>['week']
  apps: Application[]
  ops: TaskOps
  onStepRest: (delta: number) => void
  onLog: () => void
}) {
  const info = activity[selected]

  // Selected an activity that is not one of this week's goals.
  if (!goal) {
    return (
      <div className="goal-panel" style={accentStyle(info.deep)}>
        <div className="goal-empty">
          {info.name} is not one of this week&apos;s goals. Add it from Edit goals.
        </div>
      </div>
    )
  }

  return (
    <div className="goal-panel" style={accentStyle(info.deep)}>
      <div className="goal-panel-head">{goalHeadCopy[selected]}</div>
      {isTaskTile(selected) ? <TaskList tile={selected} tasks={week.tasks[selected]} ops={ops} /> : null}
      {selected === 'apply' ? <ApplicationsPanel apps={apps} onLog={onLog} /> : null}
      {selected === 'rest' ? (
        <RestPanel labels={inferredRestDayLabels(week, apps)} onStep={onStepRest} />
      ) : null}
    </div>
  )
}

export function HomeView() {
  const { applications, reload, changeStage, showSnack, overlay } = useApplications()
  const { week, setGoals, stepRest, tasks } = useWeekGoals()

  const [logging, setLogging] = useState(false)
  const [heardOpen, setHeardOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<ActivityId | ''>('')

  const apps = applications ?? []
  const hasApplications = apps.length > 0

  const goals = week.goals
  const hasGoals = goals.length > 0
  const progressById = new Map<ActivityId, number>(
    goals.map((goal) => [goal.id, progressFor(goal.id, week, apps)]),
  )
  const allMet = hasGoals && goals.every((goal) => (progressById.get(goal.id) ?? 0) >= goalTarget(goal))
  const support = allMet
    ? 'You did it. Take a moment to savor it.'
    : "You're doing great, keep it up."

  const selectedById = new Map(goals.map((goal) => [goal.id, goal]))

  return (
    <section className="screen" data-screen="today">
      <div className="today-head">
        <Greeting />
      </div>

      <section className="home-card" aria-labelledby="applicationsLabel">
        <div className="label" id="applicationsLabel">
          Applications
        </div>
        <p className="home-card-copy">
          After you apply, record it here. Out of sight until the screening stage.
        </p>
        <div className="home-card-actions">
          <button className="btn ghost" type="button" onClick={() => setLogging(true)}>
            Log application
          </button>
        </div>
      </section>

      <section className="home-card" aria-labelledby="heardBackLabel" hidden={!hasApplications}>
        <div className="label" id="heardBackLabel">
          Screenings
        </div>
        <p className="home-card-copy">
          A company moved you forward. Bring the application into your pipeline.
        </p>
        <div className="home-card-actions">
          <button className="btn ghost" type="button" onClick={() => setHeardOpen(true)}>
            Move to pipeline
          </button>
        </div>
      </section>

      <section className="goals-card" aria-labelledby="goalsLabel">
        <div className="card-head">
          <div className="label" id="goalsLabel">
            This week&apos;s goals
          </div>
          <button
            className="round-icon add-application goal-edit-action"
            type="button"
            aria-label="Edit"
            data-tooltip="Edit"
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
          </button>
        </div>
        <div>
          {hasGoals ? (
            <>
              <div className="goals-support">{support}</div>
              <div className="goal-grid">
                {activityOrder.map((id) => {
                  const goal = selectedById.get(id)
                  return goal ? (
                    <GoalTile
                      key={id}
                      goal={goal}
                      progress={progressById.get(id) ?? 0}
                      selected={selected === id}
                      onSelect={setSelected}
                    />
                  ) : (
                    <PlaceholderTile key={id} id={id} selected={selected === id} onSelect={setSelected} />
                  )
                })}
              </div>
              {selected ? (
                <GoalPanel
                  selected={selected}
                  goal={selectedById.get(selected)}
                  week={week}
                  apps={apps}
                  ops={tasks}
                  onStepRest={stepRest}
                  onLog={() => setLogging(true)}
                />
              ) : null}
            </>
          ) : (
            <>
              <div className="unwritten-line">Set up your goals for this week</div>
              <div className="goal-grid ghost-grid">
                {activityOrder.map((id) => (
                  <PlaceholderTile key={id} id={id} selected={false} onSelect={() => setEditing(true)} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {logging ? (
        <LogApplicationModal
          initial={{ status: STAGE_IDS.applied }}
          onClose={() => setLogging(false)}
          onSaved={(application, isNew) => {
            void reload()
            if (isNew && application.status !== STAGE_IDS.hired) {
              showSnack({ text: 'Application logged.' })
            }
          }}
        />
      ) : null}

      {heardOpen ? (
        <HeardBackModal
          applications={apps}
          onClose={() => setHeardOpen(false)}
          onChoose={(application, status) => {
            setHeardOpen(false)
            void changeStage(application, status, 'heard')
          }}
        />
      ) : null}

      {editing ? (
        <GoalsSetupModal
          initial={goals}
          onClose={() => setEditing(false)}
          onSave={(next) => {
            setGoals(next)
            setEditing(false)
          }}
        />
      ) : null}

      {overlay}
    </section>
  )
}
