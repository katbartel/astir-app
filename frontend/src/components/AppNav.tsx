'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useUser } from './UserProvider'
import {
  BookmarkIcon,
  BriefcaseIcon,
  GlobeIcon,
  HomeIcon,
  PipelineIcon,
} from './icons'

export type ActiveRoute =
  | 'home'
  | 'watchlist'
  | 'job-boards'
  | 'remote-job-board'
  | 'pipeline'
  | 'applications'

type NavItem = {
  key: ActiveRoute
  href: string
  label: string
  Icon: () => ReactNode
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { key: 'home', href: '/', label: 'Home', Icon: HomeIcon },
  { key: 'pipeline', href: '/pipeline', label: 'Pipeline', Icon: PipelineIcon },
  { key: 'watchlist', href: '/watchlist', label: 'Watchlist', Icon: BookmarkIcon },
  { key: 'remote-job-board', href: '/remote-job-board', label: 'Job board', Icon: GlobeIcon },
  // Admin-only: the Job board is curated tooling, hidden from non-admin users.
  { key: 'job-boards', href: '/job-boards', label: 'Admin - Job board', Icon: BriefcaseIcon, adminOnly: true },
]

export function AppNav({ active }: { active: ActiveRoute }) {
  const user = useUser()
  const items = navItems.filter((item) => !item.adminOnly || user.isAdmin)

  return (
    <nav className="nav">
      {items.map((item) => (
        <Link
          key={item.key}
          className={active === item.key ? 'active' : undefined}
          href={item.href}
        >
          <span className="nav-icon" aria-hidden="true">
            <item.Icon />
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
