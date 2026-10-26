'use client'

import { useEffect, useState } from 'react'

type CompanyLogoProps = {
  companyName: string
}

function initialsFor(companyName: string): string {
  const words = companyName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

// Company mark recipe: a 64px square with the shared small radius and line.
// Logo.dev provides the company mark. A deterministic initial mark preserves
// the row geometry when a company cannot be resolved or the image fails.
export function CompanyLogo({ companyName }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false)
  const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN
  const source = token
    ? `https://img.logo.dev/name/${encodeURIComponent(companyName)}?token=${encodeURIComponent(token)}&size=128&format=png&fallback=404`
    : null

  // A hot update can correct the source while this row remains mounted. Retry
  // then, while preserving the fallback after a genuine error for this source.
  useEffect(() => {
    setFailed(false)
  }, [source])

  if (!source || failed) {
    return (
      <span className="company-logo company-logo-fallback" aria-hidden="true">
        {initialsFor(companyName)}
      </span>
    )
  }

  return (
    <span className="company-logo" aria-hidden="true">
      <img src={source} alt="" onError={() => setFailed(true)} />
    </span>
  )
}
