export type SkeletonVariant =
  | 'home'
  | 'watchlist'
  | 'pipeline'
  | 'applications'
  | 'board'
  | 'preferences'

function Bar({ width = 'medium' }: { width?: 'short' | 'medium' | 'long' | 'full' }) {
  return <span className={`sk-bar ${width}`} />
}

function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="sk-head">
      <Bar width="medium" />
      {actions > 0 ? (
        <div className="sk-actions">
          {Array.from({ length: actions }, (_, index) => (
            <span className="sk-button" key={index} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <section className="screen skeleton-screen" aria-label="Loading page" aria-busy="true">
      <div className="today-head sk-title">
        <Bar width="long" />
      </div>
      <div className="sk-card sk-home-card">
        <Bar width="short" />
        <Bar width="long" />
        <Bar width="medium" />
        <span className="sk-button" />
      </div>
      <div className="sk-card sk-home-card">
        <Bar width="short" />
        <Bar width="long" />
        <Bar width="medium" />
        <span className="sk-button" />
      </div>
      <div className="sk-card">
        <div className="sk-card-top">
          <Bar width="medium" />
          <span className="sk-icon" />
        </div>
        <Bar width="long" />
        <div className="sk-goal-grid">
          {Array.from({ length: 5 }, (_, index) => (
            <span className="sk-goal" key={index}>
              <span className="sk-arc" />
              <Bar width="short" />
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function CardListSkeleton({ groups = 3, rows = 2 }: { groups?: number; rows?: number }) {
  return (
    <div className="watch-card-list">
      {Array.from({ length: groups }, (_, groupIndex) => (
        <div className="sk-card sk-list-card" key={groupIndex}>
          <div className="sk-card-top">
            <Bar width="medium" />
            <span className="sk-icon" />
            <span className="sk-icon" />
          </div>
          {Array.from({ length: rows }, (_, rowIndex) => (
            <div className="sk-row" key={rowIndex}>
              <div className="sk-row-main">
                <Bar width="long" />
                <Bar width="medium" />
              </div>
              <span className="sk-icon" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function WatchlistSkeleton() {
  return (
    <section className="screen skeleton-screen" aria-label="Loading page" aria-busy="true">
      <HeaderSkeleton />
      <CardListSkeleton />
    </section>
  )
}

function BoardSkeleton() {
  return (
    <section className="screen skeleton-screen" aria-label="Loading page" aria-busy="true">
      <HeaderSkeleton actions={0} />
      <CardListSkeleton groups={1} rows={7} />
    </section>
  )
}

function PipelineSkeleton() {
  return (
    <section className="screen skeleton-screen" aria-label="Loading page" aria-busy="true">
      <HeaderSkeleton actions={2} />
      <div className="pipeline-list">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="sk-card sk-pipeline-row" key={index}>
            <div className="sk-row-main">
              <Bar width="medium" />
              <Bar width="long" />
            </div>
            <span className="sk-pill" />
          </div>
        ))}
      </div>
    </section>
  )
}

function ApplicationsSkeleton() {
  return (
    <section className="screen applications-screen skeleton-screen" aria-label="Loading page" aria-busy="true">
      <Bar width="short" />
      <div className="applications-head">
        <HeaderSkeleton />
        <div className="sk-toolbar">
          <Bar width="medium" />
          <div className="sk-actions">
            <span className="sk-icon" />
            <span className="sk-button" />
            <span className="sk-icon" />
          </div>
        </div>
      </div>
      <div className="sk-table">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="sk-table-row" key={index}>
            <Bar width="medium" />
            <Bar width="long" />
            <Bar width="short" />
            <Bar width="medium" />
          </div>
        ))}
      </div>
    </section>
  )
}

function PreferencesSkeleton() {
  return (
    <section className="screen skeleton-screen" aria-label="Loading page" aria-busy="true">
      <HeaderSkeleton actions={0} />
      <div className="sk-card sk-prefs-card">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="sk-pref-row" key={index}>
            <Bar width="short" />
            <Bar width="full" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function PageSkeleton({ variant }: { variant: SkeletonVariant }) {
  if (variant === 'home') return <HomeSkeleton />
  if (variant === 'watchlist') return <WatchlistSkeleton />
  if (variant === 'pipeline') return <PipelineSkeleton />
  if (variant === 'applications') return <ApplicationsSkeleton />
  if (variant === 'board') return <BoardSkeleton />
  return <PreferencesSkeleton />
}
