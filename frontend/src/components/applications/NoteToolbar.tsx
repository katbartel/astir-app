'use client'

// The selection toolbar and the link popover. See docs/notes-editor.md 6.8 and 7.
//
// Everything shown here is derived from the editor at render time: which marks are
// active, whether the section button is available, what the link under the caret
// points at. Nothing is cached. The only state this component owns is UI state
// nobody else can know (whether the URL field is open, and what has been typed into
// it), which is not document state.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Command } from '@tiptap/pm/state'
import { convertRowToSection, setRowType, toggleQuote } from './noteEditing'

type Rect = { top: number; left: number; bottom: number }

const SVG_PROPS = {
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
}

// Real SVG for the structural controls, per AGENTS.md 4.6.
const CheckboxGlyph = () => (
  <svg {...SVG_PROPS}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 12.5l2.8 2.8 5.4-6" />
  </svg>
)
const BulletGlyph = () => (
  <svg {...SVG_PROPS}>
    <circle cx="6" cy="12" r="2" />
    <path d="M11 12h9" />
  </svg>
)
const QuoteGlyph = () => (
  <svg {...SVG_PROPS}>
    <path d="M6 5v14" />
    <path d="M11 8h7M11 12h7M11 16h4" />
  </svg>
)
const SectionGlyph = () => (
  <svg {...SVG_PROPS}>
    <path d="M5 7l3 2.5L5 12" />
    <path d="M11 9.5h8M11 15h8M11 19h5" />
  </svg>
)
const LinkGlyph = () => (
  <svg {...SVG_PROPS}>
    <path d="M10 14a4 4 0 015.7-5.7l2 2A4 4 0 0112 16" />
    <path d="M14 10a4 4 0 01-5.7 5.7l-2-2A4 4 0 0112 8" />
  </svg>
)

/** The link mark under the caret, and the range it covers, read from the document. */
function linkAtCaret(editor: Editor): { href: string; from: number; to: number } | null {
  const { state } = editor
  const { $from, empty } = state.selection
  if (!empty) return null
  const mark = $from.marks().find((candidate) => candidate.type.name === 'link')
  if (!mark) return null
  // Walk out to the whole marked run, so Remove takes the link off all of it.
  const parent = $from.parent
  const offset = $from.parentOffset
  let start = offset
  let end = offset
  let cursor = 0
  parent.forEach((child) => {
    const childEnd = cursor + child.nodeSize
    if (child.isText && child.marks.some((m) => m.eq(mark))) {
      if (cursor <= offset && offset <= childEnd) {
        start = cursor
        end = childEnd
      }
    }
    cursor = childEnd
  })
  const base = $from.start()
  return { href: String(mark.attrs.href ?? ''), from: base + start, to: base + end }
}

const truncate = (url: string) => (url.length > 42 ? `${url.slice(0, 41)}…` : url)

export function NoteToolbar({ editor }: { editor: Editor | null }) {
  // A re-render per transaction, so everything below is read fresh. No mark state,
  // no selection state, nothing to fall out of step with the document.
  const [, bump] = useState(0)
  const [linkFieldOpen, setLinkFieldOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editor) return
    const rerender = () => bump((n) => n + 1)
    editor.on('transaction', rerender)
    editor.on('focus', rerender)
    editor.on('blur', rerender)
    return () => {
      editor.off('transaction', rerender)
      editor.off('focus', rerender)
      editor.off('blur', rerender)
    }
  }, [editor])

  const close = useCallback(() => {
    setLinkFieldOpen(false)
    setDraft('')
  }, [])

  useEffect(() => {
    if (linkFieldOpen) inputRef.current?.focus()
  }, [linkFieldOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  if (!editor) return null

  const { state } = editor
  const { empty, from, to } = state.selection
  const link = linkAtCaret(editor)
  // While the URL field is open the editor is deliberately not focused, because the
  // caret is in the input. Keying visibility on editor focus alone would unmount the
  // field the moment it was clicked into.
  const showToolbar = linkFieldOpen || (editor.isFocused && !empty)
  const showPopover = editor.isFocused && empty && !!link && !linkFieldOpen
  if (!showToolbar && !showPopover) return null

  const coords = (): Rect => {
    const start = editor.view.coordsAtPos(showPopover && link ? link.from : from)
    const end = editor.view.coordsAtPos(showPopover && link ? link.to : to)
    return {
      top: Math.min(start.top, end.top),
      bottom: Math.max(start.bottom, end.bottom),
      left: (start.left + end.right) / 2,
    }
  }
  const rect = coords()

  const run = (action: () => void) => (event: React.MouseEvent) => {
    // Keep the selection: the toolbar acts on it, and a mousedown that reaches the
    // document would collapse it first.
    event.preventDefault()
    action()
  }

  /**
   * Our own ProseMirror commands go straight to the view, never through a Tiptap
   * chain. A chain maintains its own transaction and dispatches it, and these
   * commands build and dispatch their own, so chaining them is two dispatches for
   * one operation: see the keymap note in section 2 of the doc. Tiptap's own mark
   * commands are chained, because they are written for it.
   */
  const dispatchCommand = (command: Command) => {
    editor.view.focus()
    command(editor.view.state, editor.view.dispatch)
  }

  const applyLink = () => {
    const href = draft.trim()
    if (href === '') {
      editor.chain().focus().unsetLink().run()
    } else {
      const normalized = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`
      editor.chain().focus().setLink({ href: normalized }).run()
    }
    close()
  }

  if (showPopover && link) {
    return (
      <div
        className="note-popover"
        style={{ top: rect.bottom, left: rect.left }}
        role="group"
        aria-label="Link"
      >
        <span className="note-popover-url" title={link.href}>
          {truncate(link.href)}
        </span>
        <button
          type="button"
          className="note-popover-action"
          onMouseDown={run(() => window.open(link.href, '_blank', 'noreferrer,noopener'))}
        >
          Open
        </button>
        <button
          type="button"
          className="note-popover-action"
          onMouseDown={run(() =>
            editor.chain().focus().setTextSelection({ from: link.from, to: link.to }).unsetLink().run(),
          )}
        >
          Remove
        </button>
      </div>
    )
  }

  if (linkFieldOpen) {
    return (
      <div className="note-toolbar note-toolbar-link" style={{ top: rect.top, left: rect.left }}>
        <input
          ref={inputRef}
          className="note-link-input"
          type="text"
          value={draft}
          placeholder="Paste a link"
          aria-label="Link address"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              applyLink()
            }
          }}
        />
        <button type="button" className="note-tb-text" onMouseDown={run(applyLink)}>
          Apply
        </button>
      </div>
    )
  }

  const marks: [string, string, string][] = [
    ['bold', 'Bold', 'note-tb-bold'],
    ['italic', 'Italic', 'note-tb-italic'],
    ['strike', 'Strike', 'note-tb-strike'],
  ]
  const label: Record<string, string> = { bold: 'B', italic: 'I', strike: 'S' }
  const sectionAvailable = convertRowToSection(state, undefined)

  return (
    <div className="note-toolbar" style={{ top: rect.top, left: rect.left }} role="toolbar" aria-label="Format">
      {marks.map(([name, title, className]) => (
        <button
          key={name}
          type="button"
          className={`${className}${editor.isActive(name) ? ' active' : ''}`}
          aria-label={title}
          aria-pressed={editor.isActive(name)}
          title={title}
          onMouseDown={run(() => {
            if (name === 'bold') editor.chain().focus().toggleBold().run()
            if (name === 'italic') editor.chain().focus().toggleItalic().run()
            if (name === 'strike') editor.chain().focus().toggleStrike().run()
          })}
        >
          {label[name]}
        </button>
      ))}
      <button
        type="button"
        className={editor.isActive('link') ? 'active' : undefined}
        aria-label="Link"
        title="Link"
        onMouseDown={run(() => {
          setDraft(editor.isActive('link') ? String(editor.getAttributes('link').href ?? '') : '')
          setLinkFieldOpen(true)
        })}
      >
        <LinkGlyph />
      </button>
      <span className="note-tb-sep" />
      <button
        type="button"
        className={editor.isActive('check') ? 'active' : undefined}
        aria-label="Checkbox"
        title="Checkbox"
        onMouseDown={run(() => dispatchCommand(setRowType('check')))}
      >
        <CheckboxGlyph />
      </button>
      <button
        type="button"
        className={editor.isActive('bullet') ? 'active' : undefined}
        aria-label="Bullet"
        title="Bullet"
        onMouseDown={run(() => dispatchCommand(setRowType('bullet')))}
      >
        <BulletGlyph />
      </button>
      <button
        type="button"
        className={editor.isActive('quote') ? 'active' : undefined}
        aria-label="Quote"
        title="Quote"
        onMouseDown={run(() => dispatchCommand(toggleQuote))}
      >
        <QuoteGlyph />
      </button>
      <button
        type="button"
        aria-label="Section"
        title={sectionAvailable ? 'Section' : 'Sections only at the top level'}
        disabled={!sectionAvailable}
        onMouseDown={run(() => dispatchCommand(convertRowToSection))}
      >
        <SectionGlyph />
      </button>
    </div>
  )
}
