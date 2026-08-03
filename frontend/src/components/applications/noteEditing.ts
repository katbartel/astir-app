// Keyboard semantics for the notes editor. See docs/notes-editor.md section 6.
//
// Every key below has an explicit handler and every handler produces exactly one
// transaction, so it is one undo step. The browser is never allowed to modify
// structure: a handler that decides not to act returns false only where the
// default is provably harmless (typing, and Tab, which moves focus).
//
// Nothing here reads the DOM. Every "where is the caret" question is answered
// against the document, because that is the only source of truth (invariant 5).

import { Extension, InputRule } from '@tiptap/core'
import { keymap } from '@tiptap/pm/keymap'
import { Plugin } from '@tiptap/pm/state'
import { Fragment, Slice, type Node as PmNode, type ResolvedPos, type Schema } from '@tiptap/pm/model'
import { TextSelection, type Command, type EditorState, type Transaction } from '@tiptap/pm/state'

const ROW_TYPES = ['paragraph', 'check', 'bullet']

const isRow = (node: PmNode | null | undefined): boolean =>
  !!node && ROW_TYPES.includes(node.type.name)

/** The row holding the caret, with the depth it sits at. */
function rowAround($pos: ResolvedPos): { node: PmNode; depth: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (isRow(node)) return { node, depth }
  }
  return null
}

/** The section title holding the caret, if the caret is in one. */
function titleAround($pos: ResolvedPos): { node: PmNode; depth: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (node.type.name === 'sectionTitle') return { node, depth }
  }
  return null
}

const isEmptyRow = (node: PmNode) => node.content.size === 0

/**
 * A row's container, which is what "the same container" means everywhere in
 * section 6: the doc, a sectionBody, or a quote.
 */
function containerOf($pos: ResolvedPos, rowDepth: number) {
  const depth = rowDepth - 1
  return { node: $pos.node(depth), depth, indexInParent: $pos.index(depth) }
}

/** Attributes a new row of the same type should carry. */
function sameType(node: PmNode, keepChecked: boolean) {
  if (node.type.name !== 'check') return { type: node.type, attrs: null }
  return { type: node.type, attrs: { checked: keepChecked ? node.attrs.checked : false } }
}

// --- Enter ---

export const noteEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty) {
    // One transaction, so still one undo step: clear the selection, then split at
    // the resulting caret.
    const tr = state.tr.deleteSelection()
    const next = tr.selection.$from
    return applyEnter(next, tr, state, dispatch)
  }
  return applyEnter($from, state.tr, state, dispatch)
}

function applyEnter(
  $from: ResolvedPos,
  transaction: Transaction,
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
): boolean {
  const schema = state.schema

  const title = titleAround($from)
  if (title) {
    const sectionDepth = title.depth - 1
    const sectionPos = $from.before(sectionDepth)
    const section = $from.node(sectionDepth)
    const body = section.child(1)
    const titleStart = $from.start(title.depth)
    const titleEnd = $from.end(title.depth)
    const atStart = $from.pos === titleStart
    const atEnd = $from.pos === titleEnd

    // The whole section moves down and a plain paragraph opens above it.
    if (atStart && title.node.content.size > 0) {
      if (!dispatch) return true
      transaction.insert(sectionPos, schema.nodes.paragraph.createChecked(null))
      transaction.setSelection(TextSelection.create(transaction.doc, sectionPos + 1))
      dispatch(transaction.scrollIntoView())
      return true
    }

    // The title keeps what is before the caret, the rest opens the body.
    if (!atEnd && title.node.content.size > 0) {
      if (!dispatch) return true
      const tail = title.node.content.cut($from.parentOffset)
      const bodyStart = sectionPos + 1 + title.node.nodeSize + 1
      transaction.delete($from.pos, titleEnd)
      // Map once, before inserting. Mapping again afterwards would carry the
      // position through the insert as well and land past the new row.
      const insertAt = transaction.mapping.map(bodyStart)
      transaction.insert(insertAt, schema.nodes.paragraph.createChecked(null, tail))
      transaction.setSelection(TextSelection.create(transaction.doc, insertAt + 1))
      dispatch(transaction.scrollIntoView())
      return true
    }

    // At the end, or the title is empty. Reuse the body's first row when it is
    // already empty rather than adding another one: opening a fresh row on every
    // press is what used to grow blank lines above a section's content.
    if (!dispatch) return true
    const bodyStart = sectionPos + 1 + title.node.nodeSize + 1
    const firstRow = body.firstChild
    if (firstRow && isRow(firstRow) && isEmptyRow(firstRow)) {
      transaction.setSelection(TextSelection.create(transaction.doc, bodyStart + 1))
    } else {
      transaction.insert(bodyStart, schema.nodes.paragraph.createChecked(null))
      transaction.setSelection(TextSelection.create(transaction.doc, bodyStart + 1))
    }
    dispatch(transaction.scrollIntoView())
    return true
  }

  const row = rowAround($from)
  if (!row) return false

  const rowStart = $from.start(row.depth)
  const rowEnd = $from.end(row.depth)
  const rowPos = $from.before(row.depth)
  const container = containerOf($from, row.depth)

  if (isEmptyRow(row.node)) {
    // A marker on an empty row drops, and nothing else happens. Position and
    // container are untouched.
    if (row.node.type.name !== 'paragraph') {
      if (!dispatch) return true
      transaction.setNodeMarkup(rowPos, schema.nodes.paragraph, null)
      transaction.setSelection(TextSelection.create(transaction.doc, rowStart))
      dispatch(transaction.scrollIntoView())
      return true
    }

    // An empty paragraph inside a section body or a quote leaves it. This is how
    // you get out of a section, and the third press of the Enter ladder.
    const containerName = container.node.type.name
    if (containerName === 'sectionBody' || containerName === 'quote') {
      if (!dispatch) return true
      liftRowOut(transaction, $from, row.depth, 'after', schema)
      dispatch(transaction.scrollIntoView())
      return true
    }

    // Top level: a new empty paragraph below, caret in it.
    if (!dispatch) return true
    transaction.insert(rowEnd + 1, schema.nodes.paragraph.createChecked(null))
    transaction.setSelection(TextSelection.create(transaction.doc, rowEnd + 2))
    dispatch(transaction.scrollIntoView())
    return true
  }

  // A non-empty row with the caret at offset 0: a new empty row of the same type
  // and the same checked state opens *above*, and the caret stays on it, so the
  // new item can be typed immediately. The original keeps its text and moves down.
  if ($from.pos === rowStart) {
    if (!dispatch) return true
    const { type, attrs } = sameType(row.node, true)
    transaction.insert(rowPos, type.createChecked(attrs))
    transaction.setSelection(TextSelection.create(transaction.doc, rowPos + 1))
    dispatch(transaction.scrollIntoView())
    return true
  }

  // At the end: a new row below, same type, check unchecked.
  if ($from.pos === rowEnd) {
    if (!dispatch) return true
    const { type, attrs } = sameType(row.node, false)
    transaction.insert(rowEnd + 1, type.createChecked(attrs))
    transaction.setSelection(TextSelection.create(transaction.doc, rowEnd + 2))
    dispatch(transaction.scrollIntoView())
    return true
  }

  // Mid-text: split. Marks travel with the text they were on, because the content
  // is moved rather than re-created.
  if (!dispatch) return true
  const tail = row.node.content.cut($from.parentOffset)
  const { type, attrs } = sameType(row.node, false)
  transaction.delete($from.pos, rowEnd)
  // Map once, before inserting, for the same reason as the title split above.
  const insertAt = transaction.mapping.map(rowEnd + 1)
  transaction.insert(insertAt, type.createChecked(attrs, tail))
  transaction.setSelection(TextSelection.create(transaction.doc, insertAt + 1))
  dispatch(transaction.scrollIntoView())
  return true
}

/**
 * Move a row out of its container and place it immediately before or after that
 * container. The container keeps a row if this emptied it, because block+ requires
 * one and because a section that loses its last child stays on screen (3.3).
 */
function liftRowOut(
  transaction: Transaction,
  $from: ResolvedPos,
  rowDepth: number,
  side: 'before' | 'after',
  schema: Schema,
): void {
  const containerDepth = rowDepth - 1
  const container = $from.node(containerDepth)
  const containerPos = $from.before(containerDepth)
  const row = $from.node(rowDepth)
  const rowPos = $from.before(rowDepth)

  // A section body sits inside a section, and "after the section" means after the
  // section node, not after the body.
  const outerDepth = container.type.name === 'sectionBody' ? containerDepth - 1 : containerDepth
  const outerStart = $from.before(outerDepth)
  const outerEnd = outerStart + $from.node(outerDepth).nodeSize

  transaction.delete(rowPos, rowPos + row.nodeSize)

  // Both sectionBody and quote require at least one child, so removing the last
  // one has to leave something behind: a section that loses its last child stays
  // on screen as a header with one empty row (3.3). ProseMirror's own fitting
  // usually supplies that paragraph while deleting, so check rather than assume,
  // or the body ends up with two.
  const mappedContainer = transaction.mapping.map(containerPos)
  const containerNow = transaction.doc.nodeAt(mappedContainer)
  if (containerNow && containerNow.childCount === 0) {
    transaction.insert(mappedContainer + 1, schema.nodes.paragraph.createChecked(null))
  }

  const target = side === 'before'
    ? transaction.mapping.map(outerStart)
    : transaction.mapping.map(outerEnd)
  transaction.insert(target, row)
  transaction.setSelection(TextSelection.create(transaction.doc, target + 1))
}


// --- crossing a container boundary ---
//
// One principle governs both keys: **content never crosses a container boundary
// by keystroke, the caret always may.** Merging a row that holds text into a
// section or a quote would absorb that text into the container, which is what the
// Delete asymmetry (6.4) exists to prevent. An empty row holds nothing to absorb,
// so it is deleted and the caret travels, which is what stops an empty row next to
// a section from being undeletable: there is no row-delete affordance to fall back
// on.
//
// The caret never lands inside a hidden body. Against a collapsed section it goes
// to the title.

/** End of the inline content of the last row inside a container, descending. */
function endOfLastRow(node: PmNode, nodeStart: number): number {
  if (isRow(node)) return nodeStart + 1 + node.content.size
  const last = node.lastChild
  if (!last) return nodeStart + 1
  return endOfLastRow(last, nodeStart + 1 + (node.content.size - last.nodeSize))
}

/** Start of the inline content of the first row inside a container, descending. */
function startOfFirstRow(node: PmNode, nodeStart: number): number {
  if (isRow(node)) return nodeStart + 1
  const first = node.firstChild
  if (!first) return nodeStart + 1
  return startOfFirstRow(first, nodeStart + 1)
}

/** Where the caret goes when it travels backwards into a container. */
function caretIntoEndOf(node: PmNode, nodeStart: number): number {
  if (node.type.name === 'section') {
    const title = node.child(0)
    // Never inside a hidden body.
    if (node.attrs.collapsed === true) return nodeStart + 2 + title.content.size
    const bodyStart = nodeStart + 1 + title.nodeSize
    return endOfLastRow(node.child(1), bodyStart)
  }
  return endOfLastRow(node, nodeStart)
}

/** Where the caret goes when it travels forwards into a container. */
function caretIntoStartOf(node: PmNode, nodeStart: number): number {
  if (node.type.name === 'section') {
    const title = node.child(0)
    if (node.attrs.collapsed === true) return nodeStart + 2
    const bodyStart = nodeStart + 1 + title.nodeSize
    return startOfFirstRow(node.child(1), bodyStart)
  }
  return startOfFirstRow(node, nodeStart)
}

// --- Backspace ---

export const noteBackspace: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty) return false // a selection deletes normally
  const schema = state.schema

  const title = titleAround($from)
  if (title) {
    if ($from.pos !== $from.start(title.depth)) return false
    // Dissolve: the body's rows take the section's place, in order, and the title
    // becomes a paragraph keeping its text. Content is never destroyed.
    if (!dispatch) return true
    const sectionDepth = title.depth - 1
    const sectionPos = $from.before(sectionDepth)
    const section = $from.node(sectionDepth)
    const body = section.child(1)
    const replacement: PmNode[] = [schema.nodes.paragraph.createChecked(null, title.node.content)]
    body.forEach((child) => replacement.push(child))
    const tr = state.tr.replaceWith(sectionPos, sectionPos + section.nodeSize, replacement)
    tr.setSelection(TextSelection.create(tr.doc, sectionPos + 1))
    dispatch(tr.scrollIntoView())
    return true
  }

  const row = rowAround($from)
  if (!row) return false
  if ($from.pos !== $from.start(row.depth)) return false

  const rowPos = $from.before(row.depth)
  const container = containerOf($from, row.depth)

  // A marker drops in one press, and nothing is deleted. This holds on a row with
  // text too, which is what every editor people use does.
  if (row.node.type.name !== 'paragraph') {
    if (!dispatch) return true
    const tr = state.tr.setNodeMarkup(rowPos, schema.nodes.paragraph, null)
    tr.setSelection(TextSelection.create(tr.doc, $from.pos))
    dispatch(tr.scrollIntoView())
    return true
  }

  // The first row of a section body or a quote leaves it, placed before the
  // container. No merge.
  if (container.indexInParent === 0) {
    const containerName = container.node.type.name
    if (containerName === 'sectionBody' || containerName === 'quote') {
      if (!dispatch) return true
      const tr = state.tr
      liftRowOut(tr, $from, row.depth, 'before', schema)
      dispatch(tr.scrollIntoView())
      return true
    }
    return false // first row of the note: no-op
  }

  const previous = container.node.child(container.indexInParent - 1)
  if (!isRow(previous)) {
    // Text would be absorbed into the container, so it stays put.
    if (row.node.content.size > 0) return true
    // An empty row has nothing to absorb: delete it and let the caret travel.
    if (!dispatch) return true
    const tr = state.tr.delete(rowPos, rowPos + row.node.nodeSize)
    const target = caretIntoEndOf(previous, rowPos - previous.nodeSize)
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(target)))
    dispatch(tr.scrollIntoView())
    return true
  }
  if (!dispatch) return true
  const joinAt = rowPos - 1
  const tr = state.tr.delete(rowPos - 1, rowPos + 1)
  tr.setSelection(TextSelection.create(tr.doc, joinAt))
  dispatch(tr.scrollIntoView())
  return true
}

// --- Delete ---

/**
 * Deliberately not the mirror of Backspace. Backspace at the start of a section's
 * first row ejects it; Delete at the end of its last row does nothing. Leaving a
 * container is easy, being absorbed into one is not. Do not "fix" this.
 */
export const noteDelete: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty) return false
  if (titleAround($from)) return true // never merges a title with its body

  const row = rowAround($from)
  if (!row) return false
  if ($from.pos !== $from.end(row.depth)) return false

  const container = containerOf($from, row.depth)
  if (container.indexInParent === container.node.childCount - 1) return true // last row of its container

  const next = container.node.child(container.indexInParent + 1)
  if (!isRow(next)) {
    // The mirror of Backspace, on the same principle: text never crosses into a
    // container, an empty row is deleted and the caret travels in.
    if (row.node.content.size > 0) return true
    if (!dispatch) return true
    const rowPos = $from.before(row.depth)
    const tr = state.tr.delete(rowPos, rowPos + row.node.nodeSize)
    const target = caretIntoStartOf(next, rowPos + row.node.nodeSize)
    tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(target)))
    dispatch(tr.scrollIntoView())
    return true
  }

  if (!dispatch) return true
  const rowEnd = $from.end(row.depth)
  const tr = state.tr.delete(rowEnd, rowEnd + 2)
  tr.setSelection(TextSelection.create(tr.doc, rowEnd))
  dispatch(tr.scrollIntoView())
  return true
}

// --- type conversion ---

/**
 * Change the caret's row to another row type, on a transaction. Shared so the
 * keymap, the toolbar, and the input rules all convert the same way rather than
 * three ways.
 *
 * The selection is collapsed to its start first: the toolbar acts on a range while
 * a row operation needs a single position, and forgetting that is what used to make
 * the toolbar buttons silent no-ops.
 */
export function applyRowType(tr: Transaction, name: 'paragraph' | 'check' | 'bullet'): boolean {
  const $from = tr.selection.$from
  const row = rowAround($from)
  if (!row) return false
  const rowPos = $from.before(row.depth)
  const type = tr.doc.type.schema.nodes[name]
  const attrs = name === 'check' ? { checked: false } : null
  const caret = $from.pos
  tr.setNodeMarkup(rowPos, type, attrs)
  tr.setSelection(TextSelection.create(tr.doc, Math.min(caret, tr.doc.content.size)))
  return true
}

export function setRowType(name: 'paragraph' | 'check' | 'bullet'): Command {
  return (state, dispatch) => {
    const tr = state.tr
    if (!applyRowType(tr, name)) return false
    if (dispatch) dispatch(tr.scrollIntoView())
    return true
  }
}

/** Shift+Enter: a soft break, and nothing else. Never continues a list. */
export const noteHardBreak: Command = (state, dispatch) => {
  const type = state.schema.nodes.hardBreak
  if (!type) return false
  if (!dispatch) return true
  dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView())
  return true
}

// --- attribute toggles, both transactions so both are undoable ---

export function toggleCheckedAt(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'check') return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(pos, undefined, { checked: !node.attrs.checked }))
    return true
  }
}

export function toggleCollapsedAt(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'section') return false
    if (!dispatch) return true
    dispatch(state.tr.setNodeMarkup(pos, undefined, { collapsed: !node.attrs.collapsed }))
    return true
  }
}

// --- paste ---

const MARKERS: [RegExp, 'check' | 'bullet', boolean][] = [
  [/^\[x\]\s/i, 'check', true],
  [/^\[\s?\]\s/, 'check', false],
  [/^-\s/, 'bullet', false],
]

/** One pasted line becomes one row, with its marker prefix read and stripped. */
export function rowForLine(
  schema: Schema,
  text: string,
  inline?: Fragment,
): PmNode {
  for (const [pattern, type, checked] of MARKERS) {
    const match = pattern.exec(text)
    if (!match) continue
    const rest = inline ? inline.cut(match[0].length) : Fragment.from(text.slice(match[0].length) ? schema.text(text.slice(match[0].length)) : null)
    const attrs = type === 'check' ? { checked } : null
    return schema.nodes[type].createChecked(attrs, rest)
  }
  const content = inline ?? (text ? Fragment.from(schema.text(text)) : Fragment.empty)
  return schema.nodes.paragraph.createChecked(null, content)
}

/**
 * Plain text: split on newlines, one row per line, blank lines kept as empty
 * paragraphs. The slice is left open at both ends so a single-line paste lands
 * inline at the caret rather than opening a row of its own.
 */
export function sliceForText(schema: Schema, text: string): Slice {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const rows = lines.map((line) => rowForLine(schema, line))
  return new Slice(Fragment.from(rows), 1, 1)
}

/**
 * Pasted HTML is reduced to rows plus the four marks in the schema. Any container
 * the parser produced is flattened to its rows, so no paste can create a section
 * or a quote.
 */
export function sliceForParsed(schema: Schema, parsed: Slice): Slice {
  const rows: PmNode[] = []
  const walk = (fragment: Fragment) => {
    fragment.forEach((child) => {
      if (child.isTextblock) {
        rows.push(rowForLine(schema, child.textContent, child.content))
        return
      }
      if (child.isText || child.isInline) {
        rows.push(schema.nodes.paragraph.createChecked(null, Fragment.from(child)))
        return
      }
      walk(child.content)
    })
  }
  walk(parsed.content)
  if (rows.length === 0) return Slice.empty
  return new Slice(Fragment.from(rows), 1, 1)
}

// --- the extension ---

export const NoteEditing = Extension.create({
  name: 'noteEditing',

  // Ahead of the extensions StarterKit brings, so these handlers see each key
  // first and the defaults never get to modify structure.
  priority: 1000,

  addProseMirrorPlugins() {
    // A raw ProseMirror keymap rather than addKeyboardShortcuts: these are
    // ProseMirror commands that build their own transaction, and Tiptap's command
    // wrapper would dispatch its own alongside them.
    return [
      // Paste, and cmd or ctrl click on a link. Both belong with the rest of
      // section 6 rather than with the toolbar.
      new Plugin({
        props: {
          handlePaste: (view, event, slice) => {
            const data = event.clipboardData
            const html = data?.getData('text/html') ?? ''
            const text = data?.getData('text/plain') ?? ''
            // The parsed slice already went through our schema, so a pasted
            // blockquote arrived as a quote. Flattening it here is what stops a
            // paste from building a container.
            const replacement = html
              ? sliceForParsed(view.state.schema, slice)
              : text
                ? sliceForText(view.state.schema, text)
                : Slice.empty
            if (replacement === Slice.empty || replacement.content.size === 0) return false
            view.dispatch(view.state.tr.replaceSelection(replacement).scrollIntoView())
            return true
          },
          handleClick: (view, pos, event) => {
            // Clicking a link places the caret, which is correct. Cmd or ctrl
            // click opens it. The href comes from the mark, never from the DOM.
            if (!event.metaKey && !event.ctrlKey) return false
            const link = view.state.doc
              .resolve(pos)
              .marks()
              .find((mark) => mark.type.name === 'link')
            const href = link?.attrs.href
            if (typeof href !== 'string' || href === '') return false
            window.open(href, '_blank', 'noreferrer,noopener')
            return true
          },
        },
      }),
      keymap({
        Enter: noteEnter,
        'Shift-Enter': noteHardBreak,
        Backspace: noteBackspace,
        Delete: noteDelete,
        // Tab and Shift-Tab move focus out of the field. They never insert
        // whitespace and never change indent, because indent is section membership
        // and nothing else sets it. Returning false hands the key back to the
        // browser, which moves focus, so the field cannot trap it.
        Tab: () => false,
        'Shift-Tab': () => false,
      }),
    ]
  },

  addInputRules() {
    const convert = (name: 'check' | 'bullet') =>
      new InputRule({
        // Anchored to the start of the row's own text, so the trigger only fires
        // where a marker can go. The two overwrite each other for free: they set
        // the node's type, and a node has one type.
        find: name === 'check' ? /^\[\s?\]\s$/ : /^-\s$/,
        handler: ({ state, range, chain }) => {
          const $from = state.doc.resolve(range.from)
          const row = rowAround($from)
          if (!row || range.from !== $from.start(row.depth)) return null
          chain()
            .deleteRange(range)
            .command(({ tr }) => applyRowType(tr, name))
            .run()
          return undefined
        },
      })
    return [convert('check'), convert('bullet')]
  },
})
