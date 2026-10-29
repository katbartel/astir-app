'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from './UserProvider'

const navItems = [
  { href: '/preferences', label: 'General' },
  { href: '/preferences/watchlist', label: 'Job preferences' },
  { href: '/preferences/stages', label: 'Stages' },
  { href: '/preferences/billing', label: 'Billing' },
]

// Admin-only entries, appended when the signed-in user is an admin.
const adminNavItems = [
  { href: '/preferences/admin', label: 'Admin Panel' },
  { href: '/preferences/data-quality', label: 'Data quality' },
  { href: '/job-boards', label: 'Job board' },
]

export function PreferencesRail() {
  const pathname = usePathname()
  const user = useUser()
  const items = user.isAdmin ? [...navItems, ...adminNavItems] : navItems

  return (
    <aside className="rail" aria-label="Settings">
      <Link className="back-to-app" href="/">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 7l-5 5 5 5" />
        </svg>
        Back
      </Link>
      <nav className="nav">
        {items.map((item) => (
          <Link
            key={item.href}
            className={pathname === item.href ? 'active' : undefined}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
