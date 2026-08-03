import { stageProgress } from '@/lib/applications'

// A small generated progress mark. The visual is derived from stage position,
// so renamed or reordered stages keep their data separate from the icon.
const SIZE = 15
const CENTER = SIZE / 2
const RADIUS = 6
const CIRC = 2 * Math.PI * RADIUS
// The closed ring is dotted. The dash period has to divide the circumference
// exactly, otherwise the pattern closes on a part dash and the ring reads as a
// smudge instead of an even circle of marks.
const CLOSED_PERIOD = CIRC / 8

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
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--st-dot, currentColor)"
          strokeDasharray={`${CLOSED_PERIOD / 2} ${CLOSED_PERIOD / 2}`}
          strokeWidth={1.8}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
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
