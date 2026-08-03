// The notes document schema. See docs/notes-editor.md section 3.
//
// This file is the spec, executed. Every structural rule the editor relies on is
// a content expression here rather than a check somewhere in a handler:
//
//   * a row carries at most one marker, because check/bullet/paragraph are
//     distinct node types and a node cannot be two types;
//   * sections never nest, because `section` belongs to no group and no content
//     expression except the document's mentions it;
//   * quotes never nest, because `quote` takes `row+` rather than `block+`.
//
// If you find yourself adding a guard clause to enforce one of those, the schema
// is wrong and the guard is a symptom. Fix the schema.
//
// No UI lives here. Markers, grips, and indentation are section 5's problem.

import { Node, getSchema, mergeAttributes } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Node as PmNode, type Schema } from '@tiptap/pm/model'

/**
 * Groups:
 *   row   = nodes holding inline content directly and rendering as one row.
 *           Exactly the nodes that can carry a marker.
 *   block = row, plus quote.
 * `section` is in neither, on purpose.
 */
const ROW = 'row block'

/** Replaces the default doc, whose `block+` would exclude sections. */
export const NoteDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | section)+',
})

/**
 * Our own paragraph rather than StarterKit's, which is in `block` only. A
 * paragraph is a row: it takes a grip, and it is what a marker row becomes when
 * its marker is dropped.
 */
export const NoteParagraph = Node.create({
  name: 'paragraph',
  group: ROW,
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'p' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { class: 'note-row note-para' }), 0]
  },
})

export const NoteCheck = Node.create({
  name: 'check',
  group: ROW,
  content: 'inline*',
  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-checked') === 'true',
        renderHTML: (attributes) => ({ 'data-checked': attributes.checked ? 'true' : 'false' }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="check"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'check', class: 'note-row note-check-row' }),
      0,
    ]
  },
})

export const NoteBullet = Node.create({
  name: 'bullet',
  group: ROW,
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'div[data-type="bullet"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'bullet', class: 'note-row note-bullet-row' }),
      0,
    ]
  },
})

/** `row+`, not `block+`: a quote cannot hold another quote or a section. */
export const NoteQuote = Node.create({
  name: 'quote',
  group: 'block',
  content: 'row+',
  defining: true,
  parseHTML() {
    return [{ tag: 'blockquote' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes, { class: 'note-blockquote' }), 0]
  },
})

/**
 * A section is a header plus a body. It is in no group, which is the whole
 * mechanism behind "sections never nest": nothing that a section can contain
 * lists `section` in its content expression, so the schema cannot build one
 * inside another, inside a quote, or inside a body.
 */
export const NoteSection = Node.create({
  name: 'section',
  content: 'sectionTitle sectionBody',
  isolating: true,
  addAttributes() {
    return {
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => ({ 'data-collapsed': attributes.collapsed ? 'true' : 'false' }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'section[data-type="note-section"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, { 'data-type': 'note-section', class: 'note-section' }),
      0,
    ]
  },
})

export const NoteSectionTitle = Node.create({
  name: 'sectionTitle',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="section-title"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'section-title', class: 'note-section-title' }),
      0,
    ]
  },
})

/**
 * `block+`, so a section always has at least one row and the caret always has
 * somewhere to go. A section that loses its last child keeps one empty paragraph
 * and stays on screen. See docs/notes-editor.md 3.3.
 */
export const NoteSectionBody = Node.create({
  name: 'sectionBody',
  content: 'block+',
  parseHTML() {
    return [{ tag: 'div[data-type="section-body"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'section-body', class: 'note-section-body' }),
      0,
    ]
  },
})

/**
 * What StarterKit is kept for: text, hardBreak, bold, italic, strike, link,
 * dropcursor, gapcursor, and undo/redo. Everything else it ships is switched off
 * here, and the reason is the same in every case: it is not in the schema, so it
 * must not be reachable by a paste, a shortcut, or an input rule.
 */
export const NoteStarterKit = StarterKit.configure({
  // Replaced above, because sections and rows need different groups than the
  // defaults give.
  document: false,
  paragraph: false,

  // Not in the schema. Notes have one level of nesting and four row types.
  heading: false,
  blockquote: false, // our own `quote`, with row+ content
  bulletList: false, // our own flat `bullet` row
  orderedList: false,
  listItem: false,
  listKeymap: false,
  code: false,
  codeBlock: false,
  horizontalRule: false,

  // Cut deliberately: an underline mark collides with link styling, and the
  // link is worth more. See docs/notes-editor.md 3.2.
  underline: false,

  // Nothing appends a trailing node to a notes document. An empty last row is
  // real content when it is there and must not be conjured when it is not.
  trailingNode: false,

  link: {
    openOnClick: false, // clicking places the caret; cmd or ctrl click opens
    autolink: false, // a link is applied deliberately, never guessed from typing
    linkOnPaste: false,
    HTMLAttributes: { class: 'note-link', rel: 'noreferrer noopener' },
  },

  // Word-level undo, carried forward from the editor being replaced: same input
  // kind, roughly 700ms, breaking at spaces. See docs/notes-editor.md 9.
  undoRedo: { newGroupDelay: 700 },
})

/** Schema only, no views and no key handling. What the schema tests assert against. */
export const noteExtensions: Extensions = [
  NoteStarterKit,
  NoteDocument,
  NoteParagraph,
  NoteCheck,
  NoteBullet,
  NoteQuote,
  NoteSection,
  NoteSectionTitle,
  NoteSectionBody,
]

/** The schema, built without an editor, so it can be asserted against in tests. */
let cached: Schema | null = null
export function noteSchema(): Schema {
  if (!cached) cached = getSchema(noteExtensions)
  return cached
}

/**
 * A document in the form the schema itself would produce.
 *
 * The migration mapping is deliberately dependency-free, so it cannot know three
 * things the schema does: a mark's default attributes (Tiptap's link carries
 * target, rel, class, and title beyond the href), that two adjacent text runs with
 * identical marks are one text node, and that marked text serialises as
 * `{type, marks, text}` in that order. Its output is therefore valid but not
 * canonical, and comparing it to what comes back out of an editor would fail on
 * form rather than on content.
 *
 * Everything written to a store goes through here, so what is stored is what the
 * editor produces, and invariant 12 is an equality rather than an approximation.
 */
export function canonicalDoc(doc: unknown): Record<string, unknown> {
  return PmNode.fromJSON(noteSchema(), doc).toJSON() as Record<string, unknown>
}
