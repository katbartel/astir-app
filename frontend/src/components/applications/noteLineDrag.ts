'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import type { NoteBlock } from '@/lib/applications'

/*
 * Drag a single note line to reorder it.
 *
 * A note line is not an element — the field renders lines as text runs separated
 * by "\n" — so there is nothing to lift. For the duration of a drag the field is
 * re-rendered from the line model with one div per line: real boxes, real slots,
 * real indents. The drag happens on that rendering; on drop the field is
 * re-rendered normally from the moved model, as one undo step.
 *
 * A line belongs to whichever container it sits in, so the slot it lands in
 * decides its section. Indent is never set by dragging sideways.
 */

const ACTIVATION_DISTANCE = 5
const DISPLACE_MS = 180
const INDENT_MS = 150
const DROP_MS = 200
const EASE = 'cubic-bezier(.2, .8, .2, 1)'
const LIFT_SCALE = 1.01
const EDGE_ZONE = 60
const EDGE_SPEED = 16

export type LineNode =
  | { kind: 'line'; blocks: NoteBlock[] }
  | { kind: 'quote'; lines: LineNode[] }
  | { kind: 'collapse'; summary: string; open: boolean; lines: LineNode[] }

export type LineDragHost = {
  field: () => HTMLElement | null
  /* The note as lines, unpruned — what is on screen, not what would be saved. */
  readTree: () => LineNode[]
  /* Render the moved note and record it as one undo step. */
  writeTree: (tree: LineNode[]) => void
  /* Put back the exact markup the drag started from, with nothing recorded. */
  restore: (html: string) => void
  renderLine: (blocks: NoteBlock[]) => string
  renderCollapse: (summary: string, open: boolean, body: string) => string
}

/* Where a line can land: an index in one container, and the indent that
   container gives it. `rowIndex` is how many rows sit above the slot. */
type Slot = { path: number[]; index: number; rowIndex: number; threshold: number; indent: number }

type Row = { el: HTMLElement; top: number; height: number; mid: number }

type Session = {
  tree: LineNode[]
  source: number[]
  originalHtml: string
  el: HTMLElement
  gap: HTMLElement
  rows: Row[]
  slots: Slot[]
  containers: Map<string, HTMLElement>
  origin: Slot
  target: Slot
  originTop: number
  originLeft: number
  height: number
  grabOffset: number
  scroller: HTMLElement | null
  scrollAtLift: number
  edges: { top: number; bottom: number }
  reduce: boolean
  pointerY: number
  frame: number
  onKeyDown: (event: KeyboardEvent) => void
}

function samePath(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function startsWith(path: number[], prefix: number[]) {
  return prefix.every((value, index) => path[index] === value)
}

/* Move one line to another container and index. The source comes out first, so
   any target path that ran through a later sibling shifts back by one. */
export function moveLine(tree: LineNode[], source: number[], target: { path: number[]; index: number }) {
  const next = JSON.parse(JSON.stringify(tree)) as LineNode[]
  const fromParent = source.slice(0, -1)
  const fromIndex = source[source.length - 1]
  const from = containerAt(next, fromParent)
  if (!from) return tree
  const [moved] = from.splice(fromIndex, 1)
  if (!moved) return tree

  const path = [...target.path]
  let index = target.index
  if (startsWith(path, fromParent)) {
    if (path.length === fromParent.length) {
      if (index > fromIndex) index -= 1
    } else if (path[fromParent.length] > fromIndex) {
      path[fromParent.length] -= 1
    }
  }
  const into = containerAt(next, path)
  if (!into) return tree
  into.splice(index, 0, moved)
  return next
}

function containerAt(tree: LineNode[], path: number[]): LineNode[] | null {
  let lines = tree
  for (const index of path) {
    const node = lines[index]
    if (!node || node.kind === 'line') return null
    lines = node.lines
  }
  return lines
}

/* One element per line, so the drag has boxes to measure and move. */
function dragHtml(tree: LineNode[], host: LineDragHost): string {
  return tree
    .map((node) => {
      if (node.kind === 'line') {
        return `<div class="note-drag-line">${host.renderLine(node.blocks) || '<br>'}</div>`
      }
      if (node.kind === 'quote') {
        return `<blockquote class="note-quote">${dragHtml(node.lines, host) || '<br>'}</blockquote>`
      }
      return host.renderCollapse(node.summary, node.open, dragHtml(node.lines, host))
    })
    .join('')
}

/* The children that stand for lines: everything but the transient gap. */
function kids(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(
    (child) => !child.classList.contains('note-drag-gap'),
  ) as HTMLElement[]
}

/* The element holding a container's lines: a quote is its own body, a collapse
   keeps its lines in the div after the head. */
function bodyOf(node: LineNode, el: HTMLElement): HTMLElement | null {
  if (node.kind === 'quote') return el
  if (node.kind === 'collapse') return kids(el)[1] ?? null
  return null
}

function resolve(field: HTMLElement, tree: LineNode[], path: number[]): HTMLElement | null {
  let lines = tree
  let container: HTMLElement = field
  for (let step = 0; step < path.length; step++) {
    const el = kids(container)[path[step]]
    const node = lines[path[step]]
    if (!el || !node) return null
    if (step === path.length - 1) return el
    const body = bodyOf(node, el)
    if (!body || node.kind === 'line') return null
    lines = node.lines
    container = body
  }
  return null
}

function contentLeft(el: HTMLElement) {
  const style = getComputedStyle(el)
  return (
    el.getBoundingClientRect().left +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.paddingLeft)
  )
}

/*
 * Every slot the line can land in, with the pointer height that selects it.
 *
 * Thresholds run down the page in order, so the last one the lifted line's
 * centre has passed is the target. A section contributes three kinds: its head's
 * midpoint puts the line inside, each child's midpoint moves it down within, and
 * the section's own bottom edge puts it after the section. That last pair is why
 * "end of section" and "after the section" are two slots at one gap.
 */
function measure(tree: LineNode[], field: HTMLElement, source: number[]) {
  const rows: Row[] = []
  const slots: Slot[] = []
  const containers = new Map<string, HTMLElement>()
  const fieldLeft = contentLeft(field)

  const addRow = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    rows.push({ el, top: rect.top, height: rect.height, mid: rect.top + rect.height / 2 })
    return rows[rows.length - 1]
  }

  const walk = (lines: LineNode[], containerEl: HTMLElement, path: number[], entry: number) => {
    containers.set(path.join('.'), containerEl)
    const indent = contentLeft(containerEl) - fieldLeft
    slots.push({ path, index: 0, rowIndex: rows.length, threshold: entry, indent })
    const children = kids(containerEl)
    lines.forEach((node, i) => {
      const el = children[i]
      if (!el) return
      const after = (threshold: number) =>
        slots.push({ path, index: i + 1, rowIndex: rows.length, threshold, indent })

      if (node.kind === 'line') {
        // The lifted line is neither a row nor a landing place of its own.
        if (samePath([...path, i], source)) return
        after(addRow(el).mid)
        return
      }
      if (node.kind === 'quote') {
        walk(node.lines, el, [...path, i], el.getBoundingClientRect().top)
        after(el.getBoundingClientRect().bottom)
        return
      }
      // A closed section is one row with one midpoint: no way in, no way through.
      if (!node.open) {
        after(addRow(el).mid)
        return
      }
      const head = kids(el)[0]
      const body = bodyOf(node, el)
      if (!head || !body) return
      walk(node.lines, body, [...path, i], addRow(head).mid)
      after(el.getBoundingClientRect().bottom)
    })
  }

  walk(tree, field, [], -Infinity)
  return { rows, slots, containers }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function scrollParent(node: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = node
  while (el) {
    const overflow = getComputedStyle(el).overflowY
    if (/(auto|scroll|overlay)/.test(overflow) && el.scrollHeight > el.clientHeight) return el
    el = el.parentElement
  }
  return null
}

function scrollTopOf(el: HTMLElement | null) {
  return el ? el.scrollTop : window.scrollY
}

export function createLineDrag(getHost: () => LineDragHost) {
  let pending: { check: number; startY: number } | null = null
  let session: Session | null = null

  /* Which line holds the nth checkbox, counting in document order. */
  function pathOfCheck(tree: LineNode[], target: number): number[] | null {
    let seen = 0
    const walk = (lines: LineNode[], path: number[]): number[] | null => {
      for (let i = 0; i < lines.length; i++) {
        const node = lines[i]
        if (node.kind === 'line') {
          for (const block of node.blocks) {
            if (block.type !== 'check') continue
            if (seen === target) return [...path, i]
            seen += 1
          }
          continue
        }
        const found = walk(node.lines, [...path, i])
        if (found) return found
      }
      return null
    }
    return walk(tree, [])
  }

  /* Put the gap in a slot and let the flow do the displacing: read where the
     rows are, move it, read where they landed, then play them from one to the
     other. Real layout means a section's own box grows and shrinks with it. */
  function placeGap(active: Session, slot: Slot) {
    const container = active.containers.get(slot.path.join('.'))
    if (!container) return
    const first = active.rows.map((row) => row.el.getBoundingClientRect().top)
    for (const row of active.rows) {
      row.el.style.transition = 'none'
      row.el.style.transform = ''
    }
    const before = kids(container)[slot.index] ?? null
    container.insertBefore(active.gap, before)
    active.gap.style.marginLeft = `${slot.indent - active.origin.indent}px`
    const last = active.rows.map((row) => row.el.getBoundingClientRect().top)
    active.rows.forEach((row, index) => {
      const delta = first[index] - last[index]
      if (delta) row.el.style.transform = `translateY(${delta}px)`
    })
    requestAnimationFrame(() => {
      for (const row of active.rows) {
        row.el.style.transition = active.reduce ? 'none' : `transform ${DISPLACE_MS}ms ${EASE}`
        row.el.style.transform = ''
      }
    })
  }

  function autoScroll(active: Session) {
    const fromTop = active.pointerY - active.edges.top
    const fromBottom = active.edges.bottom - active.pointerY
    let delta = 0
    if (fromTop < EDGE_ZONE) delta = -EDGE_SPEED * Math.min(1, (EDGE_ZONE - fromTop) / EDGE_ZONE)
    else if (fromBottom < EDGE_ZONE) {
      delta = EDGE_SPEED * Math.min(1, (EDGE_ZONE - fromBottom) / EDGE_ZONE)
    }
    if (!delta) return
    if (active.scroller) active.scroller.scrollTop += delta
    else window.scrollBy(0, delta)
  }

  function step() {
    const active = session
    if (!active) return
    autoScroll(active)

    const scrolled = scrollTopOf(active.scroller) - active.scrollAtLift
    const top = active.pointerY - active.grabOffset
    active.el.style.transform = `translateY(${top - active.originTop}px) scale(${LIFT_SCALE})`

    const centre = top + active.height / 2
    let target = active.slots[0]
    for (const slot of active.slots) if (centre >= slot.threshold - scrolled) target = slot
    if (target !== active.target) {
      active.target = target
      placeGap(active, target)
      active.el.style.translate = `${target.indent - active.origin.indent}px 0`
    }

    active.frame = requestAnimationFrame(step)
  }

  function start(pointerY: number) {
    const begin = pending
    pending = null
    if (!begin) return
    const host = getHost()
    const field = host.field()
    if (!field) return
    const tree = host.readTree()
    const source = pathOfCheck(tree, begin.check)
    if (!source) return

    const originalHtml = field.innerHTML
    // The transient rendering must never take a caret or a keystroke.
    window.getSelection()?.removeAllRanges()
    field.contentEditable = 'false'
    field.innerHTML = dragHtml(tree, host)

    const el = resolve(field, tree, source)
    if (!el) {
      host.restore(originalHtml)
      field.contentEditable = 'true'
      return
    }

    const rect = el.getBoundingClientRect()
    const gap = document.createElement('div')
    gap.className = 'note-drag-gap'
    gap.style.height = `${rect.height}px`
    el.parentElement?.insertBefore(gap, el)

    // Take the card look first, then measure what it added: the line has to be
    // positioned by its own box for its contents to stay where they were.
    el.classList.add('note-line-lifted')
    const card = getComputedStyle(el)
    const insetTop = parseFloat(card.paddingTop) + parseFloat(card.borderTopWidth)
    const insetLeft = parseFloat(card.paddingLeft) + parseFloat(card.borderLeftWidth)
    const grownX = insetLeft + parseFloat(card.paddingRight) + parseFloat(card.borderRightWidth)
    const grownY = insetTop + parseFloat(card.paddingBottom) + parseFloat(card.borderBottomWidth)
    el.style.position = 'fixed'
    el.style.top = `${rect.top - insetTop}px`
    el.style.left = `${rect.left - insetLeft}px`
    el.style.width = `${rect.width + grownX}px`
    el.style.height = `${rect.height + grownY}px`
    el.style.margin = '0'
    el.style.transform = `scale(${LIFT_SCALE})`
    el.style.boxShadow = 'var(--shadow-menu)'
    // Y follows the pointer with no easing; x is the indent of the target slot,
    // and it is the only thing in the drag that eases sideways. They are separate
    // properties so one can be animated without the other.
    const reduce = prefersReducedMotion()
    el.style.translate = '0px 0'
    el.style.transition = reduce ? 'none' : `translate ${INDENT_MS}ms ${EASE}`

    const { rows, slots, containers } = measure(tree, field, source)
    const parent = source.slice(0, -1)
    const index = source[source.length - 1]
    const origin =
      slots.find((slot) => samePath(slot.path, parent) && slot.index === index) ?? slots[0]
    const scroller = scrollParent(field)
    const bounds = scroller
      ? scroller.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight }

    const active: Session = {
      tree,
      source,
      originalHtml,
      el,
      gap,
      rows,
      slots,
      containers,
      origin,
      target: origin,
      originTop: rect.top,
      originLeft: rect.left,
      height: rect.height,
      grabOffset: pointerY - rect.top,
      scroller,
      scrollAtLift: scrollTopOf(scroller),
      edges: { top: bounds.top, bottom: bounds.bottom },
      reduce,
      pointerY,
      frame: 0,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Escape') finish(false)
      },
    }
    session = active
    window.addEventListener('keydown', active.onKeyDown)
    active.frame = requestAnimationFrame(step)
  }

  function finish(commit: boolean) {
    const active = session
    if (!active) return
    session = null
    cancelAnimationFrame(active.frame)
    window.removeEventListener('keydown', active.onKeyDown)

    // A cancelled drag drops back into the slot it came from.
    const target = commit ? active.target : active.origin
    if (target !== active.target) {
      placeGap(active, target)
      active.el.style.translate = `${target.indent - active.origin.indent}px 0`
    }

    const rest = active.gap.getBoundingClientRect()
    active.el.style.transition = active.reduce
      ? 'none'
      : `transform ${DROP_MS}ms ${EASE}, translate ${DROP_MS}ms ${EASE}, box-shadow ${DROP_MS}ms ${EASE}`
    active.el.style.transform = `translateY(${rest.top - active.originTop}px) scale(1)`
    active.el.style.translate = `${rest.left - active.originLeft}px 0`
    active.el.style.boxShadow = 'none'

    window.setTimeout(
      () => {
        const host = getHost()
        const field = host.field()
        const moved = commit && target !== active.origin
        if (moved) host.writeTree(moveLine(active.tree, active.source, target))
        else host.restore(active.originalHtml)
        if (field) field.contentEditable = 'true'
      },
      active.reduce ? 0 : DROP_MS,
    )
  }

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || session) return
      const grip = (event.target as HTMLElement).closest('.note-grip')
      const check = grip?.closest('.note-check')
      const field = getHost().field()
      if (!grip || !check || !field) return
      const order = Array.from(field.querySelectorAll('.note-check')).indexOf(check)
      if (order < 0) return
      // Keep the caret where it is: this gesture is a drag, not a click into text.
      event.preventDefault()
      pending = { check: order, startY: event.clientY }
      field.setPointerCapture(event.pointerId)
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      if (session) {
        session.pointerY = event.clientY
        return
      }
      if (!pending) return
      if (Math.abs(event.clientY - pending.startY) < ACTIVATION_DISTANCE) return
      start(event.clientY)
    },
    onPointerUp() {
      pending = null
      finish(true)
    },
    onPointerCancel() {
      pending = null
      finish(false)
    },
    onLostPointerCapture() {
      pending = null
      finish(false)
    },
  }
}
