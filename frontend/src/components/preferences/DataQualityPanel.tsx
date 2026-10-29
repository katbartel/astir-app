'use client'

import { useEffect, useState } from 'react'
import { useUser } from '../UserProvider'

type QualityOverview = {
  current: {
    measuredAt: string
    canonicalListings: number
    sourceObservations: number
    listingsSeenWithin24Hours: number
    listingsWithPostedAt: number
    medianListingAgeHours: number | null
    crossProviderCollisions: number
    crossProviderExtraObservations: number
    listingsWithLocation: number
    listingsWithWorkMode: number
    listingsWithDescription: number
    listingsWithContentLanguage: number
  } | null
  trend: Array<{
    observedOn: string
    canonicalListings: number
    listingsSeenWithin24Hours: number
    listingsWithPostedAt: number
    medianListingAgeHours: number | null
    crossProviderCollisions: number
    sourceObservations: number
  }>
  sources: Array<{
    provider: string
    attempts: number
    successfulRuns: number
    lastCheckedAt: string
    sourceCount: number
    failedSources: number
    normalizedListingsSeen: number
    listingsCreated: number
    staleObservationsSuppressed: number
    latestError: string | null
  }>
}

function percentage(numerator: number, denominator: number): string {
  return denominator ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'Not enough data'
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function number(value: number): string {
  return new Intl.NumberFormat().format(value)
}

export function DataQualityPanel() {
  const user = useUser()
  const [data, setData] = useState<QualityOverview | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!user.isAdmin) return
    let cancelled = false
    fetch('/api/job-boards/quality')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed: ${response.status}`)
        return (await response.json()) as QualityOverview
      })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [user.isAdmin])

  if (!user.isAdmin) {
    return (
      <section className="screen">
        <div className="page-head"><h1>Data quality</h1></div>
        <div className="prefs-card"><p className="watch-invite">You don’t have access to this page.</p></div>
      </section>
    )
  }

  const current = data?.current
  return (
    <section className="screen" data-screen="data-quality">
      <div className="page-head"><h1>Data quality</h1></div>
      <p className="prefs-hint">
        Internal ingestion measurements. Daily history begins after this release is deployed.
      </p>
      {failed ? <div className="prefs-card"><p className="watch-invite">Could not load data quality. Try again.</p></div> : null}
      {!failed && !data ? <div className="prefs-card"><p className="watch-invite">Gathering the first measurement…</p></div> : null}
      {current ? (
        <>
          <div className="quality-grid" aria-label="Current data quality">
            <article className="quality-card">
              <p className="quality-label">Median listing age</p>
              <p className="quality-value">
                {current.medianListingAgeHours === null ? 'Not enough data' : `${(current.medianListingAgeHours / 24).toFixed(1)} days`}
              </p>
              <p className="quality-note">Source posting date, where available</p>
            </article>
            <article className="quality-card">
              <p className="quality-label">Seen within 24 hours</p>
              <p className="quality-value">{percentage(current.listingsSeenWithin24Hours, current.canonicalListings)}</p>
              <p className="quality-note">{number(current.listingsSeenWithin24Hours)} of {number(current.canonicalListings)} canonical listings</p>
            </article>
            <article className="quality-card">
              <p className="quality-label">Cross-provider collisions</p>
              <p className="quality-value">{percentage(current.crossProviderCollisions, current.canonicalListings)}</p>
              <p className="quality-note">{number(current.crossProviderExtraObservations)} extra observations consolidated</p>
            </article>
            <article className="quality-card">
              <p className="quality-label">Description coverage</p>
              <p className="quality-value">{percentage(current.listingsWithDescription, current.canonicalListings)}</p>
              <p className="quality-note">Location {percentage(current.listingsWithLocation, current.canonicalListings)}, work mode {percentage(current.listingsWithWorkMode, current.canonicalListings)}</p>
            </article>
          </div>

          <div className="prefs-card quality-section">
            <h2 className="prefs-section-title">Daily trend</h2>
            <p className="prefs-hint">One measurement per day, retained for the first 14 days here.</p>
            {data.trend.length < 2 ? (
              <p className="watch-invite">Trend data will appear after the next daily measurement.</p>
            ) : (
              <div className="quality-table-wrap">
                <table className="quality-table">
                  <thead><tr><th>Date</th><th>Fresh within 24h</th><th>Median age</th><th>Cross-provider collisions</th></tr></thead>
                  <tbody>{data.trend.map((point) => (
                    <tr key={point.observedOn}>
                      <td>{dateLabel(point.observedOn)}</td>
                      <td>{percentage(point.listingsSeenWithin24Hours, point.canonicalListings)}</td>
                      <td>{point.medianListingAgeHours === null ? 'Not enough data' : `${(point.medianListingAgeHours / 24).toFixed(1)} days`}</td>
                      <td>{percentage(point.crossProviderCollisions, point.canonicalListings)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className="prefs-card quality-section">
            <h2 className="prefs-section-title">Source reliability, last 14 days</h2>
            <p className="prefs-hint">A successful run fetched and normalized a provider response. Stale removals are observations absent from a successful later poll, and are suppressed from the board.</p>
            <div className="quality-table-wrap">
              <table className="quality-table">
                <thead><tr><th>Source</th><th>Last checked</th><th>Successful checks</th><th>Need attention</th><th>Normalized</th><th>New</th><th>Stale removals</th></tr></thead>
                <tbody>{data.sources.map((source) => (
                  <tr key={source.provider} title={source.failedSources ? source.latestError ?? undefined : undefined}>
                    <td>{source.provider}</td>
                    <td>{dateTimeLabel(source.lastCheckedAt)}</td>
                    <td>{percentage(source.successfulRuns, source.attempts)}</td>
                    <td>{source.failedSources ? `${source.failedSources} of ${source.sourceCount}` : 'None'}</td>
                    <td>{number(source.normalizedListingsSeen)}</td>
                    <td>{number(source.listingsCreated)}</td>
                    <td>{number(source.staleObservationsSuppressed)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <p className="quality-measured">Last measured {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.measuredAt))}.</p>
        </>
      ) : null}
    </section>
  )
}
