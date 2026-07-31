'use client'

import { usePathname } from 'next/navigation'
import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  type Application,
  type Status,
  fetchApplications,
  normalizeApplications,
  updateApplication,
} from '@/lib/applications'
import { STAGE_IDS, isPipelineStage, useStageConfig } from '@/lib/stages'
import { HiredModal } from './HiredModal'
import { Snackbar, type SnackMessage, useSnackbar } from './useSnackbar'

type StageContext = 'pipeline' | 'applications' | 'heard'

export type ApplicationsContextValue = {
  applications: Application[] | null
  failed: boolean
  reload: () => Promise<void>
  changeStage: (
    application: Application,
    status: Status,
    context: StageContext,
  ) => Promise<void>
  saveNote: (application: Application, note: NonNullable<Application['note']>) => void
  showSnack: (next: SnackMessage, duration?: number) => void
  overlay: ReactNode
}

export const ApplicationsContext = createContext<ApplicationsContextValue | null>(null)

// Routes that read applications. Landing on one of these revalidates in the
// background; the other routes (watchlist, job boards, preferences) leave the
// cached list alone.
const DATA_ROUTES = new Set(['/', '/pipeline', '/applications'])

// Owns the user's applications for the whole signed-in session: one fetch per
// page load rather than one per screen, so moving between Home, Pipeline and
// All applications shows the data we already have instead of a blank screen.
// The mutations and the snackbar/Hired overlay live here too, so every screen
// reacts to the same state. Screens read this through useApplications().
export function ApplicationsProvider({
  initialApplications = null,
  children,
}: {
  // Raw rows the server already fetched for this request, or null when there
  // were none to fetch (signed out, or the backend was unreachable).
  initialApplications?: Application[] | null
  children: ReactNode
}) {
  const { catalog } = useStageConfig()
  const [applications, setApplications] = useState<Application[] | null>(() =>
    initialApplications ? normalizeApplications(initialApplications) : null,
  )
  const [failed, setFailed] = useState(false)
  const [hiredFor, setHiredFor] = useState<Application | null>(null)
  const { message: snack, showSnack } = useSnackbar()

  const reload = useCallback(async () => {
    try {
      setApplications(await fetchApplications())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  // Revalidate whenever the user lands on a screen that reads applications;
  // the initial load runs through the same effect. reload() never clears
  // `applications` first, so the list we already have stays on screen while
  // the refetch is in flight — that is what keeps route changes free of a
  // loading state.
  //
  // The one exception is the very first run when the server already handed us
  // the rows: refetching them immediately would be a wasted round trip.
  const pathname = usePathname()
  const seeded = useRef(initialApplications !== null)
  useEffect(() => {
    if (!DATA_ROUTES.has(pathname)) return
    if (seeded.current) {
      seeded.current = false
      return
    }
    void reload()
  }, [pathname, reload])

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

  return (
    <ApplicationsContext.Provider
      value={{ applications, failed, reload, changeStage, saveNote, showSnack, overlay }}
    >
      {children}
    </ApplicationsContext.Provider>
  )
}
