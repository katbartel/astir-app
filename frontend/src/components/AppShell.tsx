import type { ReactNode } from 'react'
import { AppNav, type ActiveRoute } from './AppNav'
import { RailUser } from './RailUser'

type AppShellProps = {
  active: ActiveRoute
  children: ReactNode
}

export function AppShell({ active, children }: AppShellProps) {
  return (
    <div className="app">
      <aside className="rail" aria-label="Primary">
        <div className="brand">
          <span className="mini" aria-hidden="true">
            <span className="halo" />
            <span className="core" />
          </span>
          <span className="name">Astir</span>
        </div>
        <AppNav active={active} />
        <RailUser />
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
