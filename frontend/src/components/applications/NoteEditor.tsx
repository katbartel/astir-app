'use client'

// The notes editor. See docs/notes-editor.md.
//
// This component takes a value and an onChange and knows nothing about storage.
// The Pipeline caller persists to Postgres, the Home weekly-goals caller persists
// to localStorage under astir.v1, and neither concern reaches in here.
//
// It accepts a v1 or a v2 note and always emits v2: the load path migrates in
// memory through the same mapping the database script uses, so a note that was
// never converted still opens, and is written back as v2 on the next save.

import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { NOTE_VERSION, readNote, type StoredNote } from '@/lib/noteMigration'
import { noteEditorExtensions } from './noteNodeViews'
import { NoteToolbar } from './NoteToolbar'

type Props = {
  /** A v2 note, an un-migrated v1 note, or null. */
  note: unknown
  onChange: (note: StoredNote) => void
  ariaLabel?: string
  /**
   * Handed the editor once it exists. The regression harness uses it to place the
   * caret by document position rather than by clicking at coordinates. It hands
   * out the instance and nothing else: no state lives on this side of it.
   */
  onReady?: (editor: Editor) => void
}

export function NoteEditor({ note, onChange, ariaLabel = 'Note', onReady }: Props) {
  // Seeded once. The editor owns the document from then on, and React does not
  // re-render it while it is being edited.
  const seed = useRef<StoredNote | null>(null)
  if (seed.current === null) seed.current = readNote(note)

  // The envelope's kind and text ride along untouched, so a save never drops them.
  const envelope = useRef({ kind: seed.current.kind, text: seed.current.text })

  const editor = useEditor({
    extensions: noteEditorExtensions,
    content: seed.current.doc,
    // Next renders this on the server first; Tiptap must not mount there.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'note-editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
      },
    },
    onUpdate: ({ editor: instance }) => {
      const next: StoredNote = {
        v: NOTE_VERSION,
        kind: envelope.current.kind,
        doc: instance.getJSON() as StoredNote['doc'],
      }
      if (envelope.current.text !== undefined) next.text = envelope.current.text
      onChange(next)
    },
  })

  // Held in a ref so the effect depends on the editor alone: onReady fires once per
  // editor instance, not on every render that passes a new closure.
  const ready = useRef(onReady)
  ready.current = onReady
  useEffect(() => {
    if (editor) ready.current?.(editor)
  }, [editor])

  return (
    <div className="note-editor-shell">
      <EditorContent editor={editor} />
      <NoteToolbar editor={editor} />
    </div>
  )
}
