'use client'

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STATUS_OPTIONS, type Status, normalizeStatus, stageColorKey } from '@/lib/applications'
import { CheckIcon, ChevronDownIcon } from '../icons'
import { StageRing } from './StageRing'

function tokenPixels(name: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name)
  return Number(value.replace('px', '')) || 0
}

// Position the open menu so the selected option sits over the trigger, then
// nudge it back inside the viewport. Ported from clampSelectMenu in
// prototype/app.js (the .select-menu.open rule is position: fixed).
function clampSelectMenu(menu: HTMLElement, trigger: HTMLElement) {
  const selected = menu.querySelector<HTMLElement>('.select-option.selected')
  if (!selected) return

  menu.style.position = 'fixed'
  menu.style.left = ''
  menu.style.top = ''
  menu.style.maxHeight = ''
  menu.style.minWidth = ''
  menu.scrollTop = 0

  const inset = tokenPixels('--space-2')
  const triggerRect = trigger.getBoundingClientRect()
  const selectedOffset = selected.offsetTop
  const availableHeight = window.innerHeight - inset * 2
  let nextTop = triggerRect.top - selectedOffset - inset
  let nextLeft = triggerRect.left

  menu.style.left = `${nextLeft}px`
  menu.style.minWidth = `${triggerRect.width}px`
  menu.style.top = `${nextTop}px`

  let rect = menu.getBoundingClientRect()
  if (rect.right > window.innerWidth - inset) {
    nextLeft -= rect.right - (window.innerWidth - inset)
    menu.style.left = `${Math.max(inset, nextLeft)}px`
    rect = menu.getBoundingClientRect()
  }
  if (rect.height > availableHeight) {
    menu.style.maxHeight = `${availableHeight}px`
    menu.style.top = `${inset}px`
    selected.scrollIntoView({ block: 'nearest' })
    return
  }
  if (rect.top < inset) {
    nextTop += inset - rect.top
  }
  rect = menu.getBoundingClientRect()
  if (rect.bottom > window.innerHeight - inset) {
    nextTop -= rect.bottom - (window.innerHeight - inset)
  }
  menu.style.top = `${nextTop}px`
}

export function StageSelect({
  value,
  onChange,
  className = '',
}: {
  value: Status
  onChange: (status: Status) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = normalizeStatus(value)
  const selectedIndex = Math.max(0, STATUS_OPTIONS.indexOf(selected))

  useLayoutEffect(() => {
    if (open && menuRef.current && triggerRef.current) {
      clampSelectMenu(menuRef.current, triggerRef.current)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocClick(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function reposition() {
      if (menuRef.current && triggerRef.current) clampSelectMenu(menuRef.current, triggerRef.current)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  return (
    <div className={`select-shell ${className}`.trim()} ref={shellRef}>
      <button
        className={`select-trigger ${open ? 'open' : ''}`.trim()}
        type="button"
        ref={triggerRef}
        data-stage={stageColorKey(selected)}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        <span className="stage-value">
          <StageRing status={selected} />
          {selected}
        </span>
        <span className="select-chev" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>
      <div
        className={`select-menu ${open ? 'open' : ''}`.trim()}
        role="listbox"
        ref={menuRef}
        style={{ ['--selected-index' as string]: selectedIndex }}
      >
        {STATUS_OPTIONS.map((option) => (
          <Fragment key={option}>
            {option === '1st stage' || option === 'Closed' ? (
              <div className="select-separator" aria-hidden="true" />
            ) : null}
            <button
              className={`select-option ${option === selected ? 'selected' : ''}`.trim()}
              type="button"
              role="option"
              data-stage={stageColorKey(option)}
              aria-selected={option === selected}
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                if (option !== selected) onChange(option)
              }}
            >
              <span className="stage-value">
                <StageRing status={option} />
                {option}
              </span>
              <span className="select-check" aria-hidden="true">
                {option === selected ? <CheckIcon /> : null}
              </span>
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
