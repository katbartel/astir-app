'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  type Application,
  type Status,
  fetchApplications,
  updateApplication,
} from '@/lib/applications'
import { STAGE_IDS, isPipelineStage, useStageConfig } from '@/lib/stages'
import { HiredModal } from './HiredModal'
import { Snackbar, useSnackbar } from './useSnackbar'

type StageContext = 'pipeline' | 'applications' | 'heard'

// Shared data + mutations for the Pipeline and All applications screens: one
// fetch of the user's applications, inline stage changes with the prototype's
// snackbar semantics, and the Hired celebration. Returns an `overlay` node the
// screen renders once (snackbar + hired modal).
export function useApplications() {
  const { catalog } = useStageConfig()
  const [applications, setApplications] = useState<Application[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [hiredFor, setHiredFor] = useState<Application | null>(null)
  const { message: snack, showSnack } = useSnackbar()

  const reload = useCallback(async () => {
    try {
      setApplications(await fetchApplications())
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const changeStage = useCallback(
    async (application: Application, status: Status, context: StageContext) => {
      const wasPipeline = isPipelineStage(catalog, application.status)
      const updated = await updateApplication(application.id, { status })
      await reload()
      if (status === STAGE_IDS.hired) {
        setHiredFor(updated)
        return
      }
      if (context === 'pipeline' && wasPipeline && status === STAGE_IDS.applied) {
        showSnack(
          {
            text: 'Moved back to applied. Kept in all applications.',
            linkText: 'all applications',
            href: '/applications',
          },
          5000,
        )
      } else if (context === 'pipeline' && wasPipeline && status === STAGE_IDS.closed) {
        showSnack(
          {
            text: 'Closed. Kept in all applications.',
            linkText: 'all applications',
            href: '/applications',
          },
          5000,
        )
      } else if (context === 'heard') {
        const inPipeline = isPipelineStage(catalog, status)
        showSnack(
          inPipeline
            ? {
                text: 'Updated. You can see it in pipeline.',
                linkText: 'pipeline',
                href: '/pipeline',
              }
            : {
                text: 'Updated. Kept in all applications.',
                linkText: 'all applications',
                href: '/applications',
              },
          5000,
        )
      }
    },
    [catalog, reload, showSnack],
  )

  // Persist a note edit. We update local state optimistically so re-opening a
  // card — which remounts NoteField and reseeds it from this prop — shows the
  // latest text; the PATCH saves it to the server. No reload(): the seeded-once
  // NoteField would ignore a refetch anyway, and we save on every keystroke.
  const saveNote = useCallback(
    (application: Application, note: NonNullable<Application['note']>) => {
      setApplications((current) =>
        (current ?? []).map((item) => (item.id === application.id ? { ...item, note } : item)),
      )
      void updateApplication(application.id, { note }).catch(() => setFailed(true))
    },
    [],
  )

  // Bulk-close the other in-progress applications after a hire.
  const closeOthers = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => updateApplication(id, { status: STAGE_IDS.closed })))
      await reload()
    },
    [reload],
  )

  const otherPipeline = hiredFor
    ? (applications ?? []).filter(
        (item) => item.id !== hiredFor.id && isPipelineStage(catalog, item.status),
      )
    : []

  const overlay = (
    <>
      {hiredFor ? (
        <HiredModal
          application={hiredFor}
          others={otherPipeline}
          onClose={() => setHiredFor(null)}
          onCloseOthers={(ids) => void closeOthers(ids)}
        />
      ) : null}
      <Snackbar message={snack} />
    </>
  )

  return { applications, failed, reload, changeStage, saveNote, showSnack, overlay }
}
