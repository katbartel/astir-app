// A second harness entry: the real PipelineCard, with storage faked and nothing
// else. See docs/notes-editor.md sections 10 and 14.
//
// The rules asserted through this page are properties of the card, not of the
// editor: the note field never toggling the card, and the autosave flush. A
// stand-in card would prove nothing, so this mounts the one the app renders and
// replaces only the save.

import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PipelineCard } from '@/components/PipelineView'
import type { Application, Note } from '@/lib/applications'

declare global {
  interface Window {
    /** Every note handed to the adapter, in order. */
    SAVES: Note[]
    /** Make the next save reject, to prove a failed flush keeps the edit. */
    FAIL_NEXT: boolean
    /** Collapse the card, unmount it, or put it back, from the driver. */
    SET_EXPANDED: (value: boolean) => void
    SET_MOUNTED: (value: boolean) => void
    /** The note the card is currently seeded with. */
    CURRENT: Note | null
  }
}

const application: Application = {
  id: 'app_harness',
  listingId: null,
  company: 'Harness',
  role: 'Engineer',
  link: null,
  stageId: 'stage1',
  status: 'stage1',
  appliedDate: '2026-08-01',
  stageChangedAt: '2026-08-01T00:00:00.000Z',
  note: null,
  posting: null,
} as unknown as Application

window.SAVES = []
window.FAIL_NEXT = false

function Host() {
  const [expanded, setExpanded] = useState(true)
  const [mounted, setMounted] = useState(true)
  // A v1 note, deliberately: reading one runs the migration, which is the tempting
  // moment to write, and invariant 17 says nothing is written until the user edits.
  const [note, setNote] = useState<Note | null>({
    kind: 'blocks',
    blocks: [{ type: 'text', text: 'seeded v1 line' }],
  } as Note)

  window.SET_EXPANDED = setExpanded
  window.SET_MOUNTED = setMounted
  window.CURRENT = note

  return (
    <div>
      <div id="outside" style={{ height: 60 }}>
        outside the card
      </div>
      {mounted ? (
        <PipelineCard
          application={{ ...application, note }}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          onStage={() => {}}
          onNote={(next) => {
            window.SAVES.push(next)
            setNote(next)
            if (window.FAIL_NEXT) {
              window.FAIL_NEXT = false
              return Promise.reject(new Error('save failed')) as unknown as void
            }
          }}
          stageColor={() => 'progress'}
        />
      ) : null}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Host />)
