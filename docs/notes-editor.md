# Notes editor

Source of truth for the rich note field used on application cards. It is one
component, [`frontend/src/components/applications/NoteField.tsx`](../frontend/src/components/applications/NoteField.tsx),
plus its styles in `app.css` (`.note-*`). Notes are stored as JSON in
`applications.note` (Postgres `jsonb`), shaped by `NoteBlock` in
`frontend/src/lib/applications.ts`.

Everything below is load-bearing. Most of these rules exist because the obvious
implementation was tried, shipped, and corrupted real notes. Section 10 records
which failure each rule prevents — read it before "simplifying" anything here.

---

## 1. What the field does

Free text with checkboxes, bullets, inline marks (bold, italic, underline,
strikethrough, links), block quotes, and collapsible sections. Type `[]` for a
checkbox or `- ` at the start of a line for a bullet; select text to reveal a
floating toolbar. Checkbox rows can be dragged to reorder by their grip handle.

The field is an **uncontrolled** `contenteditable`. React seeds it once and never
re-renders it during editing — a re-render would drop the caret. Every edit is
DOM-driven, serialized back to the block model, and handed to `onChange`.

## 2. The block model

```ts
type NoteBlock =
  | { type: 'text'; text: string; bold?; italic?; underline?; strike?; href? }
  | { type: 'check'; checked: boolean; text: string }
  | { type: 'quote'; blocks: NoteBlock[] }
  | { type: 'collapse'; summary: string; open: boolean; blocks: NoteBlock[] }

type Note = { kind: string; text?: string; blocks: NoteBlock[] }
```

A flat list. There is no explicit line object: **line breaks live as `"\n"`
inside `text` blocks**, and `quote` / `collapse` are block-level — they occupy a
line of their own and break the flow on both sides.

## 3. The line model

The flat list is awkward to edit, so all structural editing goes through a line
view. This is the central abstraction; prefer it over DOM poking every time.

- `blocksToLines(blocks): NoteBlock[][]` — splits `text` on `"\n"` and gives each
  block-level block its own line.
- `linesToBlocks(lines): NoteBlock[]` — the inverse.
- `isBlockLevel(line)` — a line that is exactly one `quote` or `collapse`.

### The separator rule

`linesToBlocks` inserts a `"\n"` between two lines **only when neither side is
block-level**. A block-level element already breaks the line on both sides, so a
separator there would render as a phantom blank line.

**Consequence, and a known limitation:** a blank line immediately above or below
a collapse/quote is *not representable*. It can exist in the DOM (and works while
you type in it) but is dropped on the next reload. Fixing this means redefining
the separator as "terminator of the previous line, unless that line was
block-level" symmetrically across `linesToBlocks`, `serializeContainer`, and the
render path — a deliberate core-model change, not a patch.

## 4. Rendering (model → DOM)

`blockHtml` / `blocksHtml` build the markup; `noteHtml` seeds the field once.

- A `check` renders as `<span class="note-check" contenteditable="false">`
  containing a drag grip and the box.
- Text keeps its `"\n"`; the field uses `white-space: pre-wrap`.
- Marks render as real tags (`<strong>`, `<em>`, `<u>`, `<s>`, `<a>`) so the
  browser's own formatting commands interoperate with what we seed.

`reseedListLines(container, lines)` rebuilds a container from a line list and is
how every structural edit applies. Two rules:

1. Each flow line becomes its own `<div>` (empty lines get `<br>` filler, so the
   caret can sit on them).
2. **A block-level line is emitted bare, never wrapped in that `<div>`.**

A `CARET_BLOCK` placed in the lines marks where the caret should land; it renders
as a sentinel span that `reseedListLines` removes after positioning the caret.

## 5. Serialization (DOM → model)

`serializeContainer` walks a container back into blocks, recursing into quote and
collapse bodies. It must tolerate whatever the browser leaves behind (`<div>`
splits, `<br>` fillers, nested spans).

Line-start rule: a `<div>`/`<p>` wrapper contributes a `"\n"` when it **has a
previous sibling** — not when "we have emitted something already". Preceding
lines may all be empty, and those still count as lines. The exception is
`afterBlock`: no `"\n"` when the previous sibling is a collapse/quote, which
already broke the line.

`serialize()` runs `pruneBlankCheckLines` at every depth, so a leftover blank
unchecked checkbox row never persists — it stays in the DOM while you are on it,
but is not saved.

## 6. Editing behaviour

The container for a list edit is `listContainer(field)`: the collapse body
holding the caret, or the field itself. Edits stay scoped to it.

### Enter on a checkbox / bullet row

| caret position | result |
|---|---|
| end of a non-empty row | new row below with the same marker kind, caret after it |
| start of the row's text | new empty row **above**, same marker and same checked state, caret on it; the original row keeps its text and moves down |
| middle of the text | line splits; the text after the caret moves to a new row |
| on an empty marker row | the marker is dropped, leaving a plain empty line with the caret on it |

The line-start case is decided from the line model (`lineTextAfterMarker(prefix)
=== ''`), never from a DOM probe: a caret at a line start is an **element
offset**, not a text-node offset.

### Enter in a collapse title

| caret position | result |
|---|---|
| very beginning (non-empty title) | the whole section moves down; a plain line opens above it |
| middle | title keeps the text before the caret; the rest becomes the section's first body line |
| end, or empty title | a fresh empty first line opens inside the section |

Elsewhere in a collapse body, Enter behaves as above; a second Enter on a
trailing empty line exits the section. Shift+Enter is always a plain soft break —
it never continues a list and never exits.

### Backspace

On an empty checkbox/bullet row, one press drops the marker and leaves a plain
empty line. Otherwise Backspace is native.

### Markers are mutually exclusive

**A line carries at most one marker, and the two shorthands overwrite each
other.**

- `[]` at the start of a line's content becomes a checkbox, replacing a bullet
  already on that line.
- `- ` + space at the start of a line's content becomes a bullet, replacing a
  checkbox already on that line.
- The toolbar's checkbox and bullet buttons follow the same rule.

`setLineMarker` collapses the selection to its start first — the toolbar acts on
a *selection*, while the line model needs a collapsed caret.

## 7. Undo and redo

⌘Z / ⇧⌘Z / ⌘Y are handled by the field, not the browser. The native stack cannot
be used: structural edits rebuild a container's `innerHTML`, which it does not
record, and routing edits through `execCommand` instead is what let `insertHTML`
escape collapse bodies (section 10).

- History entries are `{ html, caret }`. The caret is stored as a **path of child
  indices** from the field down, which resolves again once the same HTML is
  restored.
- Native typing is grouped: same input kind, within `TYPING_RUN_MS` (700 ms),
  breaking at spaces — so ⌘Z walks back by word, not by character.
- Every programmatic edit calls `commitAndSave`, making it one discrete step.
- The seeded state is the first entry, so ⌘Z reaches how the note was opened.

Undo must cover everything: typing, structural edits, checkbox toggles, collapse
open/close, drag reorders, formatting.

## 8. Layout

Inside any one container, **a checkbox row and a plain text line share a left
edge**: the checkbox *box* defines it. The drag grip is absolutely positioned in
the gutter to the left of the box, so its width can never shift the row.

Collapse bodies are indented one step by
`.note-collapse > *:not(.note-collapse-head) { padding-left: var(--space-6) }` —
so content inside a section sits one step right of content outside it. Rows
rendering at an unexpected indent almost always means they drifted out of the
collapse in the data, not a CSS bug.

## 9. Invariants

1. A line carries at most one marker.
2. Structural edits go through `splitCaretLines` → `reseedListLines`, scoped to
   `listContainer`. Not `execCommand`, not raw DOM surgery.
3. Line/marker decisions come from the line model, never from `Selection.modify`
   or a text-node probe.
4. Block-level lines are never wrapped in a line `<div>`.
5. Every edit produces exactly one undo step (typing runs coalesce).
6. React never re-renders the field during editing.

## 10. Why the rules exist

Each of these shipped and damaged stored notes.

- **`execCommand('insertHTML')` escapes a collapse body.** With the caret at the
  end of `.note-collapse-body`, inserted markup lands *outside* it, as a sibling
  inside `.note-collapse` — giving a phantom blank line, an orphaned caret
  sentinel, and native Enter afterwards cloning empty `.note-collapse` divs.
  Hence invariant 2.
- **`Selection.modify` cannot find a leading marker.** The checkbox's own
  `contenteditable="false"` span defeats the probe, so "drop the marker" and
  "replace the other marker" silently did nothing — and inside a collapse could
  leave *both* markers on one line. Hence invariant 3.
- **Wrapping a collapse line in a `<div>` grows blank lines.** It hides the
  collapse from the serializer's `afterBlock` guard, which then emits a phantom
  `"\n"` before the next line — one extra blank line above the block on every
  reseed, compounding into the saved note. Hence invariant 4.
- **"Have we emitted anything yet" merges blank lines away.** Range clones
  routinely start with empty `<div>`s, so the weaker test deleted a note's blank
  lines during a split. Hence the previous-sibling rule in section 5.
- **A caret at a line start is an element offset.** Probing `nodeType ===
  TEXT_NODE` concluded there was no text after the caret, pushing the row's text
  onto its own line and stripping its marker.

## 11. How to test changes

**jsdom is not enough** — no `execCommand`, no `Selection.modify`, and it
diverges on caret behaviour. Bundle the real component with esbuild and drive it
in **real Chrome via playwright-core** (`channel: 'chrome'`, prefer headed;
headless diverges on `insertHTML` caret placement). Seed via `window.SEED_NOTE`,
place the caret with a TreeWalker, and read back:

- **visual rows** — group text/checkbox rects by `top` offset, so phantom blank
  lines and misalignment show up;
- **the saved model** — what `onChange` produced, which is what actually
  persists;
- **a reload** — re-mount from the saved model, since plenty of bugs only appear
  after a round-trip.

Two habits that repeatedly paid off:

- **Read the real note out of the database** instead of guessing from a
  screenshot:
  `docker exec careerapp_july-db-1 psql -U astir -d astir -A -t -c "select jsonb_pretty(note::jsonb) from applications where company='…'"`.
- **For undo, press ⌘Z until the state stops changing** and assert it lands on
  the pre-edit state, then redo the same number of steps. Asserting on a single
  ⌘Z is wrong — one user action is often several steps.

Note that React Fast Refresh preserves `useRef`, so the seed guard keeps the old
DOM after a hot reload. **Hard-reload** before testing editor changes.
