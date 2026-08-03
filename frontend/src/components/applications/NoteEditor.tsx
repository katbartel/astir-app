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
import { useRef } from 'react'
import { NOTE_VERSION, readNote, type StoredNote } from '@/lib/noteMigration'
import { noteEditorExtensions } from './noteNodeViews'

type Props = {
  /** A v2 note, an un-migrated v1 note, or null. */
  note: unknown
  onChange: (note: StoredNote) => void
  ariaLabel?: string
}

export function NoteEditor({ note, onChange, ariaLabel = 'Note' }: Props) {
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

  return <EditorContent editor={editor} className="note-editor-shell" />
}
