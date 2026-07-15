// SVG icons mirrored 1:1 from the prototype's `icon` map (prototype/app.js).
// Sizing, stroke, and fill come from the global stylesheet (e.g. `.round-icon svg`).

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18H9m9-2V11a6 6 0 0 0-12 0v5l-2 2h16z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function BellOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18H9m9-2V11a6 6 0 0 0-9.8-4.6M6 8.8c-.1.7-.2 1.4-.2 2.2v5l-2 2h14.4" />
      <path d="M10 20a2 2 0 0 0 4 0" />
      <path d="M4 4l16 16" />
    </svg>
  )
}

export function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 9.5l5 5 5-5" />
    </svg>
  )
}

export function KebabIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="6.8" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="17.2" r="1.7" />
    </svg>
  )
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  )
}

export function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5h4v4" />
      <path d="M19 5l-9 9" />
      <path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  )
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 12.5l4.2 4.2 8.8-9.4" />
    </svg>
  )
}

export function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  )
}

export function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" />
    </svg>
  )
}

// Primary-rail navigation glyphs. Kept minimal and thin-stroked; sizing and
// stroke width come from `.nav a svg` in the global stylesheet.

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5l8-6 8 6" />
      <path d="M6 9.5V19h12V9.5" />
    </svg>
  )
}

export function PipelineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h9" />
      <path d="M5 12h14" />
      <path d="M5 18h6" />
      <circle cx="17.5" cy="6" r="1.6" />
      <circle cx="8.5" cy="18" r="1.6" />
    </svg>
  )
}

export function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.5h12v15l-6-4-6 4z" />
    </svg>
  )
}

export function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5h16v10H4z" />
      <path d="M9 8.5V6.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M4 12.5h16" />
    </svg>
  )
}

export function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4c2.5 2.2 3.8 5 3.8 8s-1.3 5.8-3.8 8c-2.5-2.2-3.8-5-3.8-8s1.3-5.8 3.8-8z" />
    </svg>
  )
}

export function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </svg>
  )
}

export function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}
