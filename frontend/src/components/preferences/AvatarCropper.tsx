'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MinusIcon, PlusIcon } from '../icons'

const VIEWPORT = 280 // must match --crop-viewport in tokens.css
const OUTPUT_EDGE = 128
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25 // how far the − / + buttons nudge the zoom

type Offset = { x: number; y: number }

type AvatarCropperProps = {
  imageUrl: string
  onCancel: () => void
  onError: () => void
  onConfirm: (dataUrl: string) => void
}

// Lets the user pick which part of the uploaded photo the round avatar
// shows: drag to move the focus point, zoom to tighten the circle. The
// image is panned/zoomed via CSS transform; on confirm the same region is
// redrawn onto a small canvas.
export function AvatarCropper({ imageUrl, onCancel, onError, onConfirm }: AvatarCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: Offset } | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })

  // Smallest scale that still covers the whole viewport ("cover" fit).
  const coverScale = natural ? VIEWPORT / Math.min(natural.w, natural.h) : 1
  const scale = coverScale * zoom

  const clampOffset = useCallback(
    (candidate: Offset, atScale: number): Offset => {
      if (!natural) {
        return candidate
      }
      return {
        x: Math.min(0, Math.max(VIEWPORT - natural.w * atScale, candidate.x)),
        y: Math.min(0, Math.max(VIEWPORT - natural.h * atScale, candidate.y)),
      }
    },
    [natural],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  function onImageLoad() {
    const img = imgRef.current
    if (!img || !img.naturalWidth) {
      onError()
      return
    }
    const size = { w: img.naturalWidth, h: img.naturalHeight }
    const initialScale = VIEWPORT / Math.min(size.w, size.h)
    setNatural(size)
    setZoom(1)
    setOffset({
      x: (VIEWPORT - size.w * initialScale) / 2,
      y: (VIEWPORT - size.h * initialScale) / 2,
    })
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!natural) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    setOffset(
      clampOffset(
        {
          x: drag.origin.x + (event.clientX - drag.startX),
          y: drag.origin.y + (event.clientY - drag.startY),
        },
        scale,
      ),
    )
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  // Zoom around the viewport center so the framed subject stays put.
  function onZoomChange(nextZoom: number) {
    const nextScale = coverScale * nextZoom
    const ratio = nextScale / scale
    const center = VIEWPORT / 2
    setZoom(nextZoom)
    setOffset(
      clampOffset(
        {
          x: center - (center - offset.x) * ratio,
          y: center - (center - offset.y) * ratio,
        },
        nextScale,
      ),
    )
  }

  // Step the zoom via the − / + buttons, staying within the slider bounds.
  function nudgeZoom(delta: number) {
    if (!natural) {
      return
    }
    onZoomChange(Math.min(MAX_ZOOM, Math.max(1, Number((zoom + delta).toFixed(2)))))
  }

  function confirm() {
    const img = imgRef.current
    if (!img || !natural) {
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_EDGE
    canvas.height = OUTPUT_EDGE
    const context = canvas.getContext('2d')
    if (!context) {
      onError()
      return
    }
    context.drawImage(
      img,
      -offset.x / scale,
      -offset.y / scale,
      VIEWPORT / scale,
      VIEWPORT / scale,
      0,
      0,
      OUTPUT_EDGE,
      OUTPUT_EDGE,
    )
    onConfirm(canvas.toDataURL('image/jpeg', 0.85))
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel()
        }
      }}
    >
      <div className="modal avatar-cropper" role="dialog" aria-modal="true" aria-label="Edit photo">
        <div className="modal-head">
          <h2>Edit</h2>
        </div>
        <div
          className="crop-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={onImageLoad}
            onError={onError}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          />
          <div className="crop-mask" aria-hidden="true" />
        </div>
        <div className="crop-zoom">
          <button
            className="crop-zoom-step"
            type="button"
            aria-label="Zoom out"
            disabled={!natural || zoom <= 1}
            onClick={() => nudgeZoom(-ZOOM_STEP)}
          >
            <MinusIcon />
          </button>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!natural}
            onChange={(event) => onZoomChange(Number(event.target.value))}
          />
          <button
            className="crop-zoom-step"
            type="button"
            aria-label="Zoom in"
            disabled={!natural || zoom >= MAX_ZOOM}
            onClick={() => nudgeZoom(ZOOM_STEP)}
          >
            <PlusIcon />
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn solid" type="button" disabled={!natural} onClick={confirm}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
