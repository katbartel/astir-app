'use client'

// Autosave for a note field. See docs/notes-editor.md section 10.
//
// This is an adapter, and it lives with the caller rather than inside the editor:
// the component takes a value and an onChange and knows nothing about storage. Both
// call sites use this hook and supply their own `save`, so the debounce and the flush
// rules are written once while the storage stays theirs.
//
// The debounce is what makes a save cheap. It is also what can lose the last thing
// typed, which is what the flush list exists for.

import { useCallback, useEffect, useRef } from 'react'
import type { StoredNote } from '@/lib/noteMigration'

const DEBOUNCE_MS = 600

export type NoteAutosave = {
  /** Hand this to the editor's onChange. */
  onChange: (note: StoredNote) => void
  /** Write any pending edit now. Safe to call when nothing is pending. */
  flush: () => void
  /** True while an edit is written but unconfirmed, so nothing reseeds over it. */
  isPending: () => boolean
}

export function useNoteAutosave({
  save,
  delay = DEBOUNCE_MS,
}: {
  /** Persist the note. May be sync (localStorage) or async (the API). */
  save: (note: StoredNote) => void | Promise<void>
  delay?: number
}): NoteAutosave {
  const pending = useRef<StoredNote | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSave = useRef(save)
  latestSave.current = save

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  const flush = useCallback(() => {
    clear()
    const note = pending.current
    if (note === null) return
    // Cleared before the write, not after: a second flush must not write twice. On
    // failure it is put back, so a failed flush never discards the edit.
    pending.current = null
    try {
      const result = latestSave.current(note)
      if (result && typeof result.then === 'function') {
        void result.catch(() => {
          if (pending.current === null) pending.current = note
        })
      }
    } catch {
      if (pending.current === null) pending.current = note
    }
  }, [])

  const onChange = useCallback(
    (note: StoredNote) => {
      pending.current = note
      clear()
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  // Unmount, which also covers the card closing and the notes container collapsing:
  // both unmount the field. A route change unmounts it too, since the screen goes.
  useEffect(() => flush, [flush])

  // Tab close, reload, and backgrounding. visibilitychange is the reliable one;
  // beforeunload is the backstop and is not dependable on mobile Safari. Neither
  // fires after a crash, which is why the flush is not the only protection: a failed
  // or missed write leaves the edit in memory and, for Home, in the store already.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const onUnload = () => flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
    }
  }, [flush])

  const isPending = useCallback(() => pending.current !== null, [])

  return { onChange, flush, isPending }
}
