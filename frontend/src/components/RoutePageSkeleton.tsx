import { PageSkeleton, type SkeletonVariant } from './PageSkeleton'
import type { ActiveRoute } from './AppNav'

const routeLabels: Record<ActiveRoute, string> = {
  home: 'Home',
  pipeline: 'Pipeline',
  watchlist: 'Watchlist',
  'remote-job-board': 'Job board',
  'job-boards': 'Admin - Job board',
  applications: 'All applications',
}

export function RoutePageSkeleton({
  active,
  variant,
}: {
  active: ActiveRoute
  variant: SkeletonVariant
}) {
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
        <nav className="nav">
          {Object.entries(routeLabels).map(([key, label]) => (
            <span className={active === key ? 'active' : undefined} key={key}>
              <span className="nav-icon" aria-hidden="true">
                <span className="sk-nav-icon" />
              </span>
              {label}
            </span>
          ))}
        </nav>
      </aside>
      <main className="main">
        <PageSkeleton variant={variant} />
      </main>
    </div>
  )
}
