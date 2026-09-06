'use client'

import { useRef, useState } from 'react'
import { KebabIcon } from '../icons'
import { MenuScrim, useMenuModality } from './menuModality'

// Kebab button with a popover menu. While open the menu is modal: the
// interaction scrim covers the rest of the app so no other element can be
// hovered or clicked, and tooltips are suppressed. The user exits by clicking
// away (the scrim) or pressing Escape; only then does the app become live
// again. See menuModality for the shared behavior.
export function KebabMenu({
  menuClassName = '',
  children,
}: {
  menuClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useMenuModality(open, ref, setOpen)

  return (
    <span className={`menu-wrap ${open ? 'open' : ''}`.trim()} ref={ref}>
      <button
        className="round-icon kebab"
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tooltip="More"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        <KebabIcon />
      </button>
      <span
        className={`watch-menu ${menuClassName}`.trim()}
        role="menu"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(false)
        }}
      >
        {children}
      </span>
      {open ? <MenuScrim onClose={() => setOpen(false)} /> : null}
    </span>
  )
}
