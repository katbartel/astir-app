import { stageProgress } from '@/lib/applications'

// A small generated progress mark. The visual is derived from stage position,
// so renamed or reordered stages keep their data separate from the icon.
const SIZE = 15
const CENTER = SIZE / 2
const RADIUS = 6
const CIRC = 2 * Math.PI * RADIUS

export function StageRing({
  status,
  fraction: givenFraction,
  state: givenState,
}: {
  status: string
  fraction?: number
  state?: 'start' | 'progress' | 'offer' | 'done' | 'closed'
}) {
  const fallback = stageProgress(status)
  const fraction = givenFraction ?? fallback.fraction
  const state = givenState ?? fallback.state

  if (state === 'closed') {
    return (
      <svg className="stage-ring" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <circle cx={CENTER - 3.8} cy={CENTER - 2.8} r={1} fill="var(--st-dot, currentColor)" opacity={0.75} />
        <circle cx={CENTER + 1.2} cy={CENTER - 4.3} r={0.9} fill="var(--st-dot, currentColor)" opacity={0.55} />
        <circle cx={CENTER + 4.1} cy={CENTER + 0.3} r={1.1} fill="var(--st-dot, currentColor)" opacity={0.7} />
        <circle cx={CENTER - 1.4} cy={CENTER + 3.5} r={0.8} fill="var(--st-dot, currentColor)" opacity={0.5} />
      </svg>
    )
  }

  return (
    <svg className="stage-ring" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
      {state === 'done' ? (
        <>
          <circle cx={CENTER} cy={CENTER} r={RADIUS + 1} fill="var(--st-dot, currentColor)" />
          <path
            d="M4.7 7.7l1.8 1.8 3.6-3.9"
            fill="none"
            stroke="var(--card)"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {state !== 'done' ? (
        <>
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--line2)" strokeWidth={2} />
      {fraction > 0 ? (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--st-dot, currentColor)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - fraction)}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      ) : null}
      {state === 'start' ? <circle cx={CENTER} cy={CENTER} r={1.5} fill="var(--st-dot, currentColor)" /> : null}
        </>
      ) : null}
    </svg>
  )
}
