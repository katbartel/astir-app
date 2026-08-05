// The harness entry: mounts the real NoteEditor and exposes what the driver reads.
// See docs/notes-editor.md section 14.
//
// Nothing here re-implements any editor behaviour. It bundles the component the
// app uses, so a bug in the component is a failure here, and a workaround here
// would be a lie about the app.

import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import { NoteEditor } from '@/components/applications/NoteEditor'
// The real tooltip layer, as the app layout mounts it. Toolbar tooltips are rendered by
// this and by nothing in the editor, so without it a tooltip assertion has nothing to
// look at.
import { Tooltips } from '@/components/Tooltips'
import { isPlaceholderDocument } from '@/components/applications/noteNodeViews'
import type { StoredNote } from '@/lib/noteMigration'

type VisualRow = {
  /** Row type as rendered, so the driver never has to guess from markup. */
  kind: string
  text: string
  /** Rounded top offset. Rows sharing one offset are on one visual line. */
  top: number
  height: number
  visible: boolean
  checked: boolean | null
  collapsed: boolean | null
  indent: number
  /** Absolute viewport coordinates, so a pointer drag can be driven at a row. */
  left: number
  width: number
}

declare global {
  interface Window {
    /** Hrefs the page tried to open. Instrumentation, so cmd click is assertable. */
    OPENED: string[]
    SEED: unknown
    SAVED: StoredNote | null
    EDITOR: Editor | null
    ROWS: () => VisualRow[]
    PLACEHOLDER: () => { shown: boolean; byCondition: boolean }
    REMOUNT: (seed?: unknown) => void
  }
}

const SEED_KEY = 'astir.harness.seed'

// Record window.open rather than letting a popup appear: the assertion is that the
// href was opened, and a real popup is noise in a headless run.
window.OPENED = []
window.open = ((url?: string | URL) => {
  window.OPENED.push(String(url ?? ''))
  return null
}) as typeof window.open

function readSeed(): unknown {
  const raw = window.sessionStorage.getItem(SEED_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const container = document.getElementById('root')
if (!container) throw new Error('no #root')
const root = createRoot(container)

let generation = 0

function render(seed: unknown) {
  generation += 1
  window.SAVED = null
  window.EDITOR = null
  root.render(
    <>
      <Tooltips />
      <NoteEditor
        key={generation}
        note={seed}
        onChange={(note) => {
          window.SAVED = note
        }}
        onReady={(editor) => {
          window.EDITOR = editor
        }}
      />
    </>,
  )
}

window.SEED = readSeed()
window.REMOUNT = (seed) => render(seed === undefined ? readSeed() : seed)

/**
 * Visual rows, measured rather than inferred. Grouping by `top` is how a phantom
 * blank line shows up: two rows that should share a line, or a line nobody wrote.
 */
window.ROWS = () => {
  const editor = document.querySelector('.note-editor')
  if (!editor) return []
  const editorLeft = editor.getBoundingClientRect().left
  const selector = '.note-row, .note-section-title'
  return [...editor.querySelectorAll(selector)].map((element) => {
    const box = element.getBoundingClientRect()
    const section = element.closest('.note-section')
    const row = element.closest('.note-check-row')
    return {
      kind: element.classList.contains('note-check-row')
        ? 'check'
        : element.classList.contains('note-bullet-row')
          ? 'bullet'
          : element.classList.contains('note-section-title')
            ? 'sectionTitle'
            : 'paragraph',
      text: (element.textContent ?? '').trim(),
      top: Math.round(box.top),
      height: Math.round(box.height),
      // A collapsed section's body is in the document and in the DOM, hidden by an
      // attribute, so "is it on screen" has to be measured.
      visible: box.height > 0 && (element as HTMLElement).offsetParent !== null,
      checked: row ? row.getAttribute('data-checked') === 'true' : null,
      collapsed: element.classList.contains('note-section-title')
        ? section?.getAttribute('data-collapsed') === 'true'
        : null,
      indent: Math.round(box.left - editorLeft),
      left: Math.round(box.left),
      width: Math.round(box.width),
    }
  })
}

/**
 * Both halves of the placeholder rule: what is on screen, and what the condition
 * in the code says. If they ever disagree, the decoration is wrong.
 */
window.PLACEHOLDER = () => {
  const marked = document.querySelector('.note-placeholder')
  const editor = window.EDITOR
  return {
    shown: !!marked,
    byCondition: editor ? isPlaceholderDocument(editor.state.doc) : false,
  }
}

render(window.SEED)
