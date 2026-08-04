// Drag a row to reorder it. See docs/notes-editor.md section 8.
//
// Two rules shape every line of this file:
//
//   1. It never mutates the DOM to move anything. It resolves a target document
//      position and dispatches one transaction; ProseMirror re-renders. The drag's
//      transient appearance (the lifted card, the gap) is decorations and plugin
//      state, which are not document state and are kept out of the undo history.
//   2. Every geometric question is asked of ProseMirror: `coordsAtPos` for where a
//      row is, `posAtCoords` for what is under the pointer. Never DOM traversal.
//
// The version this replaces re-rendered the whole field into per-line divs and set
// contenteditable=false for the length of a drag, because in that model a line was
// not an element. A row is a node now, so none of that is needed.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'

const ACTIVATION_DISTANCE = 5
const ROW_TYPES = ['paragraph', 'check', 'bullet']

const isRow = (node: PmNode | null | undefined) => !!node && ROW_TYPES.includes(node.type.name)

/** Where a dragged row can land: a document position, and the indent it gets there. */
type Slot = { threshold: number; insert: number; indent: number }

type Dragging = {
  from: number
  to: number
  slots: Slot[]
  active: number
  height: number
}

type DragMeta = { type: 'start'; dragging: Dragging } | { type: 'move'; active: number } | { type: 'end' }

export const noteDragKey = new PluginKey<Dragging | null>('noteDrag')

// --- slots ---

/**
 * Every place the dragged row could go, measured once at lift and never
 * recomputed: the gap moving around must not move the thing that decides where the
 * gap goes.
 *
 * A section contributes three kinds of slot. Its header's midpoint puts the row
 * inside, each body row's midpoint moves it down within, and the section's own
 * bottom edge puts it after. A collapsed section contributes exactly one row with
 * one midpoint, so a row crossing it lands entirely above or below and can never
 * reach a hidden body.
 */
function buildSlots(view: EditorView, exclude: { from: number; to: number }): Slot[] {
  const slots: Slot[] = []
  const editorLeft = view.dom.getBoundingClientRect().left

  const add = (threshold: number, insert: number, indent: number) => {
    if (insert >= exclude.from && insert <= exclude.to) return
    slots.push({ threshold, insert, indent })
  }

  const rowRect = (pos: number) => {
    const start = view.coordsAtPos(pos + 1)
    return { top: start.top, bottom: start.bottom, left: start.left }
  }

  const walkContainer = (container: PmNode, containerPos: number, depth: number) => {
    let offset = containerPos + 1
    container.forEach((child) => {
      const pos = offset
      offset += child.nodeSize

      if (isRow(child)) {
        const rect = rowRect(pos)
        const mid = (rect.top + rect.bottom) / 2
        add(mid, pos + child.nodeSize, rect.left - editorLeft)
        return
      }

      if (child.type.name === 'quote') {
        const first = child.firstChild
        if (first) {
          const rect = rowRect(pos + 1)
          add((rect.top + rect.bottom) / 2, pos + 1, rect.left - editorLeft)
        }
        walkContainer(child, pos, depth + 1)
        const last = view.coordsAtPos(pos + child.nodeSize - 2)
        add(last.bottom, pos + child.nodeSize, 0)
        return
      }

      if (child.type.name === 'section') {
        const title = child.child(0)
        const body = child.child(1)
        const titleRect = rowRect(pos + 1)
        const bodyPos = pos + 1 + title.nodeSize

        if (child.attrs.collapsed === true) {
          // One row, one midpoint. Nothing inside is reachable.
          const mid = (titleRect.top + titleRect.bottom) / 2
          add(mid, pos + child.nodeSize, 0)
          return
        }

        // The header's midpoint puts the row inside, at the top of the body.
        const firstBodyRect = body.firstChild ? rowRect(bodyPos + 1) : titleRect
        add((titleRect.top + titleRect.bottom) / 2, bodyPos + 1, firstBodyRect.left - editorLeft)
        walkContainer(body, bodyPos, depth + 1)
        // And the section's own bottom edge puts it after the section. Two slots at
        // one gap, with two indents, which is the point.
        const bottom = view.coordsAtPos(pos + child.nodeSize - 3)
        add(bottom.bottom + 1, pos + child.nodeSize, 0)
      }
    })
  }

  // "Above everything", which no row's midpoint can express: without it a pointer
  // above the first midpoint would fall through to the slot after the first row.
  slots.push({ threshold: Number.NEGATIVE_INFINITY, insert: 0, indent: 0 })

  walkContainer(view.state.doc, -1, 0)
  slots.sort((a, b) => a.threshold - b.threshold)
  return slots
}

/**
 * The last slot whose threshold the pointer has passed. Note the index: having
 * passed threshold i selects slot i, not i + 1. Selecting i + 1 lands the row one
 * position further down than the gap shown, which reads as an off-by-one nobody can
 * see until they look at the document.
 */
const slotFor = (slots: Slot[], y: number) => {
  let index = 0
  for (let i = 0; i < slots.length; i += 1) if (y >= slots[i].threshold) index = i
  return index
}

// --- the move, as one transaction ---

/**
 * Move a row to a document position. One transaction, so one undo step, and the
 * node object itself is moved rather than rebuilt: its text, marks, type, and
 * checked state cannot change (invariant 6).
 */
export function moveRow(state: EditorState, from: number, insert: number): Transaction | null {
  const node = state.doc.nodeAt(from)
  // Rows in general can be moved by a transaction, but the pointer drag only offers a
  // grip on a check row, and this is the command behind that grip. Keeping the guard
  // here as well means a stray call cannot drag something the affordance never offered.
  if (!node || node.type.name !== 'check') return null
  if (insert >= from && insert <= from + node.nodeSize) return null

  const $from = state.doc.resolve(from)
  const containerPos = $from.depth > 0 ? $from.before($from.depth) : -1
  const tr = state.tr.delete(from, from + node.nodeSize)

  // A container that requires at least one child keeps an empty paragraph, exactly
  // as when a row is lifted out by keyboard: a section that loses its last child
  // stays on screen.
  if (containerPos >= 0) {
    const mapped = tr.mapping.map(containerPos)
    const container = tr.doc.nodeAt(mapped)
    if (container && container.childCount === 0) {
      tr.insert(mapped + 1, state.schema.nodes.paragraph.createChecked(null))
    }
  }

  const target = tr.mapping.map(insert)
  tr.insert(target, node)
  // The caret follows the row, which is invariant 7 applied to a drop: every
  // operation says where the caret goes. It also keeps undo reachable, since undo is
  // a keymap on the editable and a drag that never focused it would leave cmd+Z
  // doing nothing.
  tr.setSelection(TextSelection.create(tr.doc, target + 1))
  return tr
}

// --- the plugin ---

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export const NoteDrag = Extension.create({
  name: 'noteDrag',

  addProseMirrorPlugins() {
    let grip: HTMLButtonElement | null = null
    let card: HTMLElement | null = null
    let hovered: { pos: number; nodeSize: number } | null = null

    return [
      new Plugin<Dragging | null>({
        key: noteDragKey,

        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(noteDragKey) as DragMeta | undefined
            if (!meta) return value
            if (meta.type === 'start') return meta.dragging
            if (meta.type === 'end') return null
            return value ? { ...value, active: meta.active } : value
          },
        },

        props: {
          decorations(state) {
            const dragging = noteDragKey.getState(state)
            if (!dragging) return DecorationSet.empty
            const slot = dragging.slots[dragging.active]
            const decorations = [
              // The row being dragged: still in the document, shown as lifted.
              Decoration.node(dragging.from, dragging.to, { class: 'note-dragging' }),
            ]
            if (slot) {
              decorations.push(
                Decoration.widget(slot.insert, () => {
                  // The gap takes the indent of the target slot. A plain space, no
                  // dashed outline.
                  const gap = document.createElement('div')
                  gap.className = 'note-drag-gap'
                  gap.style.height = `${dragging.height}px`
                  gap.style.marginLeft = `${slot.indent}px`
                  return gap
                }, { side: -1 }),
              )
            }
            return DecorationSet.create(state.doc, decorations)
          },
        },

        view(view) {
          /**
           * Resolved on use, never captured. React mounts the editor's DOM into its
           * final wrapper *after* the plugin's view is created, so a parent captured
           * here is a detached node: listeners on it never fire and the grip never
           * appears.
           */
          const host = () => view.dom.parentElement ?? view.dom

          grip = document.createElement('button')
          grip.type = 'button'
          grip.className = 'note-grip'
          grip.setAttribute('aria-label', 'Reorder row')
          grip.setAttribute('contenteditable', 'false')
          grip.dataset.on = 'false'
          // The six-dot glyph recovered from the deleted editor's GRIP_SVG, rather
          // than six styled spans. Same viewBox and the same circles, so it is the
          // same mark at the same weight.
          const gripSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          gripSvg.setAttribute('viewBox', '0 0 10 16')
          gripSvg.setAttribute('aria-hidden', 'true')
          for (const [cx, cy] of [[3, 3], [3, 8], [3, 13], [7, 3], [7, 8], [7, 13]]) {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            dot.setAttribute('cx', String(cx))
            dot.setAttribute('cy', String(cy))
            dot.setAttribute('r', '1.3')
            gripSvg.appendChild(dot)
          }
          grip.appendChild(gripSvg)

          /**
           * Which row is under the pointer, asked of ProseMirror rather than the DOM.
           *
           * Resolve `pos`, not `inside`: `inside` is the position *of* the node the
           * coordinates fall in, so resolving it puts the row in `nodeAfter` rather
           * than in the ancestor chain, and walking up finds nothing.
           *
           * A section header is not a row, so walking up from a title finds no row
           * and no grip appears. That is the rule, not a special case.
           */
          const rowUnder = (x: number, y: number) => {
            const at = view.posAtCoords({ left: x, top: y })
            if (!at) return null
            // The recovered rule, literally: in the deleted editor the grip lived
            // inside the checkbox span, so a grip belonged to a check row and to
            // nothing else. An empty check row did have one; a plain line never did,
            // full or empty. The rebuild gave every row a grip, which is what put one
            // beside every blank line the pointer crossed.
            //
            // The draggable unit is therefore a check row. See docs/notes-editor.md
            // section 8.
            const offersGrip = (node: PmNode) => node.type.name === 'check'
            const $pos = view.state.doc.resolve(at.pos)
            for (let depth = $pos.depth; depth > 0; depth -= 1) {
              const node = $pos.node(depth)
              if (isRow(node)) return offersGrip(node) ? { pos: $pos.before(depth), nodeSize: node.nodeSize } : null
            }
            if (at.inside >= 0) {
              const node = view.state.doc.nodeAt(at.inside)
              if (node && isRow(node)) return offersGrip(node) ? { pos: at.inside, nodeSize: node.nodeSize } : null
            }
            return null
          }

          const placeGrip = (row: { pos: number; nodeSize: number } | null) => {
            hovered = row
            if (!grip) return
            if (!row) {
              grip.dataset.on = 'false'
              return
            }
            const parent = host()
            if (grip.parentElement !== parent) parent.appendChild(grip)
            // Vertical from the first line of the row; horizontal from the row's
            // own left edge — its node position, `row.pos`. coordsAtPos(row.pos + 1)
            // is the content edge *after* any marker, so measuring left from it put
            // the grip on top of the box and shifted it by the marker's width. The
            // row's left edge is the shared edge a paragraph and a checkbox agree on
            // (section 5, rule 1), and it already carries the section indent.
            // See docs/notes-editor.md section 8, condition 2.
            const line = view.coordsAtPos(row.pos + 1)
            const edge = view.coordsAtPos(row.pos)
            const rect = parent.getBoundingClientRect()
            // data-on rather than `hidden`: display:none cannot fade, and the recovered
            // rule is a fade in over 120ms.
            grip.dataset.on = 'true'
            grip.style.top = `${line.top - rect.top}px`
            grip.style.left = `${edge.left - rect.left}px`
          }

          const onMove = (event: MouseEvent) => {
            if (noteDragKey.getState(view.state)) return
            // Moving from the row onto the grip must not count as leaving the row.
            // The grip sits over the editable but is not inside it, so listening on
            // the editable alone clears the hover on the way to the grip and the
            // pointerdown then has nothing to pick up.
            if (grip && (event.target === grip || grip.contains(event.target as globalThis.Node))) return
            placeGrip(rowUnder(event.clientX, event.clientY))
          }
          const onLeave = (event: MouseEvent) => {
            // Heading for the grip is not leaving the row. relatedTarget is where the
            // pointer went, which answers that exactly.
            const to = event.relatedTarget as globalThis.Node | null
            if (grip && to && (to === grip || grip.contains(to))) return
            if (!noteDragKey.getState(view.state)) placeGrip(null)
          }

          view.dom.addEventListener('mousemove', onMove)
          view.dom.addEventListener('mouseleave', onLeave)

          // --- the drag itself ---

          let armed = false
          let origin = { x: 0, y: 0 }
          let start: { pos: number; nodeSize: number } | null = null

          const onPointerDown = (event: PointerEvent) => {
            if (!hovered) return
            event.preventDefault()
            armed = false
            origin = { x: event.clientX, y: event.clientY }
            start = hovered
            window.addEventListener('pointermove', onPointerMove)
            window.addEventListener('pointerup', onPointerUp)
          }

          const arm = () => {
            if (!start) return
            const node = view.state.doc.nodeAt(start.pos)
            if (!node) return
            const coords = view.coordsAtPos(start.pos + 1)
            const dragging: Dragging = {
              from: start.pos,
              to: start.pos + node.nodeSize,
              slots: buildSlots(view, { from: start.pos, to: start.pos + node.nodeSize }),
              active: 0,
              height: Math.max(coords.bottom - coords.top, 1),
            }
            // Plugin state only, and never in the history: a lift is not an edit.
            const tr = view.state.tr.setMeta(noteDragKey, { type: 'start', dragging } satisfies DragMeta)
            tr.setMeta('addToHistory', false)
            view.dispatch(tr)

            card = document.createElement('div')
            card.className = 'note-drag-card'
            if (reduceMotion()) card.dataset.reduceMotion = 'true'
            card.textContent = node.textContent
            document.body.appendChild(card)
            if (grip) grip.dataset.dragging = 'true'
            armed = true
          }

          const onPointerMove = (event: PointerEvent) => {
            if (!start) return
            if (!armed) {
              const far =
                Math.abs(event.clientX - origin.x) > ACTIVATION_DISTANCE ||
                Math.abs(event.clientY - origin.y) > ACTIVATION_DISTANCE
              // 5px arms it, so a click still reaches the row.
              if (!far) return
              arm()
            }
            const dragging = noteDragKey.getState(view.state)
            if (!dragging) return
            if (card) {
              card.style.top = `${event.clientY}px`
              card.style.left = `${event.clientX}px`
            }
            const active = slotFor(dragging.slots, event.clientY)
            if (active !== dragging.active) {
              const tr = view.state.tr.setMeta(noteDragKey, { type: 'move', active } satisfies DragMeta)
              tr.setMeta('addToHistory', false)
              view.dispatch(tr)
            }
          }

          const finish = (commit: boolean) => {
            const dragging = noteDragKey.getState(view.state)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            card?.remove()
            card = null
            if (grip) grip.dataset.dragging = 'false'
            if (!dragging) {
              start = null
              armed = false
              return
            }
            const end = view.state.tr.setMeta(noteDragKey, { type: 'end' } satisfies DragMeta)
            end.setMeta('addToHistory', false)
            view.dispatch(end)

            if (commit) {
              const slot = dragging.slots[dragging.active]
              if (slot) {
                // The drop: one transaction, one undo step.
                const tr = moveRow(view.state, dragging.from, slot.insert)
                if (tr) {
                  view.dispatch(tr)
                  view.focus()
                }
              }
            }
            start = null
            armed = false
          }

          const onPointerUp = () => finish(true)
          const onKeyDown = (event: KeyboardEvent) => {
            // A cancelled drag dispatches nothing and records nothing.
            if (event.key === 'Escape' && noteDragKey.getState(view.state)) finish(false)
          }

          grip.addEventListener('pointerdown', onPointerDown)
          window.addEventListener('keydown', onKeyDown)

          return {
            destroy() {
              view.dom.removeEventListener('mousemove', onMove)
              view.dom.removeEventListener('mouseleave', onLeave)
              window.removeEventListener('pointermove', onPointerMove)
              window.removeEventListener('pointerup', onPointerUp)
              window.removeEventListener('keydown', onKeyDown)
              grip?.remove()
              card?.remove()
              grip = null
              card = null
            },
          }
        },
      }),
    ]
  },
})
