// NodeViews and the placeholder. See docs/notes-editor.md sections 5 and 11.
//
// INVARIANT 16, and the reason this file is written the way it is: a NodeView
// holds no state. It renders from the node's attributes and it dispatches
// transactions. There is no field here caching `checked`, no flag remembering
// whether a section is open, and nothing reads the DOM to decide what to draw.
// `update(node)` is the only thing that changes what is on screen, and it is
// handed the new node.
//
// A NodeView keeping its own copy of the document's state is the failure this
// rewrite exists to delete, in a different costume.

import { Extension, Node as CoreNode } from '@tiptap/core'
import { Plugin, PluginKey, type Command } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView, NodeView } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'
import {
  NoteBullet,
  NoteCheck,
  NoteDocument,
  NoteLink,
  NoteParagraph,
  NoteQuote,
  NoteSection,
  NoteSectionBody,
  NoteSectionTitle,
  NoteStarterKit,
} from './noteSchema'
import { NoteEditing, toggleCheckedAt, toggleCollapsedAt } from './noteEditing'
import { NoteDrag } from './noteDrag'

// --- glyphs ---
// Real SVG, per AGENTS.md 4.6: never a text glyph for a UI icon. Colour comes from
// `currentColor` so it follows the tokens set in CSS and no value is hardcoded here.

const SVG = 'http://www.w3.org/2000/svg'

function svg(viewBox: string, d: string, filled = false): SVGSVGElement {
  const root = document.createElementNS(SVG, 'svg')
  root.setAttribute('viewBox', viewBox)
  root.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', d)
  if (filled) path.setAttribute('fill', 'currentColor')
  root.appendChild(path)
  return root
}

/** The app's check mark, same path as CheckIcon so the glyph matches everywhere. */
const checkGlyph = () => svg('0 0 24 24', 'M5.5 12.5l4.2 4.2 8.8-9.4')

/** A disclosure triangle, rotated by CSS rather than swapped for another glyph. */
const triangleGlyph = () => svg('0 0 24 24', 'M9 5l8 7-8 7z', true)

/** A bullet: a small disc, not a "•" character. */
const bulletGlyph = () => svg('0 0 8 8', 'M4 1.5A2.5 2.5 0 104 6.5 2.5 2.5 0 004 1.5z', true)

// --- shared helpers ---

/** Mutations outside the editable content are ours, not the document's. */
const ignoreOutsideContent = (contentDOM: HTMLElement) => (mutation: MutationRecord | { target: globalThis.Node }) =>
  !contentDOM.contains(mutation.target as globalThis.Node)

/**
 * Wire a control that dispatches a transaction. Pointer-down is swallowed so the
 * caret does not move: a toggle is not a place to put the caret.
 */
function controlFor(
  button: HTMLButtonElement,
  view: EditorView,
  getPos: () => number | undefined,
  command: (pos: number) => Command,
): void {
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const pos = getPos()
    if (pos === undefined) return
    command(pos)(view.state, view.dispatch)
    view.focus()
  })
}

// --- check ---

function checkView(node: PmNode, view: EditorView, getPos: () => number | undefined): NodeView {
  const dom = document.createElement('div')
  dom.className = 'note-row note-check-row'

  const box = document.createElement('button')
  box.type = 'button'
  box.className = 'note-box'
  box.setAttribute('contenteditable', 'false')
  box.setAttribute('role', 'checkbox')
  box.appendChild(checkGlyph())

  const contentDOM = document.createElement('div')
  contentDOM.className = 'note-line'

  dom.append(box, contentDOM)
  controlFor(box, view, getPos, toggleCheckedAt)

  /** Everything visible about the box comes from the node. */
  const draw = (current: PmNode) => {
    const checked = current.attrs.checked === true
    dom.dataset.checked = checked ? 'true' : 'false'
    box.setAttribute('aria-checked', checked ? 'true' : 'false')
    box.setAttribute('aria-label', checked ? 'Done' : 'Not done')
  }
  draw(node)

  return {
    dom,
    contentDOM,
    update: (updated) => {
      if (updated.type.name !== 'check') return false
      draw(updated)
      return true
    },
    ignoreMutation: ignoreOutsideContent(contentDOM),
    stopEvent: (event) => event.target === box || box.contains(event.target as globalThis.Node),
  }
}

// --- bullet ---

function bulletView(): NodeView {
  const dom = document.createElement('div')
  dom.className = 'note-row note-bullet-row'

  const marker = document.createElement('span')
  marker.className = 'note-bullet'
  marker.setAttribute('contenteditable', 'false')
  marker.setAttribute('aria-hidden', 'true')
  marker.appendChild(bulletGlyph())

  const contentDOM = document.createElement('div')
  contentDOM.className = 'note-line'

  dom.append(marker, contentDOM)
  return {
    dom,
    contentDOM,
    update: (updated) => updated.type.name === 'bullet',
    ignoreMutation: ignoreOutsideContent(contentDOM),
  }
}

// --- section ---

function sectionView(node: PmNode, view: EditorView, getPos: () => number | undefined): NodeView {
  const dom = document.createElement('section')
  dom.className = 'note-section'

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'note-disclosure'
  toggle.setAttribute('contenteditable', 'false')
  toggle.appendChild(triangleGlyph())

  const contentDOM = document.createElement('div')
  contentDOM.className = 'note-section-inner'

  dom.append(toggle, contentDOM)
  controlFor(toggle, view, getPos, toggleCollapsedAt)

  const draw = (current: PmNode) => {
    const collapsed = current.attrs.collapsed === true
    // The body stays in the document and in the DOM. This attribute is the only
    // thing that hides it, so nothing is serialised, parsed, or regenerated by a
    // toggle. See docs/notes-editor.md 3.3.
    dom.dataset.collapsed = collapsed ? 'true' : 'false'
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    toggle.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section')
  }
  draw(node)

  return {
    dom,
    contentDOM,
    update: (updated) => {
      if (updated.type.name !== 'section') return false
      draw(updated)
      return true
    },
    ignoreMutation: ignoreOutsideContent(contentDOM),
    stopEvent: (event) => event.target === toggle || toggle.contains(event.target as globalThis.Node),
  }
}

// --- placeholder ---

const placeholderKey = new PluginKey('notePlaceholder')

/**
 * "Add a note" shows on exactly one condition: the document is a single empty
 * paragraph. Keyed on that and not on Tiptap's isEmpty, because the two differ on
 * a real note: three empty rows is not empty, keeps its rows (invariant 2), and
 * must not show the placeholder.
 */
export function isPlaceholderDocument(doc: PmNode): boolean {
  if (doc.childCount !== 1) return false
  const only = doc.firstChild
  return !!only && only.type.name === 'paragraph' && only.content.size === 0
}

export const NotePlaceholder = Extension.create<{ text: string; titleText: string }>({
  name: 'notePlaceholder',
  addOptions() {
    // "Toggle title" is the deleted editor's own wording for an empty section header,
    // recovered rather than reinvented. See docs/notes-editor.md 5.3.
    return { text: 'Add a note', titleText: 'Toggle title' }
  },
  addProseMirrorPlugins() {
    const { text, titleText } = this.options
    return [
      new Plugin({
        key: placeholderKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = []
            if (isPlaceholderDocument(state.doc)) {
              decorations.push(
                Decoration.node(0, state.doc.firstChild!.nodeSize, {
                  class: 'note-placeholder',
                  'data-placeholder': text,
                }),
              )
            }
            // An empty section header gets its own placeholder. The old rule was
            // `.note-collapse-summary:empty::before`, which cannot work here: every
            // empty ProseMirror textblock holds a trailing <br>, so `:empty` never
            // matches. A decoration asks the document instead of the DOM, which is
            // what the rest of this editor does anyway.
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'sectionTitle') return true
              if (node.content.size === 0) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'note-placeholder note-title-placeholder',
                    'data-placeholder': titleText,
                  }),
                )
              }
              return false
            })
            return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
          },
        },
      }),
    ]
  },
})

// --- the editor's extension list ---

const withView = (node: CoreNode, build: (node: PmNode, view: EditorView, getPos: () => number | undefined) => NodeView) =>
  node.extend({
    addNodeView() {
      return ({ node, editor, getPos }) => build(node, editor.view, getPos as () => number | undefined)
    },
  })

/**
 * The schema list plus views, key handling, and the placeholder. The schema tests
 * use `noteExtensions` instead, so they assert against structure alone.
 */
export const noteEditorExtensions = [
  NoteStarterKit,
  NoteLink,
  NoteDocument,
  NoteParagraph,
  withView(NoteCheck, checkView),
  withView(NoteBullet, () => bulletView()),
  NoteQuote,
  withView(NoteSection, sectionView),
  NoteSectionTitle,
  NoteSectionBody,
  NoteEditing,
  NoteDrag,
  NotePlaceholder,
]
