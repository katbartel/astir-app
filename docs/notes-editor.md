# Notes editor

Source of truth for the rich note field. There is exactly one notes editor in
this repo and exactly one spec for it: this file.

It is one component,
[`frontend/src/components/applications/NoteField.tsx`](../frontend/src/components/applications/NoteField.tsx),
built on Tiptap (ProseMirror). The component takes a value and an `onChange` and
knows nothing about storage. Two callers supply two adapters:

| Caller | Persists to |
|---|---|
| Pipeline card expansion ([`PipelineView.tsx`](../frontend/src/components/PipelineView.tsx)) | `applications.note`, Postgres `jsonb`, through `/api/applications` |
| Home weekly-goals task detail ([`HomeView.tsx`](../frontend/src/components/HomeView.tsx)) | `localStorage`, key `astir.v1`, on the task record |

This file absorbed `docs/astir-notes-block-model.md` (the block model rebuild
brief, now deleted) and the session notes that used to live outside the repo.
Everything below is load-bearing. Sections 11 and 13 are the acceptance
criteria. Section 15 records which shipped bug each rule prevents. Read it
before "simplifying" anything here.

---

## 1. Scope and history

### 1.1 The six bugs that caused the rewrite

The editor being replaced stored its data in the DOM of a single
contenteditable. Structure (order, nesting, type, collapse) was read back out of
HTML on every operation. That is the cause of every reported bug, not a
coincidence between them:

1. Empty lines vanish on collapse and reopen. An empty block node has no
   identity and gets normalised away on any HTML round trip.
2. Two checkboxes end up in one line. Nothing forbids it, because "line" is not
   a thing that exists in the data.
3. Enter inside a section inserts indentation instead of a new line. The
   browser's default contenteditable behaviour is running.
4. Applying a link only recolors the text. No `href` is stored anywhere.
5. Converting a checkbox to a section creates a second, empty section.
   Conversion is implemented as insertion because there is no block to convert.
6. The note closes intermittently when a selection leaves the field. State lives
   in event handlers rather than in a model.

After this rewrite those are not fixed. They are unrepresentable. Section 15
records which invariant makes each one impossible.

### 1.2 What replaced what

| Superseded | By |
|---|---|
| `NoteBlock[]` with line breaks as `"\n"` inside text blocks | A ProseMirror schema, section 3 |
| A flat array with `parent` pointers and `runs` (the block model brief, sections 1 to 3) | The same semantics expressed as a schema. Structure is enforced, not conventional |
| One contenteditable that React seeds once and never re-renders | One editable owned by ProseMirror, which owns its own rendering |
| `execCommand` for every programmatic edit | ProseMirror transactions. `execCommand` is banned |
| A hand-rolled `{ html, caret }` undo stack | Tiptap history, section 9 |
| `blocksToLines` / `linesToBlocks` / `reseedListLines` / `serializeContainer` / `splitCaretLines` | Nothing. The line model existed to compensate for the DOM being the model |

The block model brief proposed one contenteditable per line. That is superseded
too: it fixed the structural problem but broke cross-line selection and left the
field with no single element to carry a focus ring. One editable on a real schema
gets the structural guarantee without either cost.

---

## 2. Architecture

Tiptap 3.29.2 on ProseMirror. MIT. Peer range covers React 19.

```
@tiptap/core  @tiptap/pm  @tiptap/react  @tiptap/starter-kit
@tiptap/extension-link
```

`extension-link` is a direct dependency rather than StarterKit's copy for one
reason: the mark has to be trimmed to `href`, `target`, and `rel`, and only an
extended extension can do that. See 3.2.

That is the whole dependency list. **`@tiptap/extension-drag-handle` was
evaluated and rejected**, so nobody adopts it later without rediscovering why: it
declares hard peers on `@tiptap/extension-collaboration` and `@tiptap/y-tiptap`
with no `peerDependenciesMeta` marking them optional, which drags yjs into the
tree for a single-user field. The drag is our own code instead (section 8).

Why, in the order the reasons matter:

1. **The schema enforces structure instead of a convention list.** "One marker
   per row" is not vigilance, it is the fact that `check` and `bullet` are
   distinct node types and a node cannot be two types. "Sections do not nest" is
   not a guard clause, it is the section node being absent from the content
   expression of every node that a section can contain.
2. **Undo, IME, selection, and paste are solved.** All four were hand-rolled and
   all four broke, section 15.
3. **One editable, one focus ring.** The field keeps the standard input recipe.
4. **Positions, not DOM probes.** Every "where is the caret" question is
   answered against the document, which is what invariant 5 asks for.

Non-negotiable, both banned outright:

- No `execCommand` anywhere in notes code.
- No operation reads structure (order, type, nesting, checked, collapsed) or
  inline content out of the DOM. The document is the only source of truth.

And one that looks like a style preference and is not:

- **The keys are a raw ProseMirror `keymap` plugin at priority 1000, not
  `addKeyboardShortcuts`.** Do not "simplify" it back. These handlers are
  ProseMirror commands that build and dispatch their own transaction. Tiptap's
  command wrapper maintains a transaction of its own and dispatches that too, so
  routing them through it turns one operation into two dispatches: two undo steps
  where the spec promises one (invariant 11), and the second one silently empty.
  The priority puts the plugin ahead of everything StarterKit brings, so these
  handlers see each key first and no default ever gets to modify structure.

The section node is written by hand (section 3.3). It is not a customised
`details` extension.

---

## 3. Schema

The schema lives in
[`frontend/src/components/applications/noteSchema.ts`](../frontend/src/components/applications/noteSchema.ts)
and is asserted against in [`scripts/note-schema.test.mts`](../scripts/note-schema.test.mts),
which also parses every migrated row through it. That file is this section,
executed.

### 3.1 Nodes

```
doc         (block | section)+
```

| Node | Group | Content | Attrs |
|---|---|---|---|
| `paragraph` | `row`, `block` | `inline*` | none |
| `check` | `row`, `block` | `inline*` | `checked: boolean` |
| `bullet` | `row`, `block` | `inline*` | none |
| `quote` | `block` | `row+` | none |
| `section` | (none) | `sectionTitle sectionBody` | `collapsed: boolean` |
| `sectionTitle` | (none) | `inline*` | none |
| `sectionBody` | (none) | `block+` | none |
| `text` | `inline` | n/a | n/a |
| `hardBreak` | `inline` | n/a | n/a |

Two groups do the structural work:

- `row` is the set of nodes that hold inline content directly and render as one
  row: `paragraph`, `check`, `bullet`. Exactly the nodes that can carry a marker.
- `block` is `row` plus `quote`.

`section` is in no group, and no content expression other than `doc` mentions it.
That single fact is what makes sections unable to nest, unable to sit inside a
quote, and unable to sit inside another section's body. It is a schema
impossibility, not a rule anyone has to remember.

`quote` takes `row+`, not `block+`, so quotes do not nest either.

### 3.2 Marks

`bold`, `italic`, `strike`, `link`.

**`link` stores `href`, `target`, and `rel`, and nothing else.** Tiptap's default
also stores `class` and `title`. Neither is ever set or read here (the class comes
from the render options, nothing writes a title), so they would be stored surface,
and every stored attribute is one more thing canonicalisation has to agree about for
a note to round trip. That is why `extension-link` is a direct dependency: the mark
is extended to trim it.

**`underline` is cut.** One stored row used it, and that occurrence migrates to no
mark (section 4.3). It went because an underline mark collides with the only
sensible styling for a link, and a link is worth more than an underline. `strike`
and `quote` both stay: they ship, they are in the toolbar, and they are in stored
notes.

Because nothing else underlines, links get the obvious treatment:

> Links render `--gold-text` with a **solid 1px** underline at 40% opacity. Blue
> is not in the palette and must not be introduced for links.

### 3.3 The section node

```
section[collapsed]
  sectionTitle   inline only, the header text
  sectionBody    block+
```

- `collapsed` is a node attribute. Toggling it is a transaction, so it is
  undoable and it never touches the body.
- The body **stays in the document and in the DOM** when collapsed, hidden by
  `[data-collapsed="true"]`. ProseMirror needs a `contentDOM` to keep the node
  editable and to keep positions valid. What the invariant actually requires is
  that toggling never serialises, parses, or regenerates the body, and a CSS
  toggle satisfies that more strictly than not rendering would. Consequence to
  know: browser find-in-page can still reach hidden text.
- `sectionBody` is `block+`, so a section always has at least one row. A section
  that loses its last child keeps an empty paragraph and stays on screen as a
  header with one empty row under it. The alternative, `block*`, leaves the body
  with no caret target. See section 12, decision 3.
- Sections are not draggable and have no grip.

### 3.4 What is deliberately not in the schema

- **No block ids.** See section 12, decision 2.
- **No list nodes.** `bullet` is a flat row type, not a `list_item` inside a
  `bullet_list`. Notes have exactly one level of nesting (section membership) and
  list nodes would import a second, plus lift and sink semantics nobody asked
  for.
- **No nested quotes, no nested sections, no section inside a quote.**
- **No hard break outside inline content.** `hardBreak` is the Shift+Enter soft
  break and nothing else.

StarterKit ships several of those, so they are switched off by name in
`noteExtensions`: `heading`, `blockquote` (replaced by `quote` with `row+`
content), `bulletList`, `orderedList`, `listItem`, `listKeymap`, `code`,
`codeBlock`, `horizontalRule`, `underline`, and `trailingNode`. `document` and
`paragraph` are replaced rather than disabled, because sections and rows need
different groups than the defaults give. What StarterKit is kept for: `text`,
`hardBreak`, `bold`, `italic`, `strike`, `link`, dropcursor, gapcursor, and
undo/redo.

Switching an extension off matters as much as leaving a node out of the schema. An
enabled extension brings its own input rules and shortcuts, so a live `heading`
would let `## ` build a node the document cannot hold.

`trailingNode` is off for a reason worth keeping: it appends an empty paragraph
after a trailing block. An empty last row is real content when the user made one
and must never be conjured, which is invariant 2 read from the other direction.

---

## 4. Storage and migration

### 4.1 The envelope

```ts
type StoredNote = {
  v: 2
  kind: string          // kept from v1
  text?: string         // kept from v1
  doc: ProseMirrorJSON  // replaces blocks
}
```

`kind` and `text` are carried forward unchanged. They are in the column and in
every stored row; dropping them is a separate decision nobody has made.

Rules:

- The load path accepts `v: 2` and un-versioned v1. It migrates v1 in memory
  (section 4.3) and never writes HTML in either direction.
- The save path writes `v: 2` only.
- Save and reload produce an identical `doc`. Invariant 12.
- **Everything written to a store is canonical**, meaning the form the schema itself
  produces. `canonicalDoc()` in `noteSchema.ts` is the single gate. The migration
  mapping is dependency-free and so cannot know three things the schema does: a
  mark's default attributes (Tiptap's link carries `target`, `rel`, `class`, and
  `title` beyond the `href`), that two adjacent text runs with identical marks are
  one text node, and that marked text serialises as `{type, marks, text}` in that
  order. Its output is valid but not canonical, and storing it would make the first
  save after opening any migrated note produce a diff for no reason. The editor
  canonicalises on load for free; the migration runner does it explicitly, and
  asserts that doing it twice changes nothing.
- **A null note is an empty document.** A `note` column holding JSON `null`, or
  missing entirely, loads as one empty paragraph with the placeholder showing. It
  is not an error and it is not a migration case. **The save path never writes
  `null` back**: once a note is touched it is a `v: 2` envelope with an empty
  document. This is a rule about the shape of the store, not an accommodation for
  the one row that happens to be null today.

### 4.2 The v1 shape, exactly as it is on disk

```ts
type NoteBlock =
  | { type: 'text';  text: string; bold?; italic?; underline?; strike?; href? }
  | { type: 'check'; checked: boolean; text: string }
  | { type: 'quote'; blocks: NoteBlock[] }
  | { type: 'collapse'; summary: string; open: boolean; blocks: NoteBlock[] }
```

Four details the migration must get right, all verified against the real column:

1. **Line breaks are `"\n"` inside `text` blocks**, so one `text` block can span
   several lines and one line can span several `text` blocks.
2. **A checkbox is two blocks**: `{ type: 'check', checked, text: '' }` followed
   by `{ type: 'text', text: ' ' }`. The check block's own `text` is always
   empty; the row's words live in the following text blocks, and the first of them
   opens with one space that existed only to give the caret somewhere to land.
   That space is marker syntax and is stripped.
   **That space is `U+0020` in some rows and `U+00A0` in others**, 15 and 12
   respectively in the real column, because contenteditable rewrote a trailing
   space as a non-breaking one before the field was serialized. Stripping only
   `U+0020` would leave a stray non-breaking space in front of nearly half the
   checkbox rows. Anything beyond that one space is content and is preserved,
   and the dry run counts the rows where it happens.
3. **A bullet is a text block whose text starts with `U+2022 U+0020`** (`"• "`,
   bullet glyph then a space). There is no bullet block type in v1. That prefix is
   marker syntax and is stripped. **No row in the real column uses it**, so this
   path is exercised against a fixture rather than live data, and the dry run says
   so instead of quietly reporting zero.
4. **The marker space belongs to the text after the box, and text can also sit
   before it.** v1 stored a line as a sequence, so a stray text block could
   precede the checkbox. Stripping the first text *on the line* rather than the
   first text *after the box* takes a space from in front of the box and leaves the
   real marker space in place. That reads as correct in a screenshot and is wrong
   in the data. Whitespace before the box is dropped, because the box is the row's
   left edge (section 5) and there is nowhere for it to go: unrepresentable by
   design, like an indent tab in the text. One row in the real column has this.
   **Real words before the box halt the run.** There is no defined conversion and
   no row needs one.

### 4.3 The mapping

Group the flat list into lines first, the way `blocksToLines` did: split `text`
on `"\n"`, and give every `quote` and `collapse` a line of its own. Then each
line becomes one node.

| v1 line | v2 node |
|---|---|
| Text blocks only | `paragraph` with the text as inline content |
| Empty line | `paragraph` with no content. It is preserved, not merged away |
| Line whose first block is `check` | `check` with `checked` carried over, the leading marker space stripped, the rest as inline content |
| Text line starting `"• "` | `bullet`, prefix stripped, the rest as inline content |
| `quote` | `quote`, its own blocks migrated by this same table |
| `collapse` | `section` with `collapsed: !open`, `summary` as `sectionTitle` inline content, its blocks migrated into `sectionBody` |

Marks: `bold`, `italic`, and `strike` become the same marks on the text that
carried them. `href` becomes a `link` mark carrying that href. Per-block booleans
become per-run marks, which is a widening, not a loss.

**`underline` is dropped, deliberately.** The mark is gone from the schema (3.2),
so text that carried `underline: true` migrates to text with no mark. Its
characters are preserved; only the styling is lost. Exactly one stored row is
affected, and the dry run counts it.

Two cases the schema cannot represent, both defensive:

- **A nested `collapse`.** Promoted to top level, inserted immediately after its
  former parent section, keeping its title, body, and collapsed state. Zero rows
  in the real column need this (checked).
- **A `quote` or `collapse` inside a `quote`.** Same treatment: the inner
  container is lifted out and placed after the quote. Zero rows need this.

An empty `sectionBody` after migration gets one empty paragraph, per 3.3.

#### Whitespace: dropped in one place, preserved in another

These two look inconsistent and are not, so the distinction is written down rather
than left to be rediscovered as an oversight.

- **Whitespace in front of a checkbox is dropped.** The box is the row's left edge
  (section 5), so there is nowhere for that space to live. It is unrepresentable
  in the same way an indent tab in the text is not an indent.
- **Whitespace at the start of a paragraph is preserved.** It is inside the text,
  where the user can see it, put the caret after it, and delete it. Nothing about
  the row's structure conflicts with it.

The rule underneath both: whitespace that would have to live outside a row's
inline content cannot survive, and whitespace inside it always does.

#### Considered and rejected: normalising all-whitespace notes

One stored note is three empty rows and nothing else. It migrates to three empty
paragraphs, which is exactly what v1 rendered, and because its document is not a
single empty paragraph it will not show the `Add a note` placeholder.

**A migration-only rule collapsing an all-whitespace note into one paragraph was
considered and rejected. Do not add it later as a tidy-up.** It would be the only
place in the system where a blank row is discarded, and invariant 2 is worth more
than a placeholder on one note. The rows in question get deleted by hand, in the
editor, like any other content.

### 4.4 How the migration runs

It is two files. The mapping is
[`frontend/src/lib/noteMigration.ts`](../frontend/src/lib/noteMigration.ts), pure
and dependency-free, so the app's load path and the database script call the same
code and cannot disagree about what a v1 note means. The runner is
[`scripts/migrate-notes.mts`](../scripts/migrate-notes.mts).

- One script, versioned, idempotent. Running it twice changes nothing, because
  `v: 2` rows are skipped.
- **Dry run by default.** Writing requires an explicit flag.
- **v1 is never overwritten in place.** The table is snapshotted before any write.
- **The write is the cutover, and it goes last.** The migration was finished before
  the editor was, and it stayed parked: converting the column while the shipped
  editor still spoke v1 would have made every note unreadable in the running app
  until the new one landed. The column stays v1 until the new editor passes all
  twelve steps of section 13, and `--write` runs in the same change as the switch.
  Steps in between are built against fixtures and a restored copy of the dump, not
  against the live column.
- **The dry run reports counts per encoding**, not just a total: rows matching the
  empty-check plus `U+0020` pattern, rows matching the `U+2022 U+0020` bullet
  pattern, rows containing a collapse, a quote, an underline, a strike, an href,
  and rows matching none of the known shapes.
- **An unknown shape halts the run.** There is no fallback conversion path and
  there must never be one. A row the script does not recognise is shown and looked
  at by hand. Migrating all but one row and inspecting that one beats guessing at
  it.
- **Five samples get reviewed before anything is written**, chosen to cover the
  encodings rather than the first five: one with a collapse, one with a quote, one
  with the checkbox encoding, one with the bullet encoding, one plain. v1 and v2
  side by side.
- Reads are non-destructive and the v1 payload is logged before the write, so a
  bad migration is recoverable from the log as well as from the snapshot.

#### The snapshot, and proving it exists

`--snapshot-only` takes the snapshot without converting anything, and `--write`
runs the identical code path first. Before a single row is touched:

1. Write the v1 dump to `scripts/.note-migration/note-v1-<stamp>.json`, and the
   planned v2 alongside it as `note-v2-<stamp>.json`.
2. Create the backup table `applications_note_v1_<stamp>`.
3. **Verify, and halt on any failure:** the dump parses as an array, the dump holds
   as many rows as the source table, the backup table holds as many rows as the
   source table, and the row count read matches the row count counted.

A snapshot nobody verified is not a safety net, it is a belief about one. If a
check fails the run stops before writing and leaves the backup table in place to
inspect.

Rollback is one line, to paste as it stands with the stamp filled in:

```sql
update applications a set note = b.note from applications_note_v1_<stamp> b where a.id = b.id;
```

`scripts/.note-migration/` is gitignored: it holds real note content.

#### Mixed versions are the expected state

From the moment the new editor is mounted, a v1 note migrates on read and the next
save writes v2, so the column converts **one note at a time, as the app is used**.
That is deliberate and better than a big-bang conversion: it exercises the mapping on
real data, one note at a time, with the person who owns the data watching, before any
bulk write runs.

Three consequences, all of them load-bearing:

1. **The mapping is idempotent.** A v2 document passes through `readNote` unchanged,
   for both stores. Asserted, not assumed.
2. **The sweep reports v1 and v2 separately** and converts only what is still v1.
   Unknown shapes still halt.
3. **The sweep is not the cutover.** The cutover is the moment the new editor mounts.
   The sweep is what picks up whatever was never opened.

#### The sweep procedure, in this order

By the time the sweep runs, most rows will already be v2 and the remainder will be
rows nobody has opened in weeks, which is exactly the population most likely to hold
a shape the mapping has never seen. The order is therefore not optional:

1. Fresh snapshot and dump, from live data.
2. Fresh dry run against live data, with v1 and v2 counted separately.
3. Halt on any unknown shape. Look at it by hand. There is still no fallback.
4. Re-run the schema validity check against the **fresh** dump, not an older one.
5. `--write`, which touches only rows that are still v1.

A snapshot is also taken immediately before the new editor is mounted, because that
is the last moment the column is uniformly v1.

**Earlier dumps are artifacts and the input to nothing.** The snapshot taken on
3 August 2026 is kept as a recovery artifact from that date and must not be used as
the source for a later verification: it was already four notes behind reality within
a day.

**The two stores are migrated two different ways, and only one of them by the
script.** A script cannot read a browser's `localStorage`, so `astir.v1` task
notes are not in its report and never will be. They migrate lazily on load,
through `readNote()` in the same module, and are written back as `v: 2` on the
next save of that task. The Postgres rows are migrated once, by the script, and
the same lazy path protects them too if one is ever missed.

### 4.5 The localStorage notes

Home's weekly-goals task notes are the same v1 `Note` shape, stored per task inside
the `astir.v1` object. Nothing in the migration script or the cutover touches them,
because no script can reach a browser's `localStorage`. This is specified here so
step 6 implements it rather than inventing it.

1. **Version gate on read.** A stored note that is not `v: 2` goes through the same
   `noteMigration.ts` mapping, then `canonicalDoc`, and is written back as `v: 2` on
   the next save of that task. One mapping, no second implementation. A `v: 2` note
   is used as-is.
2. **The halt rule must not stop the app.** The script halts because a person is
   watching it. Home is not a script. An unrecognised shape:
   - leaves the stored value **untouched**, byte for byte;
   - renders that one note **read-only**, with a quiet line saying it could not be
     opened;
   - logs the reason and the task id;
   - and does not affect any other task, the goals card, or the rest of Home.
   It never discards the value, and it never throws where a render can see it.
3. **One task's bad shape is one task's problem.** The gate runs per note, not per
   week, so a single unreadable note cannot take the card down with it.

Before any of that is written, the same encoding table the Postgres rows got is
produced against the real `astir.v1` notes, counted rather than assumed. See
[`scripts/count-astir-notes.mts`](../scripts/count-astir-notes.mts) for how to export
and count them.

> **`astir.v1` has no snapshot and cannot be given one.** Postgres has a backup table
> and a dump taken by a script; a browser's `localStorage` can only be exported by
> the person sitting at the browser. An export of it is therefore Home's **only**
> recovery artifact, and is kept alongside the Postgres dumps in the gitignored
> `scripts/.note-migration/`, because it is real note content.

4. **Idempotence, on the same terms as Postgres.** A `v: 2` task note is read and
   returned unchanged. This is what makes the mixed-version period safe on Home too.

---

## 5. Rendering and layout

One row per visible row node, in document order.

```
[grip] [marker] [inline content]
```

That is a schematic, not a layout instruction. The actual layout rule is
stricter and it is load-bearing:

1. **Inside any one container, a checkbox row and a plain paragraph share a left
   edge, and the checkbox box defines it.** The grip is absolutely positioned in
   the gutter to the left of the box, so its width can never shift the row. In
   flow it pushed every box right by its own width.
2. **The grip** fades in on row hover over 150ms. Section headers have none.
3. **The marker** is the checkbox for `check`, the bullet for `bullet`, the
   disclosure triangle for `section`. One per row, or none. Two is not
   representable, because a node has one type.
4. **Markers are real SVG.** No text glyphs. AGENTS.md 4.6 applies with no
   exception, so the bullet and the disclosure triangle are icon components, not
   `•` and `⌄` characters. (The `"• "` in v1 data was a text glyph. That is one
   of the things being migrated away.)
5. **Section body rows indent one step**, `var(--space-6)`, from the section
   node. Never from a DOM nesting level, never from a tab character in the text.
   A row rendering at an unexpected indent means it drifted out of the body in
   the document, not a CSS bug.
6. **An empty row is a full-height row.** Selectable, focusable, draggable like
   any other.

Field recipe, the standard input recipe from AGENTS.md: **`--paper` background**,
`--line2` border, input radius, gold focus border with no glow.
`white-space: pre-wrap`.

**The placeholder shows on exactly one condition**: the document has one child, it
is a `paragraph`, and its content is empty. Keyed on that, explicitly, and not on
Tiptap's `isEmpty`. The two are not the same and the difference is a real note: a
note of three empty rows is not empty, must keep its rows (invariant 2), and must
not show `Add a note`. Both cases are asserted in the harness.

The shipped `.note-field` used `--tile`. That was drift, not a decision: every
other input surface in the app is `--paper` (the base `input, select` rule,
`textarea`, `.tag-input`, `.select-trigger`, `.date-trigger`), and the single
`--tile` trigger is the pipeline card's stage select, which is deliberately
matching its card's hover background rather than following the input recipe. The
field is paper. A component does not get to disagree with the token table.

The toolbar surface uses the menu recipe: card surface, `--r-md`, menu shadow
`0 6px 24px rgba(60,50,30,.12)`. The shipped toolbar uses
`0 6px 20px rgba(0,0,0,.18)`, which is drift; the rebuild uses the token recipe.

### 5.1 Component tokens

Three values are the field's own geometry and nothing else uses them, so they are
declared on `.note-editor-shell` rather than added to the global table:
`--note-disclosure-icon`, `--note-quote-rule`, `--note-underline-offset`. Control
radius is **not** among them: it uses `--r-sm`, because radius is a system scale
and a one-off 6px beside an existing 8px is exactly the drift AGENTS.md 7.1 exists
to prevent.

> **The system has no icon size scale.** That is the only reason
> `--note-disclosure-icon` needs to exist at all: there is no `--icon-md` to reach
> for. Adding that scale is a foundations task and deliberately not part of this
> rebuild. Do not fix it here; do not take this token as a licence to keep adding
> per-component icon sizes either.

Partial opacity comes from `color-mix` on the token, never a hardcoded `rgba` and
never a new `--something-soft` token: the link underline is
`color-mix(in srgb, var(--gold-text) 40%, transparent)`. See AGENTS.md.

---

## 6. Semantics

Every key below has an explicit handler and produces one undo step. The browser
is never allowed to modify structure. Where a row says "same type", `check`
always arrives unchecked.

### 6.1 Enter

| Caret | Result |
|---|---|
| Non-empty row, at the end | New row below, same type. Caret in it |
| Non-empty row, at offset 0 | New **empty** row **above**, same type **and same `checked` state**. Caret stays on the new empty row. The original keeps its text and moves down |
| Non-empty row, mid-text | Split. The text after the caret moves to a new row below, same type. Marks split with the text. Caret at the start of the new row |
| Empty `check` or `bullet` | No new row. Convert to `paragraph`. Section membership and position unchanged. Caret stays |
| Empty `paragraph` inside a `sectionBody` | No new row. Lift it out of the section and place it immediately after the section. Caret stays in it. This is how you leave a section |
| Empty `paragraph` inside a `quote` | The same: lift it out and place it after the quote. This is how you leave a quote |
| Empty `paragraph` at top level | New empty `paragraph` below. Caret in it |
| `sectionTitle`, at offset 0, title non-empty | The whole section moves down and a plain paragraph opens above it. Caret on that paragraph |
| `sectionTitle`, mid-text | The title keeps the text before the caret. The rest becomes the body's first row |
| `sectionTitle`, at the end or title empty | If the body's first row is empty, the caret moves into it. Otherwise a fresh empty first row opens at the top of the body |

The offset-0 case was agreed separately and is easy to lose: it produces a new
empty row *above* with the same marker and the same checked state, so the new
item can be typed immediately. It is decided from the document, never from a DOM
probe, because a caret at a row start is an element offset, not a text-node
offset. See section 15.

The last row exists because Enter at the end of a title used to insert a fresh
empty row above the body's content on every press, compounding blank lines.

The ladder inside a section is therefore: Enter continues the list, Enter again
drops the marker but stays inside, Enter again leaves the section. The empty row
between the second and third press is a stable state and persists.

**Enter never inserts whitespace, indentation, or a tab.**

### 6.2 Shift+Enter

Always a plain soft break, a `hardBreak` in the current row. It never continues a
list, never converts a marker, never enters or leaves a section.

### 6.3 Backspace at offset 0

| Row | Result |
|---|---|
| Has a marker (`check` or `bullet`) | Convert to `paragraph`. Text and section membership kept. **Nothing is deleted, including on a non-empty row** |
| `paragraph`, a previous row exists in the same container | Append this row's content to the previous row. Delete this row. Caret at the join point |
| `paragraph`, first row of a `sectionBody` | Lift it out and place it immediately before the section. No merge |
| `paragraph`, first row of a `quote` | The same: lift it out and place it before the quote |
| `sectionTitle` | Dissolve the section: its body rows are lifted to where the section was, in order, and the title becomes a `paragraph` keeping its text. Content is never destroyed |
| First row of the note | No-op |

### 6.4 Delete at the end of a row

**Delete is not the mirror of Backspace, and the asymmetry is deliberate. Do not
"fix" it.** Backspace at the start of a section's first row ejects that row from
the section (6.3). Delete at the end of a section's last row does nothing.
Leaving a section is meant to be easy; being absorbed into one is not something a
keystroke should do by accident.

| Row | Result |
|---|---|
| A following row exists in the same container | Append that row's content to this one, delete it, caret stays |
| Last row of a `sectionBody` | No-op. It never pulls the block after the section into the section |
| A `sectionTitle` | No-op. It never merges a title with its body |
| Last row of the note | No-op |

### 6.4a Crossing a container boundary

One principle governs both keys, and it is what the tables above are applying:

> **Content never crosses a container boundary by keystroke. The caret always may.**

Merging a row that holds text into a section or a quote would absorb that text into
the container, which is what 6.4's asymmetry exists to prevent. An empty row holds
nothing to absorb, so it is deleted and the caret travels. Without that second
half, an empty row sitting next to a section is undeletable: there is no
row-delete affordance to fall back on.

| Situation | Result |
|---|---|
| Backspace at offset 0, row has text, previous sibling is a `section` or `quote` | No-op |
| Backspace at offset 0, row is empty, previous sibling is a `section` or `quote` | Delete the row. Caret to the end of the last row inside that container |
| Delete at the end, row has text, next sibling is a `section` or `quote` | No-op |
| Delete at the end, row is empty, next sibling is a `section` or `quote` | Delete the row. Caret to the start of the first row inside that container |

**Against a collapsed section the caret goes to its title instead.** It is never
placed inside a hidden body, in either direction.

### 6.5 Tab

Tab and Shift+Tab move focus out of the field, forward and backward. They never
insert whitespace and never change indent. Indent is section membership and
nothing else sets it.

**The field does not trap focus.** Tab must be able to leave the editor, in both
directions, from any row, including from inside a section body and while the
toolbar is showing. AGENTS.md requires full keyboard operation, and an editor you
cannot Tab out of fails that on its own.

### 6.6 Text triggers

At the start of a row, and only there:

- `[]` then space converts the row to `check`.
- `- ` converts the row to `bullet`.

These two are the only text triggers. **They overwrite each other**, because a
row carries at most one marker: typing `- ` on a check row makes it a bullet,
typing `[]` on a bullet row makes it a check. The toolbar's two buttons follow
the same rule. This was agreed explicitly and it used to fail silently.

### 6.7 Type conversion

Conversion is a `replaceWith`, never an insertion. That distinction is the whole of
the original bug: converting a checkbox used to *insert* a section, leaving the
checkbox behind as a second, empty one.

Conversion always changes the current row. It never inserts a new one.

1. **To check**: type `check`, `checked: false`. Text kept.
2. **To bullet**: type `bullet`. Text kept.
3. **To paragraph**: type `paragraph`. Text kept.
4. **To section**: the row becomes a `section` whose `sectionTitle` holds its
   text, with `collapsed: false`. **It adopts the rows that follow it, up to the
   next section or the end of the note, into its body.** That is what makes
   converting a checkbox into a heading immediately useful. As a transaction this
   is a wrap, so the adopted nodes are moved, never rebuilt.
5. **Section to paragraph**: dissolves, as in 6.3.

A conversion from a selection collapses the selection to its start first: the
toolbar acts on a range, the row operations need a single position. Forgetting
this used to make the toolbar buttons silent no-ops.

### 6.8 Links

1. A link is a mark on inline content within one row.
2. Applying it stores `href` in the mark. It is not a style and not an
   `execCommand` call.
3. Styled per 3.2: `--gold-text`, solid 1px underline at 40% opacity.
4. **Clicking a link in an editable field places the caret. That is correct
   browser behaviour, not a bug.** To open it: cmd or ctrl click, or the popover.
5. Popover: appears when the caret enters a link, anchored under it, card
   surface, the URL truncated, two quiet actions, `Open` and `Remove`. Dismisses
   when the caret leaves the link or on Escape.
6. Deleting the marked text deletes the mark. In ProseMirror a mark cannot
   outlive its text.

### 6.9 Collapse

1. `collapsed` is an attribute on the section node. Toggling it is a transaction
   and is undoable.
2. Toggling never touches the body's rows, their order, text, marks, or checked
   state. Nothing is serialised, parsed, or regenerated.
3. A section whose body holds one empty paragraph is valid and stays on screen.

### 6.10 Checkbox toggle

`checked` is an attribute, changed by a transaction, undoable. Clicking the box
does not move the caret and does not toggle the card (section 10).

### 6.11 Paste

1. Plain text splits on newlines. Each line becomes one row, inserted after the
   current row, in the same container.
2. `- ` opens a `bullet`. `[] ` or `[ ] ` opens an unchecked `check`. `[x] `
   opens a checked `check`. The marker text is stripped.
3. Blank lines become empty paragraphs and are preserved.
4. Pasted HTML is reduced to text plus the five marks in 3.2. Everything else is
   discarded. No pasted node type can create a section or a quote.

---

## 7. Toolbar

- **Visibility derives from a non-empty selection inside the editor, and persists
  while focus is inside toolbar-owned UI**, including the URL field. **Never keyed on
  editor focus alone.** Opening the URL field moves focus out of the editor by
  definition, so a focus-only rule unmounts the field the moment it is clicked into,
  and the Link button reads as a button that does nothing. It hides when the
  selection collapses, on Escape, and when focus leaves both the editor and the
  toolbar.
- **Placement**: fixed, centred over the selection, offset above it, flipping below
  when there is no room above. It never covers the row being edited. **The horizontal
  position is measured and clamped to the screen**, not centred with a CSS
  `translate(-50%)`: the toolbar is wider than a short selection, so centring alone
  puts it past the left edge where it cannot be clicked. AGENTS.md 4 already says no
  surface extends past a screen edge.
- **Contents**, in order, with separators: bold, italic, strike, link, separator,
  check, bullet, quote, section. Exactly those eight. No underline (3.2), and
  nothing that is not in the schema.
- **The three mark buttons are letterforms**, B, I, and S, not drawings of them.
  AGENTS.md 4.6 bans punctuation standing in for icons; a letter naming its own
  format is a label, and every editor uses these three. The five structural buttons
  are real SVG.
- **The section button is disabled inside a quote or a section body**, because a
  section cannot exist there (3.1). The alternative would be to move the row out of
  its container to make room, which is content moving on its own. Disabled and
  visible beats silent and clever.
- **Applying a link opens a URL field in the toolbar itself**, not a browser prompt.
  While it is open the editor is deliberately not focused, so toolbar visibility
  cannot be keyed on editor focus alone: doing that unmounts the field the moment it
  is clicked into.
- **Surface**: the menu recipe from section 5.
- Buttons show active state for the marks under the caret using `--gold-soft`
  background and `--gold-deep` text.
- Every button is keyboard reachable, has an aria label matching its tooltip,
  and returns focus to the selection on close.

---

## 8. Drag

The drag is our own code, in
[`noteDrag.ts`](../frontend/src/components/applications/noteDrag.ts).

> **`sortable.ts` is not part of this.** It is a generic vertical-list reorder hook,
> used by `ApplicationsView.tsx` and `StagesPreferences.tsx`. Nothing in this section
> is licence to touch it: changing it changes two screens that have nothing to do
> with notes. The note drag was written as its own file for exactly that reason.
The Tiptap drag handle extension was rejected for its peer graph (section 2). A
drop is one transaction, so it is one undo step. **It never moves DOM nodes and it
never rebuilds the document from the DOM.**

Two conditions on keeping our own drag, both structural rather than cosmetic:

1. **The drag code no longer mutates the DOM.** It resolves a target document
   position and dispatches a transaction. ProseMirror re-renders. The old version
   re-rendered the field into `div.note-drag-line` rows, set
   `contenteditable=false` for the length of the drag, and ran on that rendering.
   All of that goes.
2. **The grip is positioned from ProseMirror coordinates**, via `coordsAtPos` and
   the node's own position, never by DOM traversal. Likewise the slot thresholds
   resolve to document positions, via `posAtCoords`, rather than to elements.

The behaviour, carried forward in full:

- **The unit is exactly one row.** Never a group, never a section with its body.
  Sections have no grip and cannot be dragged.
- **Vertical only.** Indent is never set by dragging sideways. A row inherits the
  indent of the slot it lands in. The lifted card easing across to that indent
  (`translate`, 150ms) is the only horizontal movement in the drag.
- **A row's section is where it sits**, so the slot decides membership. Quote
  bodies and section bodies are both containers with slots of their own.
- Slots carry the pointer height that selects them, and those thresholds run down
  the page in order: the last one the lifted row's centre has passed wins. A
  section contributes three kinds of slot. Its header's midpoint puts the row
  *inside*, each body row's midpoint moves it down *within*, and the section's
  own bottom edge puts it *after*. That last pair is why an expanded section's
  end and the position after the section are two slots at one gap, with two
  indents.
- **A collapsed section is one row with one midpoint.** No interior slots, no
  auto-expand on hover. A row crossing it lands entirely above or below.
- Thresholds are measured once, at lift, and never recomputed. The gap moving
  around must not move the thing that decides where the gap goes.
- Rows are played from their old positions to their new ones (FLIP, 180ms) rather
  than being pushed by a hardcoded offset.
- **A section that loses its last body row stays**, as a header with one empty
  paragraph (3.3). Dragging the first or last row out of a section is the normal
  way to change membership.
- A cancelled drag dispatches nothing and records no history entry.
- **The drop leaves the caret in the row that moved.** Invariant 7 applies to a drag
  like anything else, and it is also what keeps undo reachable: undo is a keymap on
  the editable, so a drag that never focused it would leave cmd Z doing nothing.
- Lift state is plugin state with `addToHistory: false`, and the drop is one
  transaction. Nothing about the appearance of a drag is in the document.

Visual treatment: the lifted row is a card surface at `--r-md` with menu shadow
`0 6px 24px rgba(60,50,30,.12)`. The gap is a plain space with no dashed outline, and
it takes the indent of the target slot. Under `prefers-reduced-motion` the lift and
the reorder still happen; only the durations go to zero.

Two mistakes this cost, both worth keeping:

1. **The host element is resolved on use, never captured.** React mounts the editor's
   DOM into its final wrapper after the plugin's view is created, so a parent
   captured at init is a detached node: listeners on it never fire and the grip never
   appears.
2. **Having passed threshold `i` selects slot `i`, not `i + 1`.** The off-by-one
   lands the row one position below the gap that was shown, which nobody can see
   until they read the document. There is also an explicit "above everything" slot,
   because no row's midpoint can express it.

---

## 9. Undo and redo

Tiptap history replaces the hand-rolled `{ html, caret }` stack outright. The old
stack existed because structural edits rebuilt `innerHTML`, which the native
stack does not record. Nothing rebuilds `innerHTML` now.

Behaviour to configure and to test, carried forward:

- ⌘Z, ⇧⌘Z, and ⌘Y are handled by the field.
- Typing coalesces at roughly 700ms, breaking at spaces, so ⌘Z walks back by word
  and not by character.
- Every programmatic edit is one transaction and therefore one step. Invariant
  11.
- The seeded document is the first entry, so ⌘Z reaches how the note was opened
  and no further.
- Undo covers everything: typing, structural edits, checkbox toggles, collapse
  toggles, drag reorders, formatting, paste.

Testing rule, because this is where the old editor looked correct and was not:
**press ⌘Z until the state stops changing** and assert it lands exactly on the
pre-edit state, then redo the same number of steps. Asserting on a single ⌘Z is
wrong; one user action was often several steps.

---

## 10. The container, the card, and saving

1. **The expanded state of a notes area is toggled only by its disclosure
   control.** Never on focus, blur, pointerleave, outside click, selection
   change, or drag. This is what caused the intermittent closing. The rule
   applies to any future disclosure component.
2. **Clicking the note field never toggles the pipeline card.** The card toggles
   on clicks outside the open-posting icon, the stage dropdown, and the note
   field.
3. **Notes autosave. There is no save button.** `onChange` fires with the v2
   envelope; the adapter debounces and persists. The pipeline adapter updates
   local state optimistically so re-opening a card shows the edit immediately.
   Autosave fires on user edits only: invariant 17.

### 10.1 Flushing a pending save

The debounce is what makes a save cheap, and it is also what can lose the last
thing typed. When a save is pending, it flushes on:

- the notes container collapsing,
- the card closing,
- a route change,
- the component unmounting,
- and the tab closing or reloading.

For the last one, `visibilitychange` to `hidden` is the reliable signal and
`beforeunload` is the backstop; `beforeunload` alone is not dependable on mobile
Safari, and neither fires reliably after a crash, which is why the flush is not the
only protection.

Two rules about the flush itself:

1. **It is synchronous where the platform allows it.** For `localStorage` it always
   is. For the API it cannot be, so the pipeline adapter also writes through to its
   optimistic local state before the request goes out.
2. **A failed flush never discards the edit.** For Home the value stays in
   `astir.v1`. For pipeline the pending document is kept in memory and retried, and
   the editor is not reseeded from the server while a write is outstanding: doing so
   is how a save failure becomes a visible data loss.

Harness step: type into a note, immediately collapse the container, hard reload, the
text is there.
4. Neither adapter ever writes HTML, and neither reads structure back out of the
   DOM to build what it saves.

---

## 11. Invariants

These must hold after every operation. Re-check this whole list after any change
to the notes editor, not just the one you were asked to make.

1. Every row node keeps its identity from creation to deletion, and identity is
   never regenerated during render. In ProseMirror that identity is structural:
   documents are immutable values, an empty paragraph is a real node, and nothing
   is normalised away. See section 12, decision 2.
2. An empty row is a row. It survives collapse, reopen, reorder, drag, save, and
   page reload.
3. A row has at most one marker. Two checkboxes in one row is not representable.
4. Collapsing and reopening a section yields the identical body rows, in the same
   order, with the same text, marks, and checked state.
5. No operation reads order, type, nesting, checked, or collapsed state out of
   the DOM. **The document is the only source of truth**, for those five and for
   inline content too.
6. Reordering never changes any row's text, marks, type, or checked state.
7. Every operation states where the caret goes, and the caret goes there. No
   operation silently moves focus to another row.
8. Enter, Shift+Enter, Backspace, Delete, Tab, and paste all have explicit
   handlers. The browser is never allowed to modify structure.
9. No `execCommand` call exists anywhere in the notes code.
10. Sections never nest, and this is enforced by the schema rather than by a
    guard clause.
11. Every operation is a single undo step.
12. Save and reload produce an identical document. **There is no HTML round trip
    anywhere in the persistence path.**
13. No operation destroys content silently. Dissolving a section lifts its body
    rows; it never deletes them.
14. A mark never outlives the text it was attached to.
15. A notes container's expanded state changes only via its disclosure control.
17. **Opening a note and not editing it writes nothing.** Autosave fires on user
    edits only: never on load, never on focus or blur, and never because a
    document was canonicalised on the way in. "My notes keep showing as edited"
    has more than one possible cause, and this closes the ones that are not the
    canonical-form gate in 4.1.
16. **A NodeView holds no state.** It renders from the node's attributes and
    dispatches transactions. No React state mirroring a checkbox, no collapsed
    flag held beside the node, no DOM read to decide what to render. A NodeView
    keeping its own copy of the document's state is the same failure this rewrite
    exists to delete, wearing a React costume: two places to disagree, and the
    view winning. Both the checkbox toggle and the collapse toggle are
    transactions, which is also what makes them undoable (section 9).

Only three of these were reworded from the block model brief, and only where they
named the superseded implementation: 1 (ids to structural identity), 5 and 12
(the array to the document). The obligations are unchanged. Invariants 16 and 17
were added during the rebuild.

---

## 12. Decisions on the record

All settled. Kept here with the reasoning, because the reasoning is what tells a
later reader whether a decision still applies.

1. **The drag stays ours.** `@tiptap/extension-drag-handle` was rejected for its
   peer graph: hard peers on `@tiptap/extension-collaboration` and
   `@tiptap/y-tiptap`, no `peerDependenciesMeta`, so yjs enters the tree for a
   single-user field. `noteLineDrag.ts` and `sortable.ts` are kept and rewired to
   dispatch transactions, under the two conditions in section 8.
2. **No row ids.** Structural identity satisfies what invariant 1 protects
   against. No unique-id extension, no ids in stored JSON, nothing extra in
   history entries.
   **This decision is reversible, and it reverses the day we want per-block
   anchors, comments, or block-level permalinks.** Any of those needs a name for
   a block that survives an edit above it, and a document position is not one.
   Reopening it means adding a unique-id extension and a `v: 3` envelope, not
   redesigning the schema.
3. **`sectionBody` is `block+`.** A caret target beats literal compliance with
   the wording of the original brief. Consistent with an empty section header
   surviving the loss of its last child: the header stays, and the body holds one
   empty paragraph.
4. **The field background is `--paper`**, per the input recipe. The shipped
   `--tile` was drift, evidence in section 5. A component may not disagree with
   the token table.
5. **`underline` is cut** (3.2), and the one row using it migrates to no mark
   (4.3). Links take the solid underline.
6. **Converting a row to a section adopts the rows that follow it**, up to the
   next section or the end of the note (6.7).
7. **Delete is deliberately not the mirror of Backspace** (6.4). The asymmetry is
   the point, not an oversight.

---

## 13. Regression script

Twelve steps. They cover every bug reported so far. **They are automated against
the harness in section 14 and run on every change to the notes editor.** A script
someone has to remember to run by hand is how this list got long.

1. Type three lines of text. Press Enter twice to leave two blank lines. Type a
   fourth line. Reload. All four lines and both blanks are there.
2. Create a section with three checkboxes inside. Collapse it. Reopen it. All
   three are there, in order, with their checked states.
3. Put a blank line above a collapsed section. Drag a checkbox out of another
   section to a position above it. The blank line is still there.
4. Inside a section, on a checkbox with text, press Enter. New checkbox, still
   inside. Press Enter on the empty checkbox. The marker goes, still inside.
   Press Enter again. You are out of the section.
5. Try to put two checkboxes on one line by any means, including drag. You
   cannot.
6. Select text in a checkbox and apply a link. Cmd click it. It opens. Caret into
   it. The popover shows the URL.
7. Select text in a checkbox and convert it to a section. That checkbox becomes
   the section header with its text as the title. No second section appears.
8. Inside a freshly converted section, press Enter. A new line appears. No tab,
   no indentation jump.
9. Select text in the notes field and drag the pointer outside the field. The
   note stays open.
10. Backspace at the start of a section's first child. On a marker row the first
    press drops the marker and the second leaves the section; on a plain row it
    leaves in one press. Nothing is deleted in any case.
11. Backspace on a section header. The section dissolves. All children are still
    on screen.
12. Do any of the above, then press cmd Z once. One step is undone, not seven.

Four additions, because the twelve do not cover them and each one is a rule the
rebuild introduced:

- **a. The placeholder, both directions.** One empty paragraph shows `Add a note`.
  Three empty paragraphs do not, and keep all three rows.
- **b. Round trip.** Every migrated document from the snapshot loads into the editor
  and reads back identical. This is invariant 12, and it catches any asymmetry
  between the NodeViews and the parser.
- **c. Each toggle is one undo step.** Check a checkbox, cmd Z, unchecked. Collapse
  a section, cmd Z, open. One step, not zero and not two.
- **d. A collapsed body survives.** Collapse, reload, reopen: the same rows in the
  same order with the same checked states.

### 13.1 Why step 10 has two presses

6.3 orders its cases with "has a marker" above "first row of a section body", so a
marker row drops its marker before it can leave. Step 10 is worded to match that
order rather than against it, and the automated step checks all three outcomes.
Both readings look reasonable from the wording alone, which is why this is written
down: do not "fix" 6.3's order to make step 10 shorter.

---

## 14. Verification harness

**jsdom is not enough.** It has no `execCommand` and no `Selection.modify`, and it
diverges on caret behaviour. Notes changes are verified in **real Chrome via
playwright-core** (`channel: 'chrome'`).

```
node scripts/harness/build.mjs && node scripts/note-regression.test.mts
HEADED=1 node scripts/note-regression.test.mts     # watch it run
```

| File | What it is |
|---|---|
| [`scripts/harness/build.mjs`](../scripts/harness/build.mjs) | esbuild bundle, `@` aliased to `frontend/src`, one React copy |
| [`scripts/harness/mount.tsx`](../scripts/harness/mount.tsx) | mounts the real component, exposes `ROWS()`, `PLACEHOLDER()`, `REMOUNT()`, `EDITOR` |
| [`scripts/harness/harness.html`](../scripts/harness/harness.html) | the page, linking the real `tokens.css` and `app.css` |
| [`scripts/note-regression.test.mts`](../scripts/note-regression.test.mts) | section 13, automated, one reported line per step |

**Headless is the default now, and headed agrees with it.** The old preference for
headed existed because `execCommand('insertHTML')` placed the caret differently
without a window. `execCommand` is gone, so that divergence is gone with it. Both
modes are run before a change lands; if they ever disagree again, that is a finding
and not a reason to pick one.

Three rules for the harness, each learned the hard way:

- **It bundles the real component.** A workaround inside the harness is a lie about
  the app.
- **Caret placement waits for focus.** `chain().focus()` does not land
  synchronously, so a keystroke sent immediately after it goes nowhere and the
  failure reads as "the command did nothing".
- **A step asserts the document state it is about, never a keystroke count.** Step 1
  is the example: "press Enter twice to leave two blank lines" actually needs three
  presses, because the second leaves the caret on the second new row and typing
  there consumes it. The step asserts six rows with both blanks surviving a reload,
  which is what it is about. A test that counts keystrokes passes when the editor is
  wrong in the same way the test is.
- **A step that cannot be reached yet is reported as DEFERRED with its reason**, and
  the list is carried forward. It is never skipped quietly, because a silent skip
  reads as a pass.

The harness:

- Bundles the real component with esbuild. The build aliases `@/` to
  `frontend/src` and forces a single React copy, and the harness page links the
  real `app.css` so layout assertions mean something.
- Seeds through `window.SEED_NOTE`.
- Places the caret by document position, not by clicking coordinates.
- Reads back three things, because bugs hid in the gaps between them:
  1. **visual rows**, by grouping row rects on their `top` offset, which is how
     phantom blank lines and misalignment show up;
  2. **the saved envelope**, which is what actually persists;
  3. **a reload**, re-mounting from the saved envelope, because plenty of bugs
     appeared only after a round trip.

Habits that repeatedly paid off:

- **Read the real note out of the database** instead of guessing from a
  screenshot:
  `docker exec careerapp_july-db-1 psql -U astir -d astir -A -t -c "select jsonb_pretty(note::jsonb) from applications where company='…'"`.
- **For undo, press ⌘Z until the state stops changing**, per section 9.
- **Hard-reload before testing editor changes.** React Fast Refresh preserves
  `useRef`, so a seed guard keeps the old DOM after a hot reload.

---

## 15. Failure log

Every entry below is a bug that shipped and damaged stored notes, or a trap that
cost real time. Nothing is deleted from this log. Entries move from active to
resolved when the mechanism that allowed them is gone.

While the rewrite is in progress the superseded editor is still what runs, so the
resolved entries describe the code being deleted, not code that is already gone.

### 15.1 Active: still true of the current design

- **A caret at a row start is an element offset, not a text-node offset.**
  Probing `nodeType === TEXT_NODE` to ask "is there text after the caret"
  concluded there was none, pushed the row's text onto its own line, and
  stripped its marker. The rule survives the rewrite as a prohibition: ask the
  document, never the DOM, and never `Selection.modify`. Invariant 5.
- **A collapsed section's body is hidden, not absent** (3.3). Find-in-page can
  reach it. Any feature that walks visible text must filter on `collapsed`.
- **The toolbar acts on a range, row operations need a position.** Collapse the
  selection to its start first or the button is a silent no-op (6.7).

### 15.2 Resolved by the rewrite

Each of these was a consequence of the DOM being the model.

- **Empty lines vanished on collapse and reopen.** An empty node had no identity
  and was normalised away on the HTML round trip. Now invariants 2 and 4, and an
  empty paragraph is a real node.
- **Two checkboxes ended up in one line.** "Line" did not exist in the data. Now
  invariant 3, enforced by node type.
- **Enter inside a section inserted indentation.** The browser's default
  contenteditable behaviour was running. Now invariant 8.
- **Applying a link only recolored the text.** No `href` was stored. Now a
  `link` mark with an `href` (6.8).
- **Converting a checkbox to a section created a second, empty section.**
  Conversion was implemented as insertion because there was no block to convert.
  Now a wrap transaction (6.7).
- **The note closed intermittently when a selection left the field.** State lived
  in event handlers. Now invariant 15.
- **A block-level line was read as the caret line's suffix.** `splitCaretLines`
  serialized the range after the caret and took `afterLines[0]` as the rest of
  the caret's line, but when a quote or collapse sat immediately after the caret,
  `blocksToLines` opened its list with that block instead of an empty line, so a
  whole section was read as this line's suffix. Any edit that rewrote the caret's
  line without re-emitting the suffix then deleted it: Enter or Backspace on an
  empty checkbox row above a section silently took the entire section with it.
  Note the asymmetry that hid it: on the `before` side `blocksToLines` always
  pushed its trailing accumulator, so `prefix` came out empty in the mirror case.
  Resolved because nothing serializes a range to find out what a line contains.
- **`execCommand('insertHTML')` escaped a collapse body.** With the caret at the
  end of `.note-collapse-body`, inserted markup landed outside it as a sibling
  inside `.note-collapse`, giving a phantom blank line, an orphaned caret
  sentinel, and native Enter afterwards cloning empty `.note-collapse` divs.
  Resolved by invariant 9.
- **`execCommand('insertHTML')` with the real checkbox markup dropped the caret
  to offset 0.** With the nested `draggable`/`tabindex` markup, inserting
  checkbox plus space put the caret at the container start, not after the space,
  which a bare `<span contenteditable=false>` did not do. Marker conversion had
  to place the caret explicitly. Resolved by invariant 9 and by 6.7 stating the
  caret.
- **`Selection.modify` could not find a leading marker.** The checkbox's own
  `contenteditable="false"` span defeated the probe, so "drop the marker" and
  "replace the other marker" silently did nothing, and inside a collapse could
  leave *both* markers on one line. Resolved by invariants 3 and 5.
- **Wrapping a collapse line in a `<div>` grew blank lines.** It hid the collapse
  from the serializer's `afterBlock` guard, which then emitted a phantom `"\n"`
  before the next line: one extra blank line above the block on every reseed,
  compounding into the saved note. Resolved because there is no reseed and no
  serializer.
- **"Have we emitted anything yet" merged blank lines away.** Range clones
  routinely start with empty `<div>`s, so the weaker test deleted a note's blank
  lines during a split; the correct test was "has a previous sibling". Also:
  Enter in a collapse title reseeded a new first line above the body's content on
  every press. Resolved by invariant 2 and by the last row of 6.1.
- **A blank line next to a collapse was not representable.** The old separator
  rule inserted `"\n"` between two lines only when neither side was block-level,
  so a blank line above or below a collapse worked while you typed in it and was
  dropped on reload. Resolved: invariant 2 and regression step 3 now require it
  to survive, and the separator rule is gone with the line model.
- **`pruneBlankCheckLines` deliberately dropped content.** A blank unchecked
  checkbox row stayed in the DOM while you were on it and was never saved.
  Deleted: invariant 2 wins, and the Enter ladder (6.1) makes stray blank
  checkbox rows rare anyway, because Enter on an empty checkbox strips the marker
  instead of adding another row.

---

## 16. Accepted losses

- **Cross-block selection with one drag still works**, because the field is one
  editable. The per-line design would have cost this; the schema design does not.
- **Notes have one level of nesting.** No sub-sections, no nested quotes, no
  nested lists. This is a product decision, not a limitation to route around.
- **A collapsed section's hidden body is in the DOM.** See 15.1.

---

## 17. AGENTS.md amendments applied with this document

1. **Notes editor architecture.** Notes use one component on a Tiptap
   (ProseMirror) schema, which is the single source of truth. Document structure
   is never stored in or read from the DOM. `execCommand` is banned in notes
   code.
2. **Sections do not nest.** One level of nesting exists in notes, no more, and
   the schema enforces it.
3. **Link styling exception.** Inline links in notes render `--gold-text` with a
   solid 1px underline at 40% opacity. There is no underline mark to collide with
   it, because notes do not have one. No new token. Blue is not in the palette and
   must not be introduced for links.
4. **Notes container state.** The expanded state of a notes area is toggled only
   by its disclosure control, never by focus, blur, pointer, or selection events.
   This applies to any future disclosure component.
5. **Invariants discipline.** Any component with its own document model carries
   an invariants list, a regression script, and a failure log in this repo. All
   three are re-checked after every change to that component, and the regression
   script is automated.

The July 2026 stack amendment in AGENTS.md was corrected at the same time: the
app is Next.js, React, and TypeScript with a NestJS and Postgres backend, and
`prototype/` is frozen reference only.
