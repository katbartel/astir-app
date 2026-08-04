// A third harness entry: the real Home task detail, with the astir.v1 store faked.
// See docs/notes-editor.md 4.5 and 10.
//
// Home's notes were all empty at cutover, so the version gate and the read-only
// fallback have no real-world coverage. These are their only proof.

import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TaskDetail } from '@/components/HomeView'
import type { Note } from '@/lib/applications'
import type { Task, TaskTileId } from '@/lib/goals'

declare global {
  interface Window {
    /** The faked astir.v1 store: task id to note. */
    STORE: Record<string, Note | null>
    /** Every write, as [taskId, note]. */
    WRITES: [string, Note | null][]
    SET_OPEN: (value: boolean) => void
    RESEED: (store: Record<string, Note | null>) => void
  }
}

const task = (id: string, text: string, note: Note | null): Task =>
  ({ id, text, done: false, note, steps: [] }) as unknown as Task

function Host() {
  const [store, setStore] = useState<Record<string, Note | null>>(() => window.STORE ?? {})
  const [open, setOpen] = useState(true)

  window.SET_OPEN = setOpen
  window.RESEED = (next) => {
    window.WRITES = []
    setStore(next)
  }
  window.STORE = store

  const ops = {
    setNote: (_tile: TaskTileId, taskId: string, note: Note | null) => {
      window.WRITES.push([taskId, note])
      // Synchronous, like localStorage, and it only updates a task that is still
      // there. The real setTaskNote goes through mapTask, which maps over the tile's
      // existing tasks: a task that is gone is simply not found and nothing is added.
      // Writing it back unconditionally would resurrect a task a week rollover had
      // removed, which is a bug in the fake, not in the app.
      setStore((current) => (taskId in current ? { ...current, [taskId]: note } : current))
    },
    addStep: () => {},
    toggleStep: () => {},
    removeStep: () => {},
    add: () => {},
    remove: () => {},
    toggle: () => {},
  } as unknown as Parameters<typeof TaskDetail>[0]['ops']

  return (
    <div>
      <div id="outside" style={{ height: 40 }}>
        outside
      </div>
      {open
        ? Object.entries(store).map(([id, note]) => (
            <div key={id} data-task={id} className="goal-task-host">
              <TaskDetail tile={'prep' as TaskTileId} task={task(id, id, note)} ops={ops} />
            </div>
          ))
        : null}
    </div>
  )
}

window.WRITES = []
window.STORE = window.STORE ?? {}
createRoot(document.getElementById('root')!).render(<Host />)
