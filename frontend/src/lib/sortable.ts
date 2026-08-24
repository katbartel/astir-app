'use client'

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'

/*
 * Drag to reorder a vertical list, on pointer events.
 *
 * The DOM order never changes while a drag is running. The dragged row is
 * lifted out of flow and follows the pointer; every other row is pushed a slot
 * up or down with a transform, so the whole drag costs no layout. The real
 * order is committed once, on drop, in the same frame the transforms are
 * cleared — so nothing moves at the moment of commit.
 */

const ACTIVATION_DISTANCE = 5
const DISPLACE_MS = 180
const DROP_MS = 200
const EASE = 'cubic-bezier(.2, .8, .2, 1)'
const LIFT_SCALE = 1.01
const EDGE_ZONE = 60
const EDGE_SPEED = 16

type Resting = { id: string; mid: number }

type Drag = {
  id: string
  index: number
  el: HTMLElement
  slot: number
  height: number
  grabOffset: number
  originTop: number
  resting: Resting[]
  scroller: HTMLElement | null
  scrollAtLift: number
  edges: { top: number; bottom: number }
  reduce: boolean
  pointerY: number
  target: number
  frame: number
}

type Picked = { id: string; from: number; to: number; slot: number }

type Placeholder = { height: number }

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function displaceTransition(reduce: boolean) {
  return reduce ? 'none' : `transform ${DISPLACE_MS}ms ${EASE}`
}

/* The nearest ancestor that actually scrolls, or null for the page itself. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement
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

function translate(el: HTMLElement, y: number) {
  const next = y === 0 ? '' : `translateY(${y}px)`
  if (el.style.transform !== next) el.style.transform = next
}

export function useSortableList({
  ids,
  labelOf,
  onReorder,
}: {
  ids: string[]
  labelOf: (id: string) => string
  onReorder: (from: number, to: number) => void
}) {
  const rows = useRef(new Map<string, HTMLElement>()).current
  const rowRefs = useRef(new Map<string, (node: HTMLElement | null) => void>()).current
  const listEl = useRef<HTMLElement | null>(null)
  const placeholderEl = useRef<HTMLDivElement | null>(null)
  const drag = useRef<Drag | null>(null)
  const pending = useRef<{ id: string; index: number; startY: number } | null>(null)
  const idsRef = useRef(ids)
  idsRef.current = ids

  const [lifted, setLifted] = useState<{ id: string; placeholder: Placeholder } | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const clearStyles = useCallback(() => {
    for (const node of rows.values()) {
      node.style.transform = ''
      node.style.transition = ''
      node.style.position = ''
      node.style.top = ''
      node.style.left = ''
      node.style.width = ''
      node.style.height = ''
      node.style.margin = ''
      node.style.boxShadow = ''
    }
  }, [rows])

  const autoScroll = useCallback((d: Drag) => {
    const fromTop = d.pointerY - d.edges.top
    const fromBottom = d.edges.bottom - d.pointerY
    let delta = 0
    if (fromTop < EDGE_ZONE) delta = -EDGE_SPEED * Math.min(1, (EDGE_ZONE - fromTop) / EDGE_ZONE)
    else if (fromBottom < EDGE_ZONE) {
      delta = EDGE_SPEED * Math.min(1, (EDGE_ZONE - fromBottom) / EDGE_ZONE)
    }
    if (!delta) return
    if (d.scroller) d.scroller.scrollTop += delta
    else window.scrollBy(0, delta)
  }, [])

  const step = useCallback(() => {
    const d = drag.current
    if (!d) return
    autoScroll(d)

    // Rows sit in the flow and move with the page; the lifted card is fixed to
    // the viewport, so only the flowed rows need the scroll correction.
    const scrolled = scrollTopOf(d.scroller) - d.scrollAtLift
    const top = d.pointerY - d.grabOffset
    d.el.style.transform = `translateY(${top - d.originTop}px) scale(${LIFT_SCALE})`

    const centre = top + d.height / 2
    let target = d.index
    d.resting.forEach((row, index) => {
      if (index === d.index) return
      const node = rows.get(row.id)
      if (!node) return
      const mid = row.mid - scrolled
      if (index > d.index && centre > mid) {
        translate(node, -d.slot)
        target += 1
      } else if (index < d.index && centre < mid) {
        translate(node, d.slot)
        target -= 1
      } else {
        translate(node, 0)
      }
    })
    d.target = target
    if (placeholderEl.current) translate(placeholderEl.current, (target - d.index) * d.slot)

    d.frame = requestAnimationFrame(step)
  }, [autoScroll, rows])

  const finish = useCallback(
    (commit: boolean) => {
      const d = drag.current
      if (!d) return
      drag.current = null
      cancelAnimationFrame(d.frame)

      const scrolled = scrollTopOf(d.scroller) - d.scrollAtLift
      const target = commit ? d.target : d.index
      const restTop = d.originTop - scrolled + (target - d.index) * d.slot
      d.el.style.transition = d.reduce
        ? 'none'
        : `transform ${DROP_MS}ms ${EASE}, box-shadow ${DROP_MS}ms ${EASE}`
      d.el.style.transform = `translateY(${restTop - d.originTop}px) scale(1)`
      d.el.style.boxShadow = 'var(--shadow-card)'
      if (placeholderEl.current) translate(placeholderEl.current, (target - d.index) * d.slot)

      window.setTimeout(
        () => {
          // Commit and strip the drag styling in one flush: the row is already
          // sitting where the new order will put it, so nothing moves.
          flushSync(() => {
            if (target !== d.index) onReorder(d.index, target)
            setLifted(null)
          })
          clearStyles()
          if (target !== d.index) {
            setAnnouncement(
              `Moved ${labelOf(d.id)} to position ${target + 1} of ${idsRef.current.length}.`,
            )
          }
        },
        d.reduce ? 0 : DROP_MS,
      )
    },
    [clearStyles, labelOf, onReorder],
  )

  const startDrag = useCallback(
    (pointerY: number) => {
      const start = pending.current
      pending.current = null
      if (!start) return
      const el = rows.get(start.id)
      if (!el) return

      const rect = el.getBoundingClientRect()
      const resting = idsRef.current.map((id) => {
        const node = rows.get(id)
        const bounds = node?.getBoundingClientRect()
        return { id, mid: bounds ? bounds.top + bounds.height / 2 : 0 }
      })
      const gap = listEl.current ? parseFloat(getComputedStyle(listEl.current).rowGap) || 0 : 0
      const slot =
        resting.length > 1 ? Math.abs(resting[1].mid - resting[0].mid) : rect.height + gap
      const scroller = scrollParent(el)
      const bounds = scroller
        ? scroller.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight }
      const reduce = prefersReducedMotion()

      drag.current = {
        id: start.id,
        index: start.index,
        el,
        slot,
        height: rect.height,
        grabOffset: pointerY - rect.top,
        originTop: rect.top,
        resting,
        scroller,
        scrollAtLift: scrollTopOf(scroller),
        edges: { top: bounds.top, bottom: bounds.bottom },
        reduce,
        pointerY,
        target: start.index,
        frame: 0,
      }

      // Take the card look first, then measure the padding and border it added:
      // the row has to be positioned by its own box for its contents to stay
      // exactly where they were. Handing the slot to the placeholder at the same
      // time keeps the list's height unchanged. None of it paints until the
      // geometry below is set, so the list never jumps.
      flushSync(() => setLifted({ id: start.id, placeholder: { height: rect.height } }))

      const card = getComputedStyle(el)
      const insetTop = parseFloat(card.paddingTop) + parseFloat(card.borderTopWidth)
      const insetLeft = parseFloat(card.paddingLeft) + parseFloat(card.borderLeftWidth)
      const grownX =
        insetLeft + parseFloat(card.paddingRight) + parseFloat(card.borderRightWidth)
      const grownY =
        insetTop + parseFloat(card.paddingBottom) + parseFloat(card.borderBottomWidth)

      el.style.position = 'fixed'
      el.style.top = `${rect.top - insetTop}px`
      el.style.left = `${rect.left - insetLeft}px`
      el.style.width = `${rect.width + grownX}px`
      el.style.height = `${rect.height + grownY}px`
      el.style.margin = '0'
      el.style.transition = 'none'
      el.style.transform = `scale(${LIFT_SCALE})`
      el.style.boxShadow = 'var(--shadow-menu)'

      for (const id of idsRef.current) {
        if (id === start.id) continue
        const node = rows.get(id)
        if (node) node.style.transition = displaceTransition(reduce)
      }
      if (placeholderEl.current) placeholderEl.current.style.transition = displaceTransition(reduce)

      drag.current.frame = requestAnimationFrame(step)
    },
    [rows, step],
  )

  const dropPicked = useCallback(
    (commit: boolean) => {
      const current = picked
      if (!current) return
      const total = idsRef.current.length
      flushSync(() => {
        if (commit && current.to !== current.from) onReorder(current.from, current.to)
        setPicked(null)
      })
      clearStyles()
      setAnnouncement(
        commit
          ? `Dropped ${labelOf(current.id)} at position ${current.to + 1} of ${total}.`
          : `Reorder cancelled. ${labelOf(current.id)} is back at position ${current.from + 1} of ${total}.`,
      )
    },
    [clearStyles, labelOf, onReorder, picked],
  )

  /* Keyboard picks stay in flow: only the transforms preview the new order. */
  useLayoutEffect(() => {
    if (!picked) return
    const reduce = prefersReducedMotion()
    idsRef.current.forEach((id, index) => {
      const node = rows.get(id)
      if (!node) return
      node.style.transition = displaceTransition(reduce)
      const offset =
        index === picked.from
          ? (picked.to - picked.from) * picked.slot
          : picked.from < index && index <= picked.to
            ? -picked.slot
            : picked.to <= index && index < picked.from
              ? picked.slot
              : 0
      translate(node, offset)
    })
  }, [picked, rows])

  const rowRef = useCallback(
    (id: string) => {
      const existing = rowRefs.get(id)
      if (existing) return existing
      const ref = (node: HTMLElement | null) => {
        if (node) rows.set(id, node)
        else rows.delete(id)
      }
      rowRefs.set(id, ref)
      return ref
    },
    [rowRefs, rows],
  )

  const handleProps = useCallback(
    (id: string, index: number) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button !== 0 || picked || drag.current) return
        pending.current = { id, index, startY: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        if (drag.current) {
          drag.current.pointerY = event.clientY
          return
        }
        const start = pending.current
        if (!start) return
        if (Math.abs(event.clientY - start.startY) < ACTIVATION_DISTANCE) return
        startDrag(event.clientY)
      },
      onPointerUp: () => {
        pending.current = null
        finish(true)
      },
      onPointerCancel: () => {
        pending.current = null
        finish(false)
      },
      onLostPointerCapture: () => {
        pending.current = null
        finish(false)
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        const total = idsRef.current.length
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          if (picked) {
            dropPicked(true)
            return
          }
          const el = rows.get(id)
          const neighbour = rows.get(idsRef.current[index + 1] ?? idsRef.current[index - 1])
          if (!el) return
          const rect = el.getBoundingClientRect()
          const slot = neighbour
            ? Math.abs(neighbour.getBoundingClientRect().top - rect.top)
            : rect.height
          setPicked({ id, from: index, to: index, slot })
          setAnnouncement(`Picked up ${labelOf(id)}. Position ${index + 1} of ${total}.`)
          return
        }
        if (!picked) return
        if (event.key === 'Escape') {
          event.preventDefault()
          dropPicked(false)
          return
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          const to = Math.min(
            Math.max(picked.to + (event.key === 'ArrowUp' ? -1 : 1), 0),
            total - 1,
          )
          if (to === picked.to) return
          setPicked({ ...picked, to })
          setAnnouncement(`${labelOf(picked.id)}, position ${to + 1} of ${total}.`)
        }
      },
      onBlur: () => {
        if (picked) dropPicked(false)
      },
    }),
    [dropPicked, finish, labelOf, picked, rows, startDrag],
  )

  /* Escape abandons a pointer drag too. */
  useLayoutEffect(() => {
    if (!lifted) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finish, lifted])

  return {
    listRef: (node: HTMLElement | null) => {
      listEl.current = node
    },
    placeholderRef: (node: HTMLDivElement | null) => {
      placeholderEl.current = node
    },
    rowRef,
    handleProps,
    liftedId: lifted?.id ?? null,
    pickedId: picked?.id ?? null,
    placeholder: lifted?.placeholder ?? null,
    announcement,
  }
}
