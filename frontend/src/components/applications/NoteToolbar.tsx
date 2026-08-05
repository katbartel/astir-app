'use client'

// The selection toolbar and the link popover. See docs/notes-editor.md 6.8 and 7.
//
// Everything shown here is derived from the editor at render time: which marks are
// active, whether the section button is available, what the link under the caret
// points at. Nothing is cached. The only state this component owns is UI state
// nobody else can know (whether the URL field is open, and what has been typed into
// it), which is not document state.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Command } from '@tiptap/pm/state'
import { convertRowToSection, setRowType, toggleQuote } from './noteEditing'

type Rect = { top: number; left: number; bottom: number }

/**
 * Which tools a field offers. The schema is identical either way, so a note stays
 * portable between the two surfaces and there is exactly one canonical form. Only the
 * buttons differ.
 *
 * `compact` drops quote and section: a weekly-goal task note is a short scratchpad,
 * and the goals card has no room to render a section's structure. The `[]` and `- `
 * triggers still work, and paste flattening already means a section cannot arrive that
 * way either.
 */
export type NoteTool = 'bold' | 'italic' | 'strike' | 'link' | 'check' | 'bullet' | 'quote' | 'section'

export const NOTE_TOOLS_FULL: NoteTool[] = [
  'bold',
  'italic',
  'strike',
  'link',
  'check',
  'bullet',
  'quote',
  'section',
]

export const NOTE_TOOLS_COMPACT: NoteTool[] = ['bold', 'italic', 'strike', 'link', 'check', 'bullet']

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

// Outline only, no fill, no solid button: the resting state is the bare icon and hover
// adds the tinted square. See docs/notes-editor.md 5.6.
const TickGlyph = () => (
  <svg {...SVG_PROPS}>
    <path d="M5 12.5l4.2 4.2 9-9.4" />
  </svg>
)
const OpenGlyph = () => (
  <svg {...SVG_PROPS}>
    <path d="M14 5h5v5" />
    <path d="M19 5l-7.5 7.5" />
    <path d="M18 14v4a1.8 1.8 0 01-1.8 1.8H6.8A1.8 1.8 0 015 18V8.6A1.8 1.8 0 016.8 6.8H11" />
  </svg>
)
const RemoveGlyph = () => (
  <svg {...SVG_PROPS}>
    <path d="M5.5 8h13" />
    <path d="M9.5 8V6.2A1.2 1.2 0 0110.7 5h2.6A1.2 1.2 0 0114.5 6.2V8" />
    <path d="M7.2 8l.8 10.2A1.6 1.6 0 009.6 19.7h4.8a1.6 1.6 0 001.6-1.5L16.8 8" />
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

/** Room the toolbar needs above the selection before it has to flip below it. */
const TOOLBAR_CLEARANCE = 48
/** Air kept between a floating surface and the screen edge. */
const EDGE_MARGIN = 8

export function NoteToolbar({
  editor,
  tools = NOTE_TOOLS_FULL,
}: {
  editor: Editor | null
  tools?: NoteTool[]
}) {
  // A re-render per transaction, so everything below is read fresh. No mark state,
  // no selection state, nothing to fall out of step with the document.
  const [, bump] = useState(0)
  const [linkFieldOpen, setLinkFieldOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  // Measured, so the surface can be centred on the selection and still kept on
  // screen. Centring with translate(-50%) alone puts a wide toolbar off the left
  // edge of a short selection, where it cannot be clicked.
  const [surfaceWidth, setSurfaceWidth] = useState(0)

  /**
   * Where the surface sits, recomputed on selection changes only.
   *
   * Recovered behaviour: the deleted editor set its toolbar position when the
   * selection changed and left it alone otherwise. The rebuild recomputed on every
   * transaction, so collapsing a section, which moves the rows below it, moved the
   * toolbar with them: the anchor was the current layout rather than the selection
   * that summoned it. Marks still re-read on every transaction, because reading them
   * does not move anything.
   */
  const [anchor, setAnchor] = useState<Rect | null>(null)

  useEffect(() => {
    if (!editor) return
    const rerender = () => bump((n) => n + 1)
    const reanchor = () => {
      const { from, to, empty } = editor.state.selection
      const link = linkAtCaret(editor)
      const showsPopover = empty && !!link
      if (!editor.isFocused || (empty && !link)) {
        setAnchor(null)
        rerender()
        return
      }
      try {
        const start = editor.view.coordsAtPos(showsPopover && link ? link.from : from)
        const end = editor.view.coordsAtPos(showsPopover && link ? link.to : to)
        setAnchor({
          top: Math.min(start.top, end.top),
          bottom: Math.max(start.bottom, end.bottom),
          left: (start.left + end.right) / 2,
        })
      } catch {
        setAnchor(null)
      }
      rerender()
    }
    editor.on('transaction', rerender)
    editor.on('selectionUpdate', reanchor)
    editor.on('focus', reanchor)
    editor.on('blur', reanchor)
    return () => {
      editor.off('transaction', rerender)
      editor.off('selectionUpdate', reanchor)
      editor.off('focus', reanchor)
      editor.off('blur', reanchor)
    }
  }, [editor])

  const close = useCallback(() => {
    setLinkFieldOpen(false)
    setDraft('')
  }, [])

  useLayoutEffect(() => {
    const width = surfaceRef.current?.offsetWidth ?? 0
    if (width > 0 && width !== surfaceWidth) setSurfaceWidth(width)
  }, [surfaceWidth, linkFieldOpen])

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

  /**
   * Cmd+K opens the URL field, which is the deleted editor's binding restored.
   *
   * It lives here rather than in the keymap because the field it opens is this
   * component's state. The listener is on the editor's DOM and is registered whenever
   * the editor exists: this component renders null when there is nothing to show, but
   * it stays mounted, so the shortcut works before the toolbar is visible.
   */
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      if (event.shiftKey || event.altKey) return
      event.preventDefault()
      setDraft(editor.isActive('link') ? String(editor.getAttributes('link').href ?? '') : '')
      setLinkFieldOpen(true)
    }
    dom.addEventListener('keydown', onKey)
    return () => dom.removeEventListener('keydown', onKey)
  }, [editor])

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

  // The anchor from the last selection change, never the current layout.
  const rect =
    anchor ??
    (() => {
      const start = editor.view.coordsAtPos(showPopover && link ? link.from : from)
      const end = editor.view.coordsAtPos(showPopover && link ? link.to : to)
      return {
        top: Math.min(start.top, end.top),
        bottom: Math.max(start.bottom, end.bottom),
        left: (start.left + end.right) / 2,
      }
    })()
  // Above the selection by default, flipped below when there is no room. Without
  // this a note near the top of the viewport puts its own toolbar off-screen, where
  // it cannot be clicked and looks like a button that does nothing.
  const below = rect.top < TOOLBAR_CLEARANCE

  /** Centred on the selection, then clamped to the screen. AGENTS.md 4: never past an edge. */
  const clampedLeft = (() => {
    if (surfaceWidth === 0) return rect.left
    const viewport = typeof window === 'undefined' ? 0 : window.innerWidth
    const ideal = rect.left - surfaceWidth / 2
    const most = Math.max(EDGE_MARGIN, viewport - surfaceWidth - EDGE_MARGIN)
    return Math.min(Math.max(ideal, EDGE_MARGIN), most)
  })()

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

  // ONE surface for both link states, and the surface IS the field: no input with a
  // border of its own inside a bordered box. See docs/notes-editor.md 5.6.
  //
  //   empty            placeholder, and a tick on the right
  //   typing/editing   the URL as editable text, the same tick in the same place
  //   saved            the URL as editable text, then open-in-new-tab and remove
  //
  // Nothing moves between empty and typing, which is why the tick keeps its position
  // rather than appearing when the field becomes non-empty.
  if (showPopover || linkFieldOpen) {
    const saved = !!link && !linkFieldOpen
    const value = saved ? link.href : draft
    const commit = () => {
      if (saved) return
      applyLink()
    }
    return (
      <div
        ref={surfaceRef}
        className="note-linkbar"
        data-state={saved ? 'saved' : 'editing'}
        style={{ top: rect.bottom, left: clampedLeft }}
        role="group"
        aria-label="Link"
      >
        <input
          ref={inputRef}
          className="note-linkbar-field"
          type="text"
          value={value}
          placeholder="Paste the link"
          aria-label="Link address"
          spellCheck={false}
          onFocus={() => {
            // Editing a saved link is done in place: the field is the same element, so
            // there is no pencil and no second mode to enter.
            if (saved && link) {
              setDraft(link.href)
              setLinkFieldOpen(true)
            }
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
        />
        <span className="note-linkbar-divider" aria-hidden="true" />
        {saved && link ? (
          <>
            <button
              type="button"
              className="note-linkbar-icon"
              aria-label="Open in new tab"
              data-tooltip="Open in new tab"
              onMouseDown={run(() => window.open(link.href, '_blank', 'noreferrer,noopener'))}
            >
              <OpenGlyph />
            </button>
            <button
              type="button"
              className="note-linkbar-icon"
              aria-label="Remove link"
              data-tooltip="Remove link"
              onMouseDown={run(() =>
                editor.chain().focus().setTextSelection({ from: link.from, to: link.to }).unsetLink().run(),
              )}
            >
              <RemoveGlyph />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="note-linkbar-icon"
            aria-label="Save"
            data-tooltip="Save"
            onMouseDown={run(commit)}
          >
            <TickGlyph />
          </button>
        )}
      </div>
    )
  }

  const has = (tool: NoteTool) => tools.includes(tool)
  const marks: [NoteTool, string, string][] = (
    [
      ['bold', 'Bold', 'note-tb-bold'],
      ['italic', 'Italic', 'note-tb-italic'],
      ['strike', 'Strikethrough', 'note-tb-strike'],
    ] as [NoteTool, string, string][]
  ).filter(([name]) => has(name))
  const label: Record<string, string> = { bold: 'B', italic: 'I', strike: 'S' }
  /**
   * Recovered: the deleted toolbar used the app's own tooltip layer through
   * `data-tooltip`, not the browser's native `title`, and it showed the shortcut
   * beside the name.
   *
   * Every shortcut named here is bound and was verified by pressing it: Cmd+B, Cmd+I
   * and Shift+Cmd+S come from StarterKit, Shift+Cmd+E and Shift+Cmd+O are in the
   * keymap, and Cmd+K is bound in this file. The checkbox and bullet name their text
   * triggers, which is what the deleted editor's tooltips did.
   */
  const shortcut: Record<string, string> = {
    Bold: '\u2318B',
    Italic: '\u2318I',
    Strikethrough: '\u21e7\u2318S',
    Link: '\u2318K',
    Checkbox: '[]',
    Bullet: '- ',
    Quote: '\u21e7\u2318E',
    Section: '\u21e7\u2318O',
  }
  const sectionAvailable = convertRowToSection(state, undefined)

  return (
    <div
      ref={surfaceRef}
      className="note-toolbar"
      data-below={below ? 'true' : 'false'}
      style={{ top: below ? rect.bottom : rect.top, left: clampedLeft }}
      role="toolbar"
      aria-label="Format"
    >
      {marks.map(([name, title, className]) => (
        <button
          key={name}
          type="button"
          className={`${className}${editor.isActive(name) ? ' active' : ''}`}
          aria-label={title}
          aria-pressed={editor.isActive(name)}
          data-tooltip={title}
          data-tooltip-key={shortcut[title] ?? ''}
          data-tooltip-above=""
          onMouseDown={run(() => {
            if (name === 'bold') editor.chain().focus().toggleBold().run()
            if (name === 'italic') editor.chain().focus().toggleItalic().run()
            if (name === 'strike') editor.chain().focus().toggleStrike().run()
          })}
        >
          {label[name]}
        </button>
      ))}
      {has('link') ? (
      <button
        type="button"
        className={editor.isActive('link') ? 'active' : undefined}
        aria-label="Link"
        data-tooltip="Link"
        data-tooltip-key={shortcut.Link}
        data-tooltip-above=""
        onMouseDown={run(() => {
          setDraft(editor.isActive('link') ? String(editor.getAttributes('link').href ?? '') : '')
          setLinkFieldOpen(true)
        })}
      >
        <LinkGlyph />
      </button>
      ) : null}
      {(has('check') || has('bullet') || has('quote') || has('section')) && marks.length + (has('link') ? 1 : 0) > 0 ? (
        <span className="note-tb-sep" />
      ) : null}
      {has('check') ? (
      <button
        type="button"
        className={editor.isActive('check') ? 'active' : undefined}
        aria-label="Checkbox"
        data-tooltip="Checkbox"
        data-tooltip-key={shortcut.Checkbox}
        data-tooltip-above=""
        onMouseDown={run(() => dispatchCommand(setRowType('check')))}
      >
        <CheckboxGlyph />
      </button>
      ) : null}
      {has('bullet') ? (
      <button
        type="button"
        className={editor.isActive('bullet') ? 'active' : undefined}
        aria-label="Bullet"
        data-tooltip="Bullet"
        data-tooltip-key={shortcut.Bullet}
        data-tooltip-above=""
        onMouseDown={run(() => dispatchCommand(setRowType('bullet')))}
      >
        <BulletGlyph />
      </button>
      ) : null}
      {has('quote') ? (
      <button
        type="button"
        className={editor.isActive('quote') ? 'active' : undefined}
        aria-label="Quote"
        data-tooltip="Quote"
        data-tooltip-key={shortcut.Quote}
        data-tooltip-above=""
        onMouseDown={run(() => dispatchCommand(toggleQuote))}
      >
        <QuoteGlyph />
      </button>
      ) : null}
      {has('section') ? (
      <button
        type="button"
        aria-label="Section"
        data-tooltip={sectionAvailable ? 'Section' : 'Sections only at the top level'}
        data-tooltip-key={sectionAvailable ? shortcut.Section : ''}
        data-tooltip-above=""
        disabled={!sectionAvailable}
        onMouseDown={run(() => dispatchCommand(convertRowToSection))}
      >
        <SectionGlyph />
      </button>
      ) : null}
    </div>
  )
}
