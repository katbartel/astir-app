'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { type Note, type NoteBlock } from '@/lib/applications'

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2 8.8-9.4"/></svg>'
const TRIANGLE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9.5l4 5 4-5z"/></svg>'
// Six-dot "grip" handle shown before a checkbox; dragging it reorders the row.
const GRIP_SVG =
  '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg>'

type Marks = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  href: string | null
}

const NO_MARKS: Marks = { bold: false, italic: false, underline: false, strike: false, href: null }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function blocksHtml(blocks: NoteBlock[]): string {
  return blocks.map(blockHtml).join('')
}

function collapseMarkup(summary: string, open: boolean, bodyHtml: string, summaryId = ''): string {
  const idAttr = summaryId ? ` id="${summaryId}"` : ''
  return (
    `<div class="note-collapse" data-open="${open ? 'true' : 'false'}">` +
    `<div class="note-collapse-head">` +
    `<span class="note-collapse-toggle" contenteditable="false" aria-hidden="true">${TRIANGLE_SVG}</span>` +
    `<span class="note-collapse-summary"${idAttr} data-placeholder="Toggle title">${escapeHtml(summary)}</span>` +
    `</div>` +
    `<div class="note-collapse-body">${bodyHtml || '<br>'}</div>` +
    `</div>`
  )
}

function blockHtml(block: NoteBlock): string {
  // A transient sentinel used only when reseeding after a list edit; it marks
  // where the caret should land and is removed right after (see reseedListLines).
  if ((block as { type: string }).type === 'caret') return '<span id="note-caret-sentinel"></span>'
  if (block.type === 'check') {
    return `<span class="note-check" contenteditable="false" data-note-check="${block.checked ? 'true' : 'false'}" role="checkbox" aria-checked="${block.checked ? 'true' : 'false'}" tabindex="0"><span class="note-grip" draggable="true" aria-hidden="true">${GRIP_SVG}</span><span class="note-box" aria-hidden="true">${block.checked ? CHECK_SVG : ''}</span></span>`
  }
  if (block.type === 'quote') {
    return `<blockquote class="note-quote">${blocksHtml(block.blocks) || '<br>'}</blockquote>`
  }
  if (block.type === 'collapse') {
    return collapseMarkup(block.summary || '', block.open !== false, blocksHtml(block.blocks))
  }
  // Text keeps its newlines; the field renders them via white-space: pre-wrap.
  // Marks use real tags (<strong>/<em>/<u>/<s>/<a>) so the browser's own
  // formatting commands interoperate with what we seed.
  let inner = escapeHtml(block.text)
  if (block.strike) inner = `<s>${inner}</s>`
  if (block.underline) inner = `<u>${inner}</u>`
  if (block.italic) inner = `<em>${inner}</em>`
  if (block.bold) inner = `<strong>${inner}</strong>`
  if (block.href) inner = `<a href="${escapeHtml(block.href)}">${inner}</a>`
  return `<span class="note-text">${inner}</span>`
}

function noteHtml(note: Note | null): string {
  return blocksHtml(pruneBlankCheckLines(note?.blocks ?? []))
}

// HTML for an unchecked checkbox, inserted via execCommand so the browser keeps
// the caret and surrounding markup consistent. Undo does not rely on it — the
// field keeps its own history (see HISTORY_LIMIT).
const CHECKBOX_HTML = blockHtml({ type: 'check', checked: false, text: '' })

// Serialize a DOM container's children back into the block model. Recurses into
// quote/collapse containers. Handles the flat structure we author (text nodes +
// inline spans) as well as the <div>/<br> line breaks the browser inserts on
// Enter — both become "\n" inside text blocks (white-space: pre-wrap shows
// them). Inline tags become marks on the text runs they wrap.
function serializeContainer(container: Node): NoteBlock[] {
  const blocks: NoteBlock[] = []
  let text = ''
  let marks: Marks = NO_MARKS
  const same = (a: Marks, b: Marks) =>
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.href === b.href
  const flush = () => {
    if (!text) return
    const block: NoteBlock = { type: 'text', text }
    if (marks.bold) block.bold = true
    if (marks.italic) block.italic = true
    if (marks.underline) block.underline = true
    if (marks.strike) block.strike = true
    if (marks.href) block.href = marks.href
    blocks.push(block)
    text = ''
  }
  const append = (value: string, next: Marks) => {
    if (!value) return
    if (text && !same(next, marks)) flush()
    if (!text) marks = next
    text += value
  }
  const walk = (parent: Node, current: Marks) => {
    parent.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        append(child.textContent || '', current)
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const element = child as HTMLElement
      const tag = element.tagName
      if (tag === 'BR') {
        // A <br> that ends its parent is the browser's filler for an empty line
        // (e.g. <div><br></div>); the wrapping block already contributes the
        // newline, so only count breaks that sit between content.
        if (element.nextSibling) append('\n', current)
        return
      }
      if (element.classList.contains('note-check')) {
        flush()
        blocks.push({ type: 'check', checked: element.dataset.noteCheck === 'true', text: '' })
        return
      }
      if (element.classList.contains('note-collapse')) {
        flush()
        const head = element.querySelector<HTMLElement>(':scope > .note-collapse-head')
        const summaryEl = head?.querySelector<HTMLElement>('.note-collapse-summary')
        // The body is everything after the head. Typing Enter makes the browser
        // split it into sibling lines however it likes (extra .note-collapse-body
        // divs, bare <div>s, or <br>s); serialize whatever is there so nothing is
        // lost, and it re-renders as one body div on the next seed.
        const bodyContainer = document.createElement('div')
        element.childNodes.forEach((child) => {
          if (child !== head) bodyContainer.appendChild(child.cloneNode(true))
        })
        blocks.push({
          type: 'collapse',
          open: element.dataset.open !== 'false',
          summary: summaryEl?.textContent ?? '',
          blocks: serializeContainer(bodyContainer),
        })
        return
      }
      if (tag === 'BLOCKQUOTE' || element.classList.contains('note-quote')) {
        flush()
        blocks.push({ type: 'quote', blocks: serializeContainer(element) })
        return
      }
      if (tag === 'B' || tag === 'STRONG') return walk(element, { ...current, bold: true })
      if (tag === 'I' || tag === 'EM') return walk(element, { ...current, italic: true })
      if (tag === 'U') return walk(element, { ...current, underline: true })
      if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') return walk(element, { ...current, strike: true })
      if (tag === 'A') return walk(element, { ...current, href: element.getAttribute('href') || current.href })
      // Block-level wrappers start a new line when anything precedes them —
      // unless the previous sibling is itself a block (a collapse or quote),
      // which already breaks the line; adding a "\n" there renders as a phantom
      // blank line after the block once the note is re-seeded.
      // The test is "has a previous sibling", not "have we emitted anything yet":
      // preceding lines may all be empty (<div><br></div>), and those still count
      // as lines. A range clone often starts with exactly that, so the weaker
      // test silently merged blank lines away from a split's head/tail.
      const prev = element.previousElementSibling
      const afterBlock =
        prev != null &&
        (prev.classList.contains('note-collapse') ||
          prev.classList.contains('note-quote') ||
          prev.tagName === 'BLOCKQUOTE')
      if ((tag === 'DIV' || tag === 'P') && element.previousSibling != null && !afterBlock) {
        append('\n', current)
      }
      walk(element, current)
    })
  }
  walk(container, NO_MARKS)
  flush()
  return blocks
}

function serialize(field: HTMLElement): Note {
  return { kind: 'blocks', blocks: pruneBlankCheckLines(serializeContainer(field)) }
}

// A block is block-level (occupies its own line and breaks the flow on both
// sides): quotes and collapse sections.
function isBlockLevel(line: NoteBlock[]): boolean {
  return line.length === 1 && (line[0].type === 'quote' || line[0].type === 'collapse')
}

// Split a flat block list into visual lines. Line breaks live as "\n" inside
// text blocks (pre-wrap) and as the natural boundaries of block-level elements;
// this reconstructs the discrete lines so a whole line can be moved as a unit.
function blocksToLines(blocks: NoteBlock[]): NoteBlock[][] {
  const lines: NoteBlock[][] = []
  let current: NoteBlock[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      const parts = block.text.split('\n')
      parts.forEach((part, i) => {
        if (i > 0) {
          lines.push(current)
          current = []
        }
        if (part !== '') current.push({ ...block, text: part })
      })
    } else if (block.type === 'quote' || block.type === 'collapse') {
      if (current.length) lines.push(current)
      lines.push([block])
      current = []
    } else {
      current.push(block)
    }
  }
  lines.push(current)
  return lines
}

// Rejoin lines into a flat block list, inserting a "\n" separator only between
// two flow lines — never around a block-level line, which already breaks on its
// own (a separator there would render as a phantom blank line, matching the
// serializer's own afterBlock rule).
function linesToBlocks(lines: NoteBlock[][]): NoteBlock[] {
  const out: NoteBlock[] = []
  lines.forEach((line, i) => {
    if (i > 0 && !isBlockLevel(lines[i - 1]) && !isBlockLevel(line)) {
      out.push({ type: 'text', text: '\n' })
    }
    line.forEach((block) => out.push(block))
  })
  return out
}

function hasVisibleText(block: NoteBlock): boolean {
  if (block.type === 'text') return block.text.replace(/ /g, ' ').trim().length > 0
  if (block.type === 'quote') return block.blocks.some(hasVisibleText)
  if (block.type === 'collapse') return Boolean(block.summary.trim()) || block.blocks.some(hasVisibleText)
  return false
}

function isBlankUncheckedCheckLine(line: NoteBlock[]): boolean {
  return (
    line[0]?.type === 'check' &&
    !line[0].checked &&
    line.slice(1).every((block) => block.type === 'text' && !hasVisibleText(block))
  )
}

// Drop leftover blank unchecked checkbox rows from the saved model, at every
// depth — a collapse or quote body is edited the same way and would otherwise
// keep persisting the empty row a list continuation leaves behind.
function pruneBlankCheckLines(blocks: NoteBlock[]): NoteBlock[] {
  const pruned = blocksToLines(blocks)
    .filter((line) => !isBlankUncheckedCheckLine(line))
    .map((line) =>
      line.map((block) =>
        block.type === 'quote' || block.type === 'collapse'
          ? { ...block, blocks: pruneBlankCheckLines(block.blocks) }
          : block,
      ),
    )
  return linesToBlocks(pruned)
}

// Move the checkbox line at drag-source index `from` next to the checkbox at
// index `to` (both counted among checkboxes in document order) — before it, or
// after it when `after` is set. Only reorders when both lines are leading-
// checkbox lines in the same contiguous group (no other content between them),
// so a checkbox never jumps across a heading or paragraph. Returns whether the
// DOM was changed.
function reorderCheckLine(field: HTMLElement, from: number, to: number, after: boolean): boolean {
  const lines = blocksToLines(serialize(field).blocks)
  const checkToLine: number[] = []
  lines.forEach((line, index) => {
    line.forEach((block) => {
      if (block.type === 'check') checkToLine.push(index)
    })
  })
  if (from >= checkToLine.length || to >= checkToLine.length) return false
  const fromLine = checkToLine[from]
  const toLine = checkToLine[to]
  const isCheckLine = (line: NoteBlock[]) => line[0]?.type === 'check'
  const [lo, hi] = fromLine < toLine ? [fromLine, toLine] : [toLine, fromLine]
  for (let k = lo; k <= hi; k++) if (!isCheckLine(lines[k])) return false
  const target = after ? toLine + 1 : toLine
  // After the source is spliced out, everything past it shifts down one slot.
  const dest = target > fromLine ? target - 1 : target
  if (dest === fromLine) return false
  const [moved] = lines.splice(fromLine, 1)
  lines.splice(dest, 0, moved)
  field.innerHTML = blocksHtml(linesToBlocks(lines))
  return true
}

// Find the first "[]" eligible to become a checkbox: real text (not inside a
// checkbox), at the start of its line, on a line with no checkbox yet. Any other
// "[]" is skipped so a literal "[" and "]" can be typed freely as text.
function findMarker(field: HTMLElement): { node: Text; index: number } | null {
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node as Text
    if (text.parentElement?.closest('.note-check')) continue
    const content = text.textContent || ''
    for (let index = content.indexOf('[]'); index !== -1; index = content.indexOf('[]', index + 2)) {
      const info = markerLineInfo(field, text, index)
      if (!info.hasCheck && info.atStart) return { node: text, index }
    }
  }
  return null
}

// Report, for a "[]" marker at (node, index), whether its line already holds a
// checkbox and whether the marker sits at the start of the line. Computed by
// serializing the content before and after the marker and rejoining its line —
// robust to how the browser nests/splits nodes, unlike a Selection.modify probe
// (which the leading contenteditable=false checkbox defeats).
function markerLineInfo(field: HTMLElement, node: Text, index: number): { hasCheck: boolean; atStart: boolean } {
  const serializeRange = (range: Range): NoteBlock[] => {
    const holder = document.createElement('div')
    holder.appendChild(range.cloneContents())
    return serializeContainer(holder)
  }
  const before = document.createRange()
  before.setStart(field, 0)
  before.setEnd(node, index)
  const after = document.createRange()
  after.setStart(node, index)
  if (field.lastChild) after.setEndAfter(field.lastChild)
  else after.setEnd(field, 0)
  const beforeLines = blocksToLines(serializeRange(before))
  const afterLines = blocksToLines(serializeRange(after))
  const prefix = beforeLines[beforeLines.length - 1] ?? []
  const suffix = afterLines[0] ?? []
  const hasCheck = [...prefix, ...suffix].some((block) => block.type === 'check')
  const prefixText = prefix.map((block) => (block.type === 'text' ? block.text : '')).join('')
  // A bullet already on the line does not disqualify the marker: a line carries
  // one marker, so "[]" replaces the bullet (convertMarkers swallows it below).
  const atStart = prefixText.replace('•', '').replace(/ /g, ' ').trim() === ''
  return { hasCheck, atStart }
}

// How much of the text before a "[]" marker is a bullet the checkbox is about
// to replace, so the conversion can swallow it in the same step.
function bulletPrefixLength(node: Text, index: number): number {
  const before = (node.textContent || '').slice(0, index)
  const match = /(?:^|\n)([^\S\n]*\u2022[^\S\n]*)$/.exec(before)
  return match ? match[1].length : 0
}

// Replace each "[]" marker with a checkbox. We select the two marker characters
// and swap them for the checkbox via execCommand('insertHTML'), so every
// conversion is a discrete, Ctrl+Z-undoable step (undo restores the "[]"). A
// trailing space is inserted with the checkbox (same undo step) so the caret
// lands in editable text after it — without one, a checkbox at the end of a
// line leaves the caret stranded against a contenteditable=false element and
// typing silently does nothing until you click back in. (pre-wrap keeps it.)
function convertMarkers(field: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection) return false
  let converted = false
  let found = findMarker(field)
  for (let guard = 0; found && guard < 200; guard++) {
    const range = document.createRange()
    // Swallow a bullet already on the line: the checkbox replaces it, so the two
    // shorthands overwrite each other rather than stacking up.
    range.setStart(found.node, found.index - bulletPrefixLength(found.node, found.index))
    range.setEnd(found.node, found.index + 2)
    selection.removeAllRanges()
    selection.addRange(range)
    // A "#note-caret-sentinel" rides along in the same insertHTML so we can plant
    // the caret right after the trailing space: with our real (nested, draggable)
    // checkbox markup the browser otherwise collapses the caret to the field start
    // after insertHTML, which would drop the next keystrokes in front of the box.
    document.execCommand('insertHTML', false, `${CHECKBOX_HTML} <span id="note-caret-sentinel"></span>`)
    placeCaretAfterSentinel(field, selection)
    converted = true
    found = findMarker(field)
  }
  return converted
}

// Move the caret to the "#note-caret-sentinel" span, then remove it. The caret
// lands at the end of the text just before the sentinel (the checkbox's trailing
// space) so typing continues after the checkbox rather than in front of it.
function placeCaretAfterSentinel(field: HTMLElement, selection: Selection) {
  const sentinel = field.querySelector('#note-caret-sentinel')
  if (!sentinel) return
  const prev = sentinel.previousSibling
  const range = document.createRange()
  sentinel.remove()
  if (prev && prev.nodeType === Node.TEXT_NODE) {
    range.setStart(prev, (prev.textContent || '').length)
  } else if (prev) {
    range.setStartAfter(prev)
  } else {
    range.setStart(field, 0)
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

// The container list edits are scoped to: the collapse body holding the caret,
// or the field itself. Staying inside the body is what keeps rebuilt lines from
// landing beside it.
function listContainer(field: HTMLElement): HTMLElement {
  const context = collapseContext(field)
  if (context?.where !== 'body') return field
  return context.collapse.querySelector<HTMLElement>(':scope > .note-collapse-body') ?? field
}

// Strip a line's marker while keeping its text: drops a leading checkbox (and
// the space that follows it) or a leading "• ". Used when one marker replaces
// the other.
function stripLineMarker(line: NoteBlock[]): NoteBlock[] {
  let first = true
  return line
    .filter((block) => block.type !== 'check')
    .map((block) => {
      if (!first || block.type !== 'text') return block
      first = false
      return { ...block, text: block.text.replace(/^\s*•?\s?/, '') }
    })
    .filter((block) => block.type !== 'text' || block.text !== '')
}

// Make the caret's line a checkbox or a bullet line. A line holds at most one
// marker, so whichever marker is already there is replaced — checkbox and bullet
// overwrite each other. Runs through the line model rather than a Selection
// .modify probe, which a leading contenteditable=false checkbox defeats.
function setLineMarker(container: HTMLElement, target: 'check' | 'bullet') {
  // The toolbar acts on a selection, but a line is identified from a collapsed
  // caret; work from the selection's start.
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  if (!selection.isCollapsed) selection.collapseToStart()
  const split = splitCaretLines(container)
  if (!split || split.marker === target) return
  const { head, prefix, suffix, tail } = split
  const text = stripLineMarker([...prefix, ...suffix])
  reseedListLines(container, [...head, [...listOpener(target), CARET_BLOCK, ...text], ...tail])
}

// Turn a "-" typed at the start of a line into a bullet when space is pressed,
// replacing a checkbox already on that line. Fires on the space keydown, before
// the space is inserted.
function convertBullet(container: HTMLElement): boolean {
  const split = splitCaretLines(container)
  if (!split) return false
  const { head, prefix, suffix, tail } = split
  if (lineTextAfterMarker(prefix) !== '-') return false
  reseedListLines(container, [...head, [...listOpener('bullet'), CARET_BLOCK, ...suffix], ...tail])
  return true
}

// A transient block marking where the caret should land after a reseed.
const CARET_BLOCK = { type: 'caret' } as unknown as NoteBlock

// Serialize the note into lines split at the caret: `head` are the whole lines
// before the caret's line, `tail` the whole lines after it, and `prefix`/`suffix`
// the caret line's content before/after the caret. Everything runs through the
// robust serializer, so it is immune to how the browser nests/splits nodes while
// editing (a continued checkbox nests inside the previous line's text span, text
// runs fragment, etc.). Also reports the caret line's marker and whether it is
// empty beyond that marker.
type CaretSplit = {
  head: NoteBlock[][]
  prefix: NoteBlock[]
  suffix: NoteBlock[]
  tail: NoteBlock[][]
  marker: 'check' | 'bullet' | null
  empty: boolean
}
// The container is the field itself, or a collapse body div when editing inside
// a collapse — the line model, reseed, and caret all stay scoped to that region.
function splitCaretLines(container: HTMLElement): CaretSplit | null {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return null
  const caret = selection.getRangeAt(0)
  if (!container.contains(caret.startContainer)) return null
  const serializeRange = (range: Range): NoteBlock[] => {
    const holder = document.createElement('div')
    holder.appendChild(range.cloneContents())
    return serializeContainer(holder)
  }
  const beforeRange = document.createRange()
  beforeRange.setStart(container, 0)
  beforeRange.setEnd(caret.startContainer, caret.startOffset)
  const afterRange = document.createRange()
  afterRange.setStart(caret.startContainer, caret.startOffset)
  if (container.lastChild) afterRange.setEndAfter(container.lastChild)
  else afterRange.setEnd(container, 0)
  const beforeLines = blocksToLines(serializeRange(beforeRange))
  const afterLines = blocksToLines(serializeRange(afterRange))
  const prefix = beforeLines[beforeLines.length - 1] ?? []
  const suffix = afterLines[0] ?? []
  const head = beforeLines.slice(0, -1)
  const tail = afterLines.slice(1)
  const lineBlocks = [...prefix, ...suffix]
  const lineText = lineBlocks.map((block) => (block.type === 'text' ? block.text : '')).join('')
  let marker: 'check' | 'bullet' | null = null
  let rest = lineText
  if (lineBlocks[0]?.type === 'check') marker = 'check'
  else if (lineText.trimStart().startsWith('•')) {
    marker = 'bullet'
    rest = lineText.replace('•', '')
  }
  const empty = rest.replace(/ /g, ' ').trim() === ''
  return { head, prefix, suffix, tail, marker, empty }
}

// Rebuild the note from a fresh line list and drop the caret where CARET_BLOCK
// sits. Each line is reseeded as its own <div> so the browser handles empty
// lines natively (an empty <div><br></div> holds a caret, whereas a bare "\n"
// position does not — the browser redirects typing to the previous run). This
// yields clean HTML with no leftover nesting and a caret we place exactly.
function reseedListLines(container: HTMLElement, lines: NoteBlock[][]) {
  container.innerHTML = lines
    .map((line) => {
      // A block-level line (quote/collapse) is emitted bare: it already occupies
      // its own line and breaks the flow on both sides. Wrapping it in a <div>
      // would hide it from the serializer's afterBlock guard, which only looks
      // for a direct .note-collapse/.note-quote sibling — it would then add a
      // phantom "\n" before the following line, growing one blank line above the
      // block on every reseed.
      if (isBlockLevel(line)) return blockHtml(line[0])
      const inner = line.map(blockHtml).join('')
      return `<div>${inner || '<br>'}</div>`
    })
    .join('')
  const sentinel = container.querySelector('#note-caret-sentinel')
  const selection = window.getSelection()
  if (!sentinel || !selection) return
  const range = document.createRange()
  const prev = sentinel.previousSibling
  const next = sentinel.nextSibling
  if (prev && prev.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).classList.contains('note-text')) {
    // A line with content before the caret (a continued checkbox/bullet): drop the
    // caret at the end of the text just before the sentinel (the marker's space).
    const home = prev.lastChild ?? prev
    sentinel.remove()
    range.setStart(home, (home.textContent || '').length)
  } else if (next) {
    // Caret at the start of a line that still has content after it (a split line):
    // sit the caret at the head of that content, no filler needed.
    sentinel.remove()
    if (next.nodeType === Node.ELEMENT_NODE && (next as HTMLElement).classList.contains('note-text') && next.firstChild) {
      range.setStart(next.firstChild, 0)
    } else {
      range.setStartBefore(next)
    }
  } else {
    // An otherwise empty line: give it a <br> filler and sit the caret before it.
    const br = document.createElement('br')
    sentinel.replaceWith(br)
    range.setStartBefore(br)
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function caretHasInlineSuffix(container: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!container.contains(range.startContainer)) return false
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return false
  const after = ((range.startContainer as Text).textContent || '').slice(range.startOffset)
  return after.replace(/ /g, ' ').length > 0 && !after.startsWith('\n')
}

// The blocks that open a continued list line. A checkbox is followed by a space
// so the caret lands in editable text after it — without one the caret is
// stranded against the contenteditable=false box and typing silently does
// nothing until you click back in. (pre-wrap keeps the space.)
function listOpener(marker: 'check' | 'bullet', checked = false): NoteBlock[] {
  return marker === 'check'
    ? [{ type: 'check', checked, text: '' }, { type: 'text', text: ' ' }]
    : [{ type: 'text', text: '• ' }]
}

// The text of a line's blocks, with the marker's own characters removed, so a
// line holding only its marker reads as blank.
function lineTextAfterMarker(line: NoteBlock[]): string {
  return line
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .replace('•', '')
    .replace(/ /g, ' ')
    .trim()
}

// The checked state of whichever checkbox sits on a line (lines hold at most one).
function lineChecked(line: NoteBlock[]): boolean {
  const box = line.find((block) => block.type === 'check')
  return box?.type === 'check' ? box.checked : false
}

// Enter on a checkbox/bullet line only touches the current line: a non-empty row
// opens the next row with the same marker, an empty row drops its marker and
// leaves the caret on that same, now plain, line. Both go through the line model
// rather than execCommand — insertHTML escapes a collapse body div (the new row
// would land beside it, after a phantom blank line), and the Selection.modify
// probe that would find a leading marker to delete is defeated by the checkbox's
// own contenteditable=false span.
function handleListEnter(container: HTMLElement): boolean {
  const split = splitCaretLines(container)
  if (!split || !split.marker) return false
  const { head, prefix, suffix, tail, marker, empty } = split
  if (empty) {
    reseedListLines(container, [...head, [CARET_BLOCK], ...tail])
    return true
  }
  // Enter at the start of a row's text opens a fresh row of the same kind above
  // it and leaves the caret there, ready to type the new item — the row that was
  // there keeps its text, its marker, and its checked state, and simply moves
  // down. (Enter again on the new empty row drops its marker, above.) The caret
  // sits at a line start as an element offset rather than inside a text node, so
  // this is decided from the line model, not from a DOM probe.
  if (lineTextAfterMarker(prefix) === '') {
    const line = [...prefix, ...suffix]
    const opener = [...listOpener(marker, lineChecked(line)), CARET_BLOCK]
    reseedListLines(container, [...head, opener, line, ...tail])
    return true
  }
  const suffixIsInline = suffix.length > 0 && caretHasInlineSuffix(container)
  const suffixLine = suffixIsInline ? suffix : []
  const nextLines = suffixIsInline || suffix.length === 0 ? tail : [suffix, ...tail]
  const opener: NoteBlock[] = [...listOpener(marker), CARET_BLOCK]
  reseedListLines(container, [...head, prefix, [...opener, ...suffixLine], ...nextLines])
  return true
}

// Backspace on an empty checkbox/bullet line drops the marker in one press,
// leaving a plain empty line. Otherwise Backspace behaves normally.
function handleListBackspace(container: HTMLElement): boolean {
  const split = splitCaretLines(container)
  if (!split || !split.marker || !split.empty) return false
  reseedListLines(container, [...split.head, [CARET_BLOCK], ...split.tail])
  return true
}

// Insert a collapse (toggle) section. Selected text becomes the section title
// and the body starts empty, so the caret drops into the body ready for its
// contents. With no selection the title starts empty instead and the caret
// lands there so the user names it first (Enter then drops into the body — see
// handleCollapseEnter). Inserted via execCommand so Ctrl+Z removes it and
// restores the selection.
function insertCollapse(field: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!field.contains(range.commonAncestorContainer)) return
  const summary = range.toString().replace(/\s+/g, ' ').trim()
  const marker = 'note-collapse-caret'
  document.execCommand('insertHTML', false, collapseMarkup(summary, true, '', marker))
  const summaryEl = field.querySelector<HTMLElement>(`#${marker}`)
  if (!summaryEl) return
  summaryEl.removeAttribute('id')
  const body = summaryEl
    .closest<HTMLElement>('.note-collapse')
    ?.querySelector<HTMLElement>('.note-collapse-body')
  if (summary && body) {
    caretToStart(body)
    return
  }
  const caret = document.createRange()
  caret.selectNodeContents(summaryEl)
  caret.collapse(true)
  selection.removeAllRanges()
  selection.addRange(caret)
}

// Return the collapse section the caret sits in, plus whether it is in the
// title (summary) or the body — or null if the caret is outside any collapse.
// bodyLine is the .note-collapse-body div holding the caret (normally the single
// body div; a legacy/pasted note may briefly have more until the next reseed).
function collapseContext(
  field: HTMLElement,
): { collapse: HTMLElement; where: 'summary' | 'body'; head: HTMLElement | null } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const node = selection.getRangeAt(0).startContainer
  if (!field.contains(node)) return null
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  const collapse = el?.closest<HTMLElement>('.note-collapse')
  if (!collapse) return null
  const head = collapse.querySelector<HTMLElement>(':scope > .note-collapse-head')
  if (el?.closest('.note-collapse-summary')) return { collapse, where: 'summary', head }
  return { collapse, where: 'body', head }
}

// Place the caret at the very start of a container's contents.
function caretToStart(container: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(container)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

// Enter handling inside a collapse section. Returns true whenever the caret is
// in a collapse, so the caller always suppresses the browser's own Enter (which
// is unreliable here — WebKit breaks out of the body, Chrome scatters it into
// stray divs). List editing is run scoped to the body div, so checkboxes and
// bullets continue and empty markers drop exactly as they do outside a collapse.
//  - In the title: drop into the body to start typing content.
//  - On a checkbox/bullet line: continue the list (or drop an empty marker).
//  - On an empty line at the end of the body (a double Enter): exit — drop that
//    trailing empty line and open a fresh line after the whole collapse.
//  - Otherwise: split the current line within the body, caret to the new line.
// Shift+Enter (allowExit false) never continues a list or exits; it just splits
// the line, matching the plain soft break used elsewhere.
function handleCollapseEnter(field: HTMLElement, allowExit: boolean): boolean {
  const context = collapseContext(field)
  if (!context) return false
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false

  const body = context.collapse.querySelector<HTMLElement>(':scope > .note-collapse-body')
  if (!body) return false

  // Enter in the title, by where the caret sits in it:
  //  - at the very start: push the whole section down and open a plain line
  //    above it, so something can be written before the section;
  //  - mid-title: split it — the text after the caret drops into the section as
  //    its first line and the title keeps what came before;
  //  - at the end: open a fresh empty first line inside the section.
  // An empty title counts as "at the end" (naming it is optional), so a freshly
  // inserted collapse still drops into its body on the first Enter.
  if (context.where === 'summary') {
    const summaryEl = context.head?.querySelector<HTMLElement>('.note-collapse-summary')
    if (!summaryEl) return false
    const caret = selection.getRangeAt(0)
    const upToCaret = document.createRange()
    upToCaret.selectNodeContents(summaryEl)
    upToCaret.setEnd(caret.startContainer, caret.startOffset)
    const title = summaryEl.textContent || ''
    const titleBefore = upToCaret.toString()
    const titleAfter = title.slice(titleBefore.length)

    if (titleBefore === '' && title !== '') {
      const above = document.createElement('div')
      above.appendChild(document.createElement('br'))
      context.collapse.before(above)
      caretToStart(above)
      return true
    }

    const bodyLines = blocksToLines(serializeContainer(body))
    const rest = bodyLines.every((line) => line.length === 0) ? [] : bodyLines
    if (titleAfter !== '') {
      summaryEl.textContent = titleBefore
      reseedListLines(body, [[CARET_BLOCK, { type: 'text', text: titleAfter }], ...rest])
      return true
    }
    reseedListLines(body, [[CARET_BLOCK], ...rest])
    return true
  }

  const split = splitCaretLines(body)
  if (!split) return false
  const { head, prefix, suffix, tail } = split

  // A checkbox/bullet line continues the list (or drops an empty marker), the
  // same handler used outside a collapse. Shift+Enter skips this and splits.
  if (split.marker && allowExit) return handleListEnter(body)

  // Second Enter of a double Enter on the last, empty body line: leave the
  // collapse and open a plain line after it, dropping that trailing empty line.
  if (allowExit && split.empty && tail.length === 0) {
    reseedListLines(body, head.length ? head : [[]])
    const outside = document.createElement('div')
    outside.appendChild(document.createElement('br'))
    context.collapse.after(outside)
    caretToStart(outside)
    return true
  }

  // Plain break within the body: split the current line at the caret and land on
  // the new line (any text after the caret moves down with it).
  reseedListLines(body, [...head, prefix, [CARET_BLOCK, ...suffix], ...tail])
  return true
}

function normalizeUrl(value: string): string {
  // Leave real schemes and protocol-relative URLs alone; default the rest to https.
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(value) ? value : `https://${value}`
}

// Toolbar actions run on mousedown; a "click" still fires on mouseup. When an
// action hides the toolbar (quote/list/collapse), that click can land on the
// card body and toggle it. Swallow the next click in the capture phase so it
// never reaches the card. Actions are already done, so the click is a no-op.
function suppressNextClick() {
  const handler = (event: MouseEvent) => {
    event.stopPropagation()
    document.removeEventListener('click', handler, true)
  }
  document.addEventListener('click', handler, true)
}

// ---- undo history -----------------------------------------------------------
// The browser's native undo stack cannot be used here: every structural edit
// (Enter on a list row, a heading split, a drag reorder) rebuilds a container's
// innerHTML, which the stack does not record, and routing those edits through
// execCommand instead is what used to let insertHTML escape a collapse body. So
// the field keeps its own history of states and takes over ⌘Z / ⇧⌘Z entirely —
// one source of truth, and every kind of edit is reversible.

// How many steps back ⌘Z can walk. Notes are small, so this is generous.
const HISTORY_LIMIT = 200
// A run of typing shorter than this folds into the current step, so ⌘Z undoes
// words rather than single characters.
const TYPING_RUN_MS = 700

type CaretMark = { path: number[]; offset: number }
type HistoryEntry = { html: string; caret: CaretMark | null }

// A caret position that survives an innerHTML swap: the chain of child indices
// from the field down to the caret's node, plus the offset inside it. Restoring
// the same HTML makes the same path valid again.
function markCaret(field: HTMLElement): CaretMark | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!field.contains(range.startContainer)) return null
  const path: number[] = []
  let node: Node = range.startContainer
  while (node !== field) {
    const parent: Node | null = node.parentNode
    if (!parent) return null
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, node))
    node = parent
  }
  return { path, offset: range.startOffset }
}

function restoreCaret(field: HTMLElement, mark: CaretMark | null) {
  const selection = window.getSelection()
  if (!selection) return
  let node: Node | null = field
  if (mark) {
    for (const index of mark.path) {
      const child: Node | undefined = node?.childNodes[index]
      if (!child) {
        node = null
        break
      }
      node = child
    }
  } else {
    node = null
  }
  const range = document.createRange()
  if (node) {
    const limit = node.nodeType === Node.TEXT_NODE ? (node.textContent || '').length : node.childNodes.length
    range.setStart(node, Math.min(mark?.offset ?? 0, limit))
  } else {
    // The path no longer resolves (or there was no caret): fall back to the end.
    range.setStart(field, field.childNodes.length)
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

type ToolbarState = {
  top: number
  left: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  quote: boolean
}

// Rich note editor: free text, checkboxes, bullets, inline formatting, quotes
// and collapsible sections. Type "[]" for a checkbox or "- " at a line start for
// a bullet; select text to reveal a toolbar and use the usual ⌘ shortcuts.
// Uncontrolled contenteditable (React never re-renders it mid-edit, which would
// drop the caret). ⌘Z / ⇧⌘Z reverse and replay every kind of edit — typing,
// structural changes, checkbox toggles, drag reorders — off the field's own
// history rather than the browser's stack (see HISTORY_LIMIT).
export function NoteField({
  note,
  onChange,
}: {
  note: Note | null
  onChange: (note: Note) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  // execCommand fires a nested "input" event; this guards handleInput against
  // re-entering while we are mid-conversion.
  const busy = useRef(false)
  // Index (among checkboxes in document order) of the checkbox being dragged, or
  // null when no checkbox drag is in progress.
  const dragCheck = useRef<number | null>(null)
  const dragContainer = useRef<HTMLElement | null>(null)
  // Where the dragged row will drop: the target checkbox index and whether it
  // lands after (vs before) that row. Kept in a ref so drop matches the hint.
  const dropInfo = useRef<{ index: number; after: boolean } | null>(null)
  // Viewport-space position of the drop indicator line (null hides it).
  const [dropLine, setDropLine] = useState<{ top: number; left: number; width: number } | null>(null)
  // Undo history: states of the field, oldest first, with historyAt pointing at
  // the one currently shown. Entries after it are the redo tail.
  const history = useRef<HistoryEntry[]>([])
  const historyAt = useRef(-1)
  // The run of typing currently being folded into one step.
  const typing = useRef<{ at: number; kind: string }>({ at: 0, kind: '' })

  // Record the field's current state as a new undo step, discarding any redo
  // tail (a fresh edit after undoing forks the history, as editors do).
  function commitHistory() {
    const field = ref.current
    if (!field) return
    history.current = history.current.slice(0, historyAt.current + 1)
    history.current.push({ html: field.innerHTML, caret: markCaret(field) })
    if (history.current.length > HISTORY_LIMIT) history.current.shift()
    historyAt.current = history.current.length - 1
  }

  // Fold the current state into the step already on top, used while a run of
  // typing is still in progress so the run undoes as one step.
  function mergeHistory() {
    const field = ref.current
    if (!field) return
    if (historyAt.current < 0) return commitHistory()
    history.current[historyAt.current] = { html: field.innerHTML, caret: markCaret(field) }
  }

  // End any in-progress typing run, so the next edit starts its own step.
  function breakTypingRun() {
    typing.current = { at: 0, kind: '' }
  }

  // Commit a discrete step and save. Used by every programmatic edit.
  function commitAndSave(field: HTMLElement) {
    commitHistory()
    breakTypingRun()
    onChange(serialize(field))
  }

  // Step the history pointer and put that state back on screen.
  function travelHistory(delta: number): boolean {
    const field = ref.current
    if (!field) return false
    const next = historyAt.current + delta
    if (next < 0 || next >= history.current.length) return false
    const entry = history.current[next]
    historyAt.current = next
    busy.current = true
    field.innerHTML = entry.html
    restoreCaret(field, entry.caret)
    busy.current = false
    breakTypingRun()
    setToolbar(null)
    onChange(serialize(field))
    return true
  }

  // Group native typing into steps: a new one starts when the kind of edit
  // changes, after a pause, or at a word boundary, so ⌘Z walks back in useful
  // chunks rather than one character at a time.
  function recordTyping(inputType: string, data: string | null) {
    const now = Date.now()
    const kind = inputType.startsWith('delete') ? 'delete' : inputType
    if (kind === typing.current.kind && now - typing.current.at < TYPING_RUN_MS) mergeHistory()
    else commitHistory()
    // A space closes the run so the next word becomes its own step.
    typing.current = { at: now, kind: data === ' ' || data === ' ' ? '' : kind }
  }

  // Run a programmatic edit, then serialize + save once. The busy flag swallows
  // the nested input events execCommand emits so we don't recurse or double-run.
  function runEdit(mutate: () => void) {
    const field = ref.current
    if (!field || busy.current) return
    busy.current = true
    mutate()
    busy.current = false
    commitAndSave(field)
  }

  // Position the toolbar over the current selection and read back which inline
  // formats are active, so the buttons can show a pressed state.
  const refreshToolbar = useCallback(() => {
    const field = ref.current
    const selection = window.getSelection()
    if (!field || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setToolbar(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!field.contains(range.commonAncestorContainer)) {
      setToolbar(null)
      return
    }
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setToolbar(null)
      return
    }
    setToolbar({
      top: rect.top,
      left: rect.left + rect.width / 2,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      quote: /blockquote/i.test(document.queryCommandValue('formatBlock')),
    })
  }, [])

  // Seed once from the incoming note; further edits are DOM-driven so React
  // never re-renders the contenteditable (which would drop the caret).
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !ref.current) return
    seeded.current = true
    ref.current.innerHTML = noteHtml(note)
    // The seeded state is the first history entry, so ⌘Z can walk all the way
    // back to how the note looked when it was opened.
    history.current = [{ html: ref.current.innerHTML, caret: null }]
    historyAt.current = 0
  }, [note])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshToolbar)
    return () => document.removeEventListener('selectionchange', refreshToolbar)
  }, [refreshToolbar])

  function handleInput(event: React.FormEvent<HTMLDivElement>) {
    const field = ref.current
    if (!field || busy.current) return
    const nativeEvent = event.nativeEvent as InputEvent
    const inputType = nativeEvent.inputType
    // ⌘Z is handled by our own history, so the browser should never run its own.
    // If one slips through anyway, just persist what it left behind rather than
    // re-converting "[]" (which would turn it straight back into a checkbox).
    const isHistory = inputType === 'historyUndo' || inputType === 'historyRedo'
    // Record the typed character first, so the literal "[]" is its own undo step
    // and the checkbox conversion the next one — ⌘Z lands on "[]", then on "[".
    recordTyping(inputType, nativeEvent.data)
    if (!isHistory && (field.textContent || '').includes('[]')) {
      runEdit(() => convertMarkers(field))
      return
    }
    onChange(serialize(field))
  }

  function handleClick(event: React.MouseEvent) {
    const field = ref.current
    if (!field) return
    // Toggle a collapse section open/closed from its triangle.
    const toggle = (event.target as HTMLElement).closest('.note-collapse-toggle')
    if (toggle) {
      event.stopPropagation()
      const collapse = toggle.closest('.note-collapse') as HTMLElement | null
      if (collapse) {
        collapse.dataset.open = collapse.dataset.open === 'false' ? 'true' : 'false'
        commitAndSave(field)
      }
      return
    }
    // A click on the drag grip must not toggle the box.
    if ((event.target as HTMLElement).closest('.note-grip')) return
    const target = (event.target as HTMLElement).closest('.note-check') as HTMLElement | null
    if (!target) return
    event.stopPropagation()
    const next = target.dataset.noteCheck === 'true' ? 'false' : 'true'
    target.dataset.noteCheck = next
    target.setAttribute('aria-checked', next)
    const box = target.querySelector('.note-box')
    if (box) box.innerHTML = next === 'true' ? CHECK_SVG : ''
    commitAndSave(field)
  }

  function checkContainer(check: Element): HTMLElement {
    return check.closest<HTMLElement>('.note-collapse-body') ?? ref.current!
  }

  // Position of a checkbox among all checkboxes in its editing container.
  function checkIndex(container: HTMLElement, check: Element): number {
    return Array.from(container.querySelectorAll('.note-check')).indexOf(check)
  }

  // Reset all drag affordances (dimmed source, drop line, stored intent).
  function clearDrag(field: HTMLElement | null) {
    field?.querySelectorAll('.note-check-dragging').forEach((el) => el.classList.remove('note-check-dragging'))
    dragCheck.current = null
    dragContainer.current = null
    dropInfo.current = null
    setDropLine(null)
  }

  // Read the label text of a checkbox row (the run after the box up to the line
  // break), used to build a drag image that shows what is being moved.
  function checkRowLabel(check: Element): string {
    let label = ''
    let node = check.nextSibling
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        const br = text.indexOf('\n')
        if (br !== -1) return (label + text.slice(0, br)).trim()
        label += text
      } else if (node.nodeName === 'BR' || (node as HTMLElement).classList?.contains('note-check')) {
        break
      } else {
        label += node.textContent ?? ''
      }
      node = node.nextSibling
    }
    return label.trim()
  }

  function handleDragStart(event: React.DragEvent) {
    const field = ref.current
    const check = (event.target as HTMLElement).closest('.note-check')
    if (!field || !check) return
    const container = checkContainer(check)
    dragContainer.current = container
    dragCheck.current = checkIndex(container, check)
    // Some browsers require data to be set for a drag to begin.
    event.dataTransfer.setData('text/plain', '')
    event.dataTransfer.effectAllowed = 'move'
    check.classList.add('note-check-dragging')
    // A floating ghost showing the row's checkbox + label under the cursor.
    const ghost = document.createElement('div')
    ghost.className = 'note-drag-ghost'
    ghost.innerHTML = `<span class="note-box"></span><span>${escapeHtml(checkRowLabel(check))}</span>`
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, 12, 12)
    // setDragImage snapshots synchronously, so the node can go on the next tick.
    setTimeout(() => ghost.remove(), 0)
  }

  function handleDragOver(event: React.DragEvent) {
    const field = ref.current
    const container = dragContainer.current
    if (!field || !container || dragCheck.current === null) return
    const check = (event.target as HTMLElement).closest('.note-check')
    if (!check || checkContainer(check) !== container || check.classList.contains('note-check-dragging')) {
      dropInfo.current = null
      setDropLine(null)
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    // Drop before the row if the cursor is in its top half, after it otherwise —
    // so the last slot is reachable. The indicator line spans the row's width.
    const rect = check.getBoundingClientRect()
    const fieldRect = field.getBoundingClientRect()
    const after = event.clientY > rect.top + rect.height / 2
    dropInfo.current = { index: checkIndex(container, check), after }
    setDropLine({
      top: after ? rect.bottom : rect.top,
      left: rect.left,
      width: Math.max(0, fieldRect.right - rect.left - 12),
    })
  }

  function handleDrop(event: React.DragEvent) {
    const field = ref.current
    const container = dragContainer.current
    const from = dragCheck.current
    const info = dropInfo.current
    if (field && container && from !== null && info) {
      event.preventDefault()
      if (reorderCheckLine(container, from, info.index, info.after)) commitAndSave(field)
    }
    clearDrag(field)
  }

  function handleDragEnd() {
    clearDrag(ref.current)
  }

  function runFormat(command: 'bold' | 'italic' | 'underline' | 'strikeThrough') {
    runEdit(() => {
      document.execCommand('styleWithCSS', false, 'false')
      document.execCommand(command)
    })
    refreshToolbar()
  }

  function toggleQuote() {
    const inQuote = /blockquote/i.test(document.queryCommandValue('formatBlock'))
    runEdit(() => document.execCommand('formatBlock', false, inQuote ? 'div' : 'blockquote'))
    refreshToolbar()
  }

  function addCollapse() {
    const field = ref.current
    if (!field) return
    runEdit(() => insertCollapse(field))
    setToolbar(null)
  }

  function openLink() {
    const field = ref.current
    const selection = window.getSelection()
    if (!field || !selection || selection.rangeCount === 0) return
    const saved = selection.getRangeAt(0).cloneRange()
    const input = window.prompt('Link URL')
    // prompt() blurs the field and drops the selection; restore both.
    selection.removeAllRanges()
    selection.addRange(saved)
    field.focus()
    if (input === null) return
    const url = input.trim()
    runEdit(() => {
      if (url) document.execCommand('createLink', false, normalizeUrl(url))
      else document.execCommand('unlink')
    })
    refreshToolbar()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const field = ref.current
    if (!field) return

    // Undo/redo run off this field's own history, never the browser's — see the
    // note above HISTORY_LIMIT for why. ⇧⌘Z and ⌘Y both redo.
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        travelHistory(event.shiftKey ? 1 : -1)
        return
      }
      if (key === 'y' && !event.shiftKey) {
        event.preventDefault()
        travelHistory(1)
        return
      }
    }

    // Format shortcuts. The browser's own ⌘A/etc. are left untouched.
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase()
      if (!event.shiftKey && (key === 'b' || key === 'i' || key === 'u')) {
        event.preventDefault()
        runFormat(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline')
        return
      }
      if (event.shiftKey && key === 's') {
        event.preventDefault()
        runFormat('strikeThrough')
        return
      }
      if (!event.shiftKey && key === 'k') {
        event.preventDefault()
        openLink()
        return
      }
      if (event.shiftKey && key === 'e') {
        event.preventDefault()
        toggleQuote()
        return
      }
      if (event.shiftKey && key === 'o') {
        event.preventDefault()
        addCollapse()
        return
      }
    }

    const target = (event.target as HTMLElement).closest('.note-check') as HTMLElement | null
    if (target && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      target.click()
      return
    }
    // Enter inside a collapse: keep new lines within the body (the browser would
    // otherwise split it into stray sibling divs), and let a double-Enter break
    // out. Shift+Enter always adds a line and never exits.
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey && !busy.current) {
      busy.current = true
      let handled = handleCollapseEnter(field, !event.shiftKey)
      // Outside a collapse, a plain Enter continues a checkbox/bullet list (or
      // drops the marker on an empty line). Shift+Enter stays a plain break.
      if (!handled && !event.shiftKey) handled = handleListEnter(field)
      busy.current = false
      if (handled) {
        event.preventDefault()
        commitAndSave(field)
        return
      }
    }
    // Backspace on an empty checkbox/bullet line drops the marker in one press,
    // inside a collapse body just as outside it.
    if (
      event.key === 'Backspace' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      !busy.current
    ) {
      busy.current = true
      const handled = handleListBackspace(listContainer(field))
      busy.current = false
      if (handled) {
        event.preventDefault()
        commitAndSave(field)
        return
      }
    }
    // On space (before it is inserted): convert a line-start "-" to a bullet.
    // Only save when a conversion actually happens; otherwise let the space
    // type normally (its own input event handles the save).
    if (event.key === ' ' && !busy.current) {
      busy.current = true
      const converted = convertBullet(listContainer(field))
      busy.current = false
      if (converted) {
        event.preventDefault()
        commitAndSave(field)
      }
    }
  }

  // Toolbar actions run on mousedown with preventDefault so the field keeps
  // focus and the selection survives the click.
  function onFormat(command: 'bold' | 'italic' | 'underline' | 'strikeThrough') {
    return (event: React.MouseEvent) => {
      event.preventDefault()
      runFormat(command)
    }
  }

  function preventThen(action: () => void) {
    return (event: React.MouseEvent) => {
      event.preventDefault()
      action()
    }
  }

  function onLinePrefix(kind: 'check' | 'bullet') {
    return (event: React.MouseEvent) => {
      event.preventDefault()
      const field = ref.current
      if (!field) return
      runEdit(() => setLineMarker(listContainer(field), kind))
      setToolbar(null)
    }
  }

  return (
    <>
      <div
        className="note-field"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Application note"
        data-placeholder="Add a note"
        ref={ref}
        onInput={handleInput}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />
      {dropLine ? (
        <div
          className="note-drop-line"
          aria-hidden="true"
          style={{ top: dropLine.top, left: dropLine.left, width: dropLine.width }}
        />
      ) : null}
      {toolbar ? (
        <div
          className="note-toolbar"
          role="toolbar"
          aria-label="Format note"
          style={{ top: toolbar.top, left: toolbar.left }}
          onMouseDown={suppressNextClick}
        >
          <button
            type="button"
            className={`note-tb-bold${toolbar.bold ? ' active' : ''}`}
            aria-label="Bold"
            aria-pressed={toolbar.bold}
            data-tooltip="Bold  ⌘B"
            data-tooltip-above=""
            onMouseDown={onFormat('bold')}
          >
            B
          </button>
          <button
            type="button"
            className={`note-tb-italic${toolbar.italic ? ' active' : ''}`}
            aria-label="Italic"
            aria-pressed={toolbar.italic}
            data-tooltip="Italic  ⌘I"
            data-tooltip-above=""
            onMouseDown={onFormat('italic')}
          >
            I
          </button>
          <button
            type="button"
            className={`note-tb-strike${toolbar.strike ? ' active' : ''}`}
            aria-label="Strikethrough"
            aria-pressed={toolbar.strike}
            data-tooltip="Strikethrough  ⇧⌘S"
            data-tooltip-above=""
            onMouseDown={onFormat('strikeThrough')}
          >
            S
          </button>
          <button
            type="button"
            className={`note-tb-underline${toolbar.underline ? ' active' : ''}`}
            aria-label="Underline"
            aria-pressed={toolbar.underline}
            data-tooltip="Underline  ⌘U"
            data-tooltip-above=""
            onMouseDown={onFormat('underline')}
          >
            U
          </button>
          <button
            type="button"
            aria-label="Link"
            data-tooltip="Link  ⌘K"
            data-tooltip-above=""
            onMouseDown={preventThen(openLink)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
            </svg>
          </button>
          <button
            type="button"
            className={toolbar.quote ? 'active' : undefined}
            aria-label="Quote"
            aria-pressed={toolbar.quote}
            data-tooltip="Quote  ⇧⌘E"
            data-tooltip-above=""
            onMouseDown={preventThen(toggleQuote)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="currentColor">
              <path d="M7 7h4v4c0 2.2-1.4 3.8-3.6 4.4l-.6-1.6C8 13.4 9 12.6 9 11.5V11H7zM14 7h4v4c0 2.2-1.4 3.8-3.6 4.4l-.6-1.6c1.2-.4 2.2-1.2 2.2-2.3V11h-2z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Collapse section"
            data-tooltip="Collapse  ⇧⌘O"
            data-tooltip-above=""
            onMouseDown={preventThen(addCollapse)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6l4 4 4-4" />
              <path d="M8 14h8" />
              <path d="M8 18h8" />
            </svg>
          </button>
          <span className="note-tb-sep" aria-hidden="true" />
          <button
            type="button"
            aria-label="Checkbox line"
            data-tooltip="Checkbox  []"
            data-tooltip-above=""
            onMouseDown={onLinePrefix('check')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
              <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M8 12.5l2.6 2.6 5-5.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Bullet line"
            data-tooltip="Bullet  - "
            data-tooltip-above=""
            onMouseDown={onLinePrefix('bullet')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
              <circle cx="6" cy="12" r="2" fill="currentColor" />
              <path d="M11 12h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </>
  )
}
