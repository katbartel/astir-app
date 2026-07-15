import { stageProgress } from '@/lib/applications'

// A small ring that fills with the stage's progress along the pipeline:
// hollow with a center dot at the start (Applied), filling clockwise through
// the middle stages, completing into a check at the end (Hired), and dashed
// once Closed. The colored strokes read from --st-dot (set by the surrounding
// data-stage tint), so the ring always matches its stage hue.
const SIZE = 15
const CENTER = SIZE / 2
const RADIUS = 6
const CIRC = 2 * Math.PI * RADIUS

export function StageRing({ status }: { status: string }) {
  const { fraction, state } = stageProgress(status)

  if (state === 'closed') {
    return (
      <svg className="stage-ring" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--st-dot, currentColor)"
          strokeWidth={2}
          strokeDasharray="1.8 2.6"
          opacity={0.7}
        />
      </svg>
    )
  }

  return (
    <svg className="stage-ring" viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
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
      {state === 'done' ? (
        <path
          d="M4.7 7.7l1.8 1.8 3.6-3.9"
          fill="none"
          stroke="var(--st-dot, currentColor)"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {state === 'start' ? <circle cx={CENTER} cy={CENTER} r={1.5} fill="var(--st-dot, currentColor)" /> : null}
    </svg>
  )
}
