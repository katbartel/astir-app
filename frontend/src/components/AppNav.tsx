'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
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

type WatchlistRole = {
  firstSeenAt: string
}

type WatchlistCompany = {
  roles: WatchlistRole[]
}

type RemoteJobBoardListing = {
  firstSeenAt: string
}

type FreshNavKey = 'watchlist' | 'remote-job-board'

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000
const freshNavKeys: FreshNavKey[] = ['watchlist', 'remote-job-board']
const freshNavStorageKeys: Record<FreshNavKey, string> = {
  watchlist: 'astir.v1.nav.watchlistLastViewedAt',
  'remote-job-board': 'astir.v1.nav.jobBoardLastViewedAt',
}

function hasUnseenFreshItem(items: { firstSeenAt: string }[], lastViewedAt: number): boolean {
  const now = Date.now()
  return items.some((item) => {
    const firstSeenAt = new Date(item.firstSeenAt).getTime()
    return (
      !Number.isNaN(firstSeenAt) &&
      now - firstSeenAt < NEW_WINDOW_MS &&
      firstSeenAt > lastViewedAt
    )
  })
}

function isFreshNavKey(key: ActiveRoute): key is FreshNavKey {
  return freshNavKeys.includes(key as FreshNavKey)
}

function lastViewedAt(key: FreshNavKey): number {
  try {
    const stored = window.localStorage.getItem(freshNavStorageKeys[key])
    if (!stored) return 0
    const parsed = Number(stored)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

function markNavItemViewed(key: FreshNavKey): void {
  try {
    window.localStorage.setItem(freshNavStorageKeys[key], String(Date.now()))
  } catch {
    // localStorage unavailable; the dot can still clear for this session.
  }
}

const navItems: NavItem[] = [
  { key: 'home', href: '/', label: 'Home', Icon: HomeIcon },
  { key: 'pipeline', href: '/pipeline', label: 'Pipeline', Icon: PipelineIcon },
  { key: 'watchlist', href: '/watchlist', label: 'Watchlist', Icon: BookmarkIcon },
  { key: 'remote-job-board', href: '/remote-job-board', label: 'Job board', Icon: GlobeIcon },
  // Admin-only: the Job board is curated tooling, hidden from non-admin users.
  { key: 'job-boards', href: '/job-boards', label: 'Admin, job board', Icon: BriefcaseIcon, adminOnly: true },
]

export function AppNav({ active }: { active: ActiveRoute }) {
  const user = useUser()
  const items = navItems.filter((item) => !item.adminOnly || user.isAdmin)
  const [freshNavItems, setFreshNavItems] = useState<Record<FreshNavKey, boolean>>({
    watchlist: false,
    'remote-job-board': false,
  })

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch('/api/watchlist/companies')
        .then((response) => {
          if (!response.ok) return null
          return response.json() as Promise<WatchlistCompany[]>
        })
        .catch(() => null),
      fetch('/api/remote-job-board/listings')
        .then((response) => {
          if (!response.ok) return null
          return response.json() as Promise<RemoteJobBoardListing[]>
        })
        .catch(() => null),
    ]).then(([companies, listings]) => {
      if (cancelled) return
      setFreshNavItems({
        watchlist: companies
          ? hasUnseenFreshItem(
              companies.flatMap((company) => company.roles),
              lastViewedAt('watchlist'),
            )
          : false,
        'remote-job-board': listings
          ? hasUnseenFreshItem(listings, lastViewedAt('remote-job-board'))
          : false,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isFreshNavKey(active)) return
    markNavItemViewed(active)
    setFreshNavItems((current) => ({ ...current, [active]: false }))
  }, [active])

  function markSeen(key: ActiveRoute): void {
    if (!isFreshNavKey(key)) return
    markNavItemViewed(key)
    setFreshNavItems((current) => ({ ...current, [key]: false }))
  }

  return (
    <nav className="nav">
      {items.map((item) => (
        <Link
          key={item.key}
          className={active === item.key ? 'active' : undefined}
          href={item.href}
          onClick={() => markSeen(item.key)}
        >
          <span className="nav-icon" aria-hidden="true">
            <item.Icon />
          </span>
          <span className="nav-label">{item.label}</span>
          {isFreshNavKey(item.key) && freshNavItems[item.key] ? (
            <span className="nav-new-dot" aria-label="New openings" />
          ) : null}
        </Link>
      ))}
    </nav>
  )
}
