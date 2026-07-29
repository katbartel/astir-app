'use client'

import { useEffect } from 'react'

// Global tooltip layer, ported 1:1 from the prototype (setupTooltips and
// friends in prototype/app.js). Elements opt in with data-tooltip (labels,
// no arrow) or data-info-tooltip (longer copy, with arrow); the bubble is
// positioned below the anchor, flipping above when it would overflow.
export function Tooltips() {
  useEffect(() => {
    let activeTooltipTarget: HTMLElement | null = null

    const tooltipLayer = document.createElement('div')
    tooltipLayer.className = 'tooltip-layer'
    tooltipLayer.hidden = true
    tooltipLayer.innerHTML =
      '<span class="tooltip-arrow" aria-hidden="true"></span><span class="tooltip-bubble"></span>'
    document.body.appendChild(tooltipLayer)
    const tooltipArrow = tooltipLayer.querySelector('.tooltip-arrow') as HTMLElement
    const tooltipBubble = tooltipLayer.querySelector('.tooltip-bubble') as HTMLElement

    function tooltipCopy(target: HTMLElement | null) {
      return target ? target.dataset.infoTooltip || target.dataset.tooltip || '' : ''
    }

    function tooltipCandidate(target: EventTarget | null) {
      return target instanceof Element
        ? (target.closest('[data-info-tooltip], [data-tooltip]') as HTMLElement | null)
        : null
    }

    function tooltipNumber(token: string, fallback: number) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(token)
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }

    function tooltipMinLeft() {
      const rail = document.querySelector('.rail')
      const narrow = window.matchMedia('(max-width: 760px)').matches
      const inset = tooltipNumber('--space-2', 8)
      if (!rail || narrow) return inset
      return rail.getBoundingClientRect().right + inset
    }

    function positionTooltip() {
      if (!activeTooltipTarget || tooltipLayer.hidden) return
      const targetRect = activeTooltipTarget.getBoundingClientRect()
      const inset = tooltipNumber('--space-2', 8)
      const shift = tooltipNumber('--tooltip-shift', 3)
      const minLeft = tooltipMinLeft()
      const maxAvailableWidth = Math.max(160, window.innerWidth - minLeft - inset)
      const maxLineWidth = tooltipNumber('--type-tooltip', 12) * 25
      const noArrowInset = tooltipLayer.classList.contains('no-arrow')
        ? tooltipNumber('--space-1', 4)
        : 0
      tooltipBubble.style.maxWidth = `${Math.min(maxLineWidth, maxAvailableWidth)}px`

      // A block bubble keeps its full max-width even after the text wraps, so a
      // short final line leaves a ragged gap on the right and the padding reads
      // lopsided. Measure the widest wrapped line and shrink the bubble to hug
      // it, so every side gets the same padding. Reset to auto first so the
      // measurement reflects wrapping at max-width, not a prior narrow width.
      tooltipBubble.style.width = 'auto'
      const textRange = document.createRange()
      textRange.selectNodeContents(tooltipBubble)
      const textWidth = textRange.getBoundingClientRect().width
      const bubbleStyle = getComputedStyle(tooltipBubble)
      const bubblePaddingX =
        Number.parseFloat(bubbleStyle.paddingLeft) + Number.parseFloat(bubbleStyle.paddingRight)
      // +1px guards against sub-pixel rounding re-wrapping the last word.
      tooltipBubble.style.width = `${Math.ceil(textWidth) + bubblePaddingX + 1}px`

      const bubbleRect = tooltipBubble.getBoundingClientRect()
      const anchorCenter = targetRect.left + targetRect.width / 2
      const maxLeft = Math.max(minLeft, window.innerWidth - bubbleRect.width - inset)
      const left = Math.min(Math.max(anchorCenter - bubbleRect.width / 2, minLeft), maxLeft)
      const belowTop = targetRect.bottom + shift + inset - noArrowInset
      const aboveTop = targetRect.top - bubbleRect.height - shift - inset + noArrowInset
      // Anchors can opt into "above" (data-tooltip-above) so a floating control
      // like the note toolbar doesn't drop its tooltip over the text below it.
      // When opted in we always go above (clamped into view); otherwise we only
      // flip up when the bubble would overflow the viewport bottom.
      const preferAbove = activeTooltipTarget.dataset.tooltipAbove !== undefined
      const overflowsBelow = belowTop + bubbleRect.height > window.innerHeight - inset
      const useAbove = preferAbove || (overflowsBelow && aboveTop >= inset)

      tooltipLayer.style.left = `${left}px`
      tooltipLayer.style.top = `${useAbove ? Math.max(aboveTop, inset) : belowTop}px`
      tooltipLayer.classList.toggle('above', useAbove)
      tooltipArrow.style.left = `${anchorCenter - left}px`
    }

    function showTooltip(target: HTMLElement) {
      if (document.body.classList.contains('surface-open')) return
      const copy = tooltipCopy(target)
      if (!copy) return
      activeTooltipTarget = target
      tooltipBubble.textContent = copy
      tooltipLayer.classList.toggle('no-arrow', !target.dataset.infoTooltip)
      tooltipLayer.hidden = false
      positionTooltip()
    }

    function hideTooltip() {
      activeTooltipTarget = null
      tooltipLayer.hidden = true
    }

    function onPointerOver(event: PointerEvent) {
      const target = tooltipCandidate(event.target)
      if (target) showTooltip(target)
    }

    function onPointerOut(event: PointerEvent) {
      if (!activeTooltipTarget || activeTooltipTarget.contains(event.relatedTarget as Node)) return
      hideTooltip()
    }

    function onFocusIn(event: FocusEvent) {
      const target = tooltipCandidate(event.target)
      if (target) showTooltip(target)
    }

    function onFocusOut(event: FocusEvent) {
      if (!activeTooltipTarget || activeTooltipTarget.contains(event.relatedTarget as Node)) return
      hideTooltip()
    }

    // When a surface (menu/modal) opens, showTooltip already refuses to open
    // new tooltips — but one may already be visible from hovering the trigger.
    // Dismiss it as soon as body gains the surface-open class.
    const surfaceObserver = new MutationObserver(() => {
      if (document.body.classList.contains('surface-open')) hideTooltip()
    })
    surfaceObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', positionTooltip)
    window.addEventListener('scroll', positionTooltip, true)

    return () => {
      surfaceObserver.disconnect()
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', positionTooltip)
      window.removeEventListener('scroll', positionTooltip, true)
      tooltipLayer.remove()
    }
  }, [])

  return null
}
