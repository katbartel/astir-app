'use client'

import { useEffect, useRef, useState } from 'react'
import {
  type Application,
  fetchApplications,
  updateApplication,
} from '@/lib/applications'
import {
  STAGE_LIMIT,
  type StageBucket,
  type StageId,
  type StageRecord,
  useStageConfig,
} from '@/lib/stages'
import { MinusIcon, PlusIcon } from '../icons'
import { StageRing } from '../applications/StageRing'

type Editing = Record<StageId, string>

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="7" r="1.2" />
      <circle cx="15" cy="7" r="1.2" />
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <circle cx="9" cy="17" r="1.2" />
      <circle cx="15" cy="17" r="1.2" />
    </svg>
  )
}

function countPhrase(count: number) {
  if (count === 1) return 'One application is'
  if (count === 2) return 'Two applications are'
  return `${count} applications are`
}

function bucketTitle(bucket: StageBucket) {
  if (bucket === 'applying') return 'Applying'
  if (bucket === 'progress') return 'In progress'
  if (bucket === 'offer') return 'Offer and hired'
  return 'Closed'
}

export function StagesPreferences() {
  const {
    catalog,
    colorFor,
    visualFor,
    renameStage,
    addProgressStage,
    removeProgressStage,
    moveProgressStage,
    reorderProgressStage,
  } = useStageConfig()
  const [editing, setEditing] = useState<Editing>({})
  const [applications, setApplications] = useState<Application[]>([])
  const [pendingRemove, setPendingRemove] = useState<StageRecord | null>(null)
  const [draggingId, setDraggingId] = useState<StageId | null>(null)
  const focusId = useRef<StageId | null>(null)

  useEffect(() => {
    void fetchApplications().then(setApplications).catch(() => setApplications([]))
  }, [])

  useEffect(() => {
    if (!focusId.current) return
    const input = document.querySelector<HTMLInputElement>(
      `[data-stage-name="${focusId.current}"]`,
    )
    if (input) {
      input.focus()
      input.select()
      focusId.current = null
    }
  }, [catalog])

  function valueFor(stage: StageRecord) {
    return editing[stage.id] ?? stage.name
  }

  function updateDraft(stage: StageRecord, value: string) {
    setEditing((current) => ({ ...current, [stage.id]: value }))
  }

  function commit(stage: StageRecord) {
    const raw = editing[stage.id]
    if (raw === undefined) return
    const name = raw.trim()
    setEditing((current) => {
      const next = { ...current }
      delete next[stage.id]
      return next
    })
    if (!name) {
      if (stage.bucket === 'progress' && !stage.name.trim()) removeProgressStage(stage.id)
      return
    }
    if (name !== stage.name) renameStage(stage.id, name)
  }

  function applicationCount(stageId: StageId) {
    return applications.filter((application) => application.status === stageId).length
  }

  function earliestAfterRemoval(stageId: StageId) {
    return catalog.progress.find((stage) => stage.id !== stageId) ?? catalog.progress[0]
  }

  function requestRemove(stage: StageRecord) {
    if (applicationCount(stage.id) === 0) {
      removeProgressStage(stage.id)
      return
    }
    setPendingRemove(stage)
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    const target = earliestAfterRemoval(pendingRemove.id)
    const affected = applications.filter((application) => application.status === pendingRemove.id)
    await Promise.all(
      affected.map((application) =>
        updateApplication(application.id, { status: target.id }),
      ),
    )
    setApplications((current) =>
      current.map((application) =>
        application.status === pendingRemove.id
          ? { ...application, status: target.id, stageId: target.id }
          : application,
      ),
    )
    removeProgressStage(pendingRemove.id)
    setPendingRemove(null)
  }

  function addStage() {
    const stage = addProgressStage()
    if (stage) {
      focusId.current = stage.id
      setEditing((current) => ({ ...current, [stage.id]: '' }))
    }
  }

  function dropOn(stageId: StageId) {
    if (draggingId && draggingId !== stageId) {
      reorderProgressStage(draggingId, stageId)
    }
    setDraggingId(null)
  }

  function bucket(stageBucket: StageBucket, stages: StageRecord[]) {
    return (
      <section className="stage-bucket" aria-labelledby={`stageBucket-${stageBucket}`}>
        <div className="stage-bucket-head">
          <h2 id={`stageBucket-${stageBucket}`}>{bucketTitle(stageBucket)}</h2>
          {stageBucket === 'progress' ? (
            <button
              className="round-icon small stage-action"
              type="button"
              aria-label="Add"
              data-tooltip={stages.length >= STAGE_LIMIT ? 'Ten stages is the maximum.' : 'Add'}
              aria-disabled={stages.length >= STAGE_LIMIT}
              onClick={() => {
                if (stages.length < STAGE_LIMIT) addStage()
              }}
            >
              <PlusIcon />
            </button>
          ) : null}
        </div>
        <div className="stage-bucket-list">
          {stages.map((stage) => {
            const removable = stageBucket === 'progress'
            const removeDisabled = removable && stages.length <= 1
            const visual = visualFor(stage.id)
            return (
              <div
                className={`stage-settings-row ${draggingId === stage.id ? 'dragging' : ''}`.trim()}
                key={stage.id}
                draggable={stageBucket === 'progress'}
                onDragStart={() => setDraggingId(stage.id)}
                onDragOver={(event) => {
                  if (draggingId) event.preventDefault()
                }}
                onDrop={() => dropOn(stage.id)}
                onDragEnd={() => setDraggingId(null)}
              >
                <span className="stage-grid-cell">
                  {stageBucket === 'progress' ? (
                    <button
                      className="stage-drag-handle"
                      type="button"
                      aria-label={`Move ${stage.name || 'stage'}`}
                      draggable
                      data-tooltip="Reorder"
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp') {
                          event.preventDefault()
                          moveProgressStage(stage.id, -1)
                        }
                        if (event.key === 'ArrowDown') {
                          event.preventDefault()
                          moveProgressStage(stage.id, 1)
                        }
                      }}
                    >
                      <GripIcon />
                    </button>
                  ) : null}
                </span>
                <span className="stage-settings-icon" data-stage={colorFor(stage.id)}>
                  <StageRing status={stage.id} {...visual} />
                </span>
                <input
                  data-stage-name={stage.id}
                  value={valueFor(stage)}
                  aria-label={`${stage.name || 'Stage'} name`}
                  placeholder={stageBucket === 'progress' ? 'Stage name' : undefined}
                  onChange={(event) => updateDraft(stage, event.target.value)}
                  onBlur={() => commit(stage)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') {
                      setEditing((current) => {
                        const next = { ...current }
                        delete next[stage.id]
                        return next
                      })
                      event.currentTarget.blur()
                    }
                  }}
                />
                <span className="stage-grid-cell stage-action-cell">
                  {removable ? (
                    <button
                      className="round-icon small stage-action"
                      type="button"
                      aria-label="Delete"
                      data-tooltip={
                        removeDisabled ? 'In progress needs at least one stage.' : 'Delete'
                      }
                      aria-disabled={removeDisabled}
                      onClick={() => {
                        if (!removeDisabled) requestRemove(stage)
                      }}
                    >
                      <MinusIcon />
                    </button>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  const pendingCount = pendingRemove ? applicationCount(pendingRemove.id) : 0
  const pendingTarget = pendingRemove ? earliestAfterRemoval(pendingRemove.id) : null

  return (
    <section className="screen">
      <div className="page-head stages-page-head">
        <div>
          <h1>Stages</h1>
          <p>Stages describe how far an application has gone.</p>
        </div>
      </div>
      <div className="stages-settings">
        {bucket('applying', [catalog.applying])}
        {bucket('progress', catalog.progress)}
        {bucket('offer', catalog.offer)}
        {bucket('closed', [catalog.closed])}
      </div>

      {pendingRemove && pendingTarget ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setPendingRemove(null)}
        >
          <section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="removeStageTitle">
            <div className="modal-head">
              <h2 id="removeStageTitle">Remove this stage?</h2>
              <p className="confirm-copy">
                {countPhrase(pendingCount)} at this stage. Removing it moves them to {pendingTarget.name}.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn ghost" type="button" onClick={() => setPendingRemove(null)}>
                Cancel
              </button>
              <button className="btn solid" type="button" onClick={() => void confirmRemove()}>
                Confirm
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
