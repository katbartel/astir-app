// v1 to v2 note migration. See docs/notes-editor.md section 4.
//
// v1 stored a flat NoteBlock[] where line breaks lived as "\n" inside text
// blocks, a checkbox was two blocks, and a bullet was a "• " prefix. v2 stores a
// ProseMirror document. This module is the only place that mapping exists: the
// app's load path and the one-time database script both call it, so they cannot
// disagree.
//
// Pure by design. No DOM, no framework, no I/O, no dependency on the editor.
// It never guesses: an input it does not recognise throws UnknownNoteShape, and
// the caller stops. There is deliberately no fallback conversion path.

export const NOTE_VERSION = 2

// --- v2, the target shape ---

export type PmMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'strike' }
  | { type: 'link'; attrs: { href: string } }

export type PmNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  text?: string
  marks?: PmMark[]
}

export type StoredNote = {
  v: typeof NOTE_VERSION
  kind: string
  text?: string
  doc: PmNode
}

// --- v1, the shape on disk ---

type V1TextBlock = {
  type: 'text'
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  href?: string
}
type V1CheckBlock = { type: 'check'; checked: boolean; text: string }
type V1QuoteBlock = { type: 'quote'; blocks: V1Block[] }
type V1CollapseBlock = {
  type: 'collapse'
  summary: string
  open: boolean
  blocks: V1Block[]
}
type V1Block = V1TextBlock | V1CheckBlock | V1QuoteBlock | V1CollapseBlock

// --- what the dry run counts ---

export type Encodings = {
  /** Checkbox rows whose marker space is a plain U+0020. */
  checkSpace: number
  /** Checkbox rows whose marker space is U+00A0, left behind by contenteditable. */
  checkNbsp: number
  /** Checkbox rows with no text block after the box at all. */
  checkBare: number
  /**
   * Checkbox rows whose text still begins with whitespace after the one marker
   * space is stripped. v1's opener was a single space, so the rest was typed or
   * left behind by contenteditable. It is preserved, and counted so it is visible.
   */
  checkExtraSpace: number
  /**
   * Checkbox rows that had whitespace in front of the box. It is dropped: the box
   * is the row's left edge, so there is nowhere for it to go.
   */
  checkSpaceBeforeBox: number
  /** Rows opening with U+2022 U+0020, the v1 bullet. */
  bullet: number
  collapse: number
  quote: number
  underline: number
  strike: number
  href: number
  bold: number
  italic: number
  /** Empty rows preserved as empty paragraphs. */
  blankRow: number
  /** Containers lifted out of a container because v2 cannot nest them. */
  lifted: number
}

export function emptyEncodings(): Encodings {
  return {
    checkSpace: 0,
    checkNbsp: 0,
    checkBare: 0,
    checkExtraSpace: 0,
    checkSpaceBeforeBox: 0,
    bullet: 0,
    collapse: 0,
    quote: 0,
    underline: 0,
    strike: 0,
    href: 0,
    bold: 0,
    italic: 0,
    blankRow: 0,
    lifted: 0,
  }
}

export function addEncodings(into: Encodings, from: Encodings): void {
  for (const key of Object.keys(into) as (keyof Encodings)[]) into[key] += from[key]
}

/**
 * A note the migration refuses to convert. The run stops here on purpose: a row
 * nobody has looked at is worth more than a row converted by a guess.
 */
export class UnknownNoteShape extends Error {
  readonly at: unknown
  constructor(reason: string, at?: unknown) {
    super(reason)
    this.name = 'UnknownNoteShape'
    this.at = at
  }
}

const BULLET = '•'
const NBSP = ' '
const MARKER_SPACES = [' ', NBSP]

const TEXT_KEYS = new Set(['type', 'text', 'bold', 'italic', 'underline', 'strike', 'href'])
const CHECK_KEYS = new Set(['type', 'checked', 'text'])
const QUOTE_KEYS = new Set(['type', 'blocks'])
const COLLAPSE_KEYS = new Set(['type', 'summary', 'open', 'blocks'])
const NOTE_KEYS = new Set(['v', 'kind', 'text', 'blocks'])

// --- entry points ---

export function isV2(raw: unknown): raw is StoredNote {
  return isRecord(raw) && raw.v === NOTE_VERSION
}

/** A note with nothing in it. Not an error, and not something to migrate. */
export function isEmptyV1(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true
  if (!isRecord(raw)) return false
  const blocks = raw.blocks
  return blocks === undefined || (Array.isArray(blocks) && blocks.length === 0)
}

export function emptyDoc(): PmNode {
  return { type: 'doc', content: [paragraph([])] }
}

export function emptyNote(kind = 'blocks', text?: string): StoredNote {
  const note: StoredNote = { v: NOTE_VERSION, kind, doc: emptyDoc() }
  if (text !== undefined) note.text = text
  return note
}

/**
 * The migration. Throws UnknownNoteShape rather than converting anything it does
 * not recognise.
 */
export function migrateNote(raw: unknown): { note: StoredNote; encodings: Encodings } {
  if (isV2(raw)) throw new UnknownNoteShape('already v2, nothing to migrate', raw)
  const enc = emptyEncodings()

  if (raw === null || raw === undefined) {
    return { note: emptyNote(), encodings: enc }
  }
  if (!isRecord(raw)) {
    throw new UnknownNoteShape(`note is ${describe(raw)}, expected an object`, raw)
  }
  for (const key of Object.keys(raw)) {
    if (!NOTE_KEYS.has(key)) {
      throw new UnknownNoteShape(`unknown key "${key}" on the note envelope`, raw)
    }
  }
  const kind = raw.kind === undefined ? 'blocks' : raw.kind
  if (typeof kind !== 'string') {
    throw new UnknownNoteShape(`kind is ${describe(kind)}, expected a string`, raw)
  }
  if (raw.text !== undefined && typeof raw.text !== 'string') {
    throw new UnknownNoteShape(`text is ${describe(raw.text)}, expected a string`, raw)
  }
  const blocks = raw.blocks === undefined ? [] : raw.blocks
  if (!Array.isArray(blocks)) {
    throw new UnknownNoteShape(`blocks is ${describe(blocks)}, expected an array`, raw)
  }

  const validated = blocks.map((block) => validateBlock(block))
  const content = migrateTopLevel(validated, enc)

  const note: StoredNote = {
    v: NOTE_VERSION,
    kind,
    doc: { type: 'doc', content: content.length > 0 ? content : [paragraph([])] },
  }
  // The envelope's kind and text are carried through untouched. They are in the
  // column and in stored rows, and dropping them is a separate decision.
  if (typeof raw.text === 'string') note.text = raw.text
  return { note, encodings: enc }
}

/** Accepts either version, so a load path can call one function. */
export function readNote(raw: unknown): StoredNote {
  if (isV2(raw)) return raw
  return migrateNote(raw).note
}

// --- validation ---

function validateBlock(block: unknown): V1Block {
  if (!isRecord(block)) {
    throw new UnknownNoteShape(`block is ${describe(block)}, expected an object`, block)
  }
  const type = block.type
  if (type === 'text') {
    assertKeys(block, TEXT_KEYS, 'text block')
    if (typeof block.text !== 'string') {
      throw new UnknownNoteShape(`text block's text is ${describe(block.text)}`, block)
    }
    for (const flag of ['bold', 'italic', 'underline', 'strike'] as const) {
      if (block[flag] !== undefined && typeof block[flag] !== 'boolean') {
        throw new UnknownNoteShape(`text block's ${flag} is ${describe(block[flag])}`, block)
      }
    }
    if (block.href !== undefined && typeof block.href !== 'string') {
      throw new UnknownNoteShape(`text block's href is ${describe(block.href)}`, block)
    }
    return block as V1TextBlock
  }
  if (type === 'check') {
    assertKeys(block, CHECK_KEYS, 'check block')
    if (typeof block.checked !== 'boolean') {
      throw new UnknownNoteShape(`check block's checked is ${describe(block.checked)}`, block)
    }
    // v1 always stored '' here and put the row's words in the following text
    // block. A check that carries its own text is a shape nobody has seen, so it
    // stops the run rather than being guessed at.
    if (block.text !== '') {
      throw new UnknownNoteShape(
        `check block carries its own text (${JSON.stringify(block.text)}), which v1 never produced`,
        block,
      )
    }
    return block as V1CheckBlock
  }
  if (type === 'quote' || type === 'collapse') {
    assertKeys(block, type === 'quote' ? QUOTE_KEYS : COLLAPSE_KEYS, `${type} block`)
    if (!Array.isArray(block.blocks)) {
      throw new UnknownNoteShape(`${type} block's blocks is ${describe(block.blocks)}`, block)
    }
    if (type === 'collapse') {
      if (typeof block.summary !== 'string') {
        throw new UnknownNoteShape(`collapse summary is ${describe(block.summary)}`, block)
      }
      if (typeof block.open !== 'boolean') {
        throw new UnknownNoteShape(`collapse open is ${describe(block.open)}`, block)
      }
    }
    block.blocks.forEach((child) => validateBlock(child))
    return block as V1QuoteBlock | V1CollapseBlock
  }
  throw new UnknownNoteShape(`unknown block type ${JSON.stringify(type)}`, block)
}

function assertKeys(block: Record<string, unknown>, allowed: Set<string>, what: string): void {
  for (const key of Object.keys(block)) {
    if (!allowed.has(key)) {
      throw new UnknownNoteShape(`unknown key "${key}" on a ${what}`, block)
    }
  }
}

// --- lines ---

type InlineLine = { kind: 'inline'; blocks: (V1TextBlock | V1CheckBlock)[] }
type ContainerLine = { kind: 'container'; block: V1QuoteBlock | V1CollapseBlock }
type Line = InlineLine | ContainerLine

/**
 * Group a flat v1 block list into lines, the way the old blocksToLines did:
 * "\n" inside a text block separates lines, and a quote or collapse takes a line
 * of its own.
 *
 * One rule is not obvious and it is what stops phantom blank lines appearing all
 * over the migrated notes. A "\n" sitting immediately before a container, or at
 * the very end of the blocks, is the *terminator* of the line before it, not a
 * separator opening a new empty one. v1 wrote separators only between two lines
 * where neither side was block-level, so a "\n" next to a container never meant a
 * blank line. "\n\n" still does, and those blanks are preserved.
 */
function toLines(blocks: V1Block[]): Line[] {
  const lines: Line[] = []
  let current: (V1TextBlock | V1CheckBlock)[] = []
  let afterContainer = false

  for (const block of blocks) {
    if (block.type === 'text') {
      const parts = block.text.split('\n')
      parts.forEach((part, index) => {
        if (index > 0) {
          lines.push({ kind: 'inline', blocks: current })
          current = []
        }
        if (part !== '') current.push({ ...block, text: part })
        afterContainer = false
      })
      continue
    }
    if (block.type === 'check') {
      current.push(block)
      afterContainer = false
      continue
    }
    if (current.length > 0) {
      lines.push({ kind: 'inline', blocks: current })
      current = []
    }
    lines.push({ kind: 'container', block })
    afterContainer = true
  }

  if (current.length > 0 || !afterContainer) {
    lines.push({ kind: 'inline', blocks: current })
  }
  return lines
}

// --- lines to nodes ---

function migrateTopLevel(blocks: V1Block[], enc: Encodings): PmNode[] {
  const out: PmNode[] = []
  for (const line of toLines(blocks)) {
    if (line.kind === 'inline') {
      out.push(inlineLineToNode(line, enc))
      continue
    }
    const { node, lifted } = containerToNode(line.block, enc)
    out.push(node)
    // v2 cannot nest containers, so anything that was nested comes out after its
    // former parent, keeping its own content and state. Zero rows in the real
    // column need this; it exists so the migration cannot silently drop one.
    for (const extra of lifted) {
      out.push(extra)
      enc.lifted += 1
    }
  }
  return out
}

function containerToNode(
  block: V1QuoteBlock | V1CollapseBlock,
  enc: Encodings,
): { node: PmNode; lifted: PmNode[] } {
  if (block.type === 'quote') {
    enc.quote += 1
    // A quote takes row+ only, so a container inside it is lifted out.
    const body = migrateBody(block.blocks, enc, { allowQuote: false })
    return { node: { type: 'quote', content: body.rows }, lifted: body.lifted }
  }
  enc.collapse += 1
  // A section body takes block+, so a quote may stay inside it. A nested section
  // cannot, and is lifted.
  const body = migrateBody(block.blocks, enc, { allowQuote: true })
  return {
    node: {
      type: 'section',
      attrs: { collapsed: !block.open },
      content: [
        { type: 'sectionTitle', ...(block.summary ? { content: [{ type: 'text', text: block.summary }] } : {}) },
        { type: 'sectionBody', content: body.rows },
      ],
    },
    lifted: body.lifted,
  }
}

function migrateBody(
  blocks: V1Block[],
  enc: Encodings,
  options: { allowQuote: boolean },
): { rows: PmNode[]; lifted: PmNode[] } {
  const rows: PmNode[] = []
  const lifted: PmNode[] = []
  for (const line of toLines(blocks)) {
    if (line.kind === 'inline') {
      rows.push(inlineLineToNode(line, enc))
      continue
    }
    const converted = containerToNode(line.block, enc)
    if (options.allowQuote && line.block.type === 'quote') rows.push(converted.node)
    else lifted.push(converted.node)
    lifted.push(...converted.lifted)
  }
  // block+ and row+ both need at least one child, and an empty body needs
  // somewhere for the caret to go. See docs/notes-editor.md 3.3.
  if (rows.length === 0) rows.push(paragraph([]))
  return { rows, lifted }
}

function inlineLineToNode(line: InlineLine, enc: Encodings): PmNode {
  const checkAt = line.blocks.findIndex((block) => block.type === 'check')
  const checks = line.blocks.filter((block): block is V1CheckBlock => block.type === 'check')
  if (checks.length > 1) {
    // The two-checkboxes-on-one-line bug. There is no correct conversion, so the
    // run stops and the row gets looked at.
    throw new UnknownNoteShape(`${checks.length} checkboxes on one line`, line.blocks)
  }
  const texts = line.blocks.filter((block): block is V1TextBlock => block.type === 'text')

  if (checks.length === 1) {
    // The marker space belongs to the text *after* the box. Stripping the first
    // text on the line instead would take a space from in front of the box and
    // leave the real marker space in place.
    const before = line.blocks
      .slice(0, checkAt)
      .filter((block): block is V1TextBlock => block.type === 'text')
    const after = line.blocks
      .slice(checkAt + 1)
      .filter((block): block is V1TextBlock => block.type === 'text')

    const leading = before.map((block) => block.text).join('')
    if (leading.trim() !== '') {
      // Real words in front of a checkbox on the same line. v2 has no place for
      // them, because the box is the row's left edge, and dropping content is not
      // something this script decides on its own.
      throw new UnknownNoteShape(
        `text before the checkbox on the same line (${JSON.stringify(leading)})`,
        line.blocks,
      )
    }
    if (leading !== '') {
      // Whitespace in front of the box. Unrepresentable by design rather than by
      // accident: the box defines the row's left edge, exactly as an indent tab in
      // the text is not an indent. It goes, and it is counted.
      enc.checkSpaceBeforeBox += 1
    }

    const stripped = stripMarkerSpace(after)
    if (stripped.removed === ' ') enc.checkSpace += 1
    else if (stripped.removed === NBSP) enc.checkNbsp += 1
    else enc.checkBare += 1
    const firstText = stripped.texts.find((block) => block.text !== '')
    if (firstText && /^\s/.test(firstText.text)) enc.checkExtraSpace += 1
    return {
      type: 'check',
      attrs: { checked: checks[0].checked },
      ...contentOf(stripped.texts, enc),
    }
  }

  const bullet = stripBulletPrefix(texts)
  if (bullet) {
    enc.bullet += 1
    return { type: 'bullet', ...contentOf(bullet, enc) }
  }

  if (texts.length === 0 || texts.every((block) => block.text === '')) enc.blankRow += 1
  return paragraph(inlineContent(texts, enc))
}

/**
 * v1 put a space between the checkbox and its words purely so the caret had
 * somewhere to land. It is marker syntax, not content, so it goes. It is a plain
 * U+0020 in some rows and U+00A0 in others, because contenteditable rewrote a
 * trailing space as a non-breaking one before the field was serialized.
 */
function stripMarkerSpace(texts: V1TextBlock[]): { texts: V1TextBlock[]; removed: string | null } {
  for (let index = 0; index < texts.length; index += 1) {
    const block = texts[index]
    if (block.text === '') continue
    const first = block.text[0]
    if (!MARKER_SPACES.includes(first)) return { texts, removed: null }
    const copy = texts.slice()
    copy[index] = { ...block, text: block.text.slice(1) }
    return { texts: copy, removed: first }
  }
  return { texts, removed: null }
}

/** v1 had no bullet block: a bullet was the glyph plus a space, as text. */
function stripBulletPrefix(texts: V1TextBlock[]): V1TextBlock[] | null {
  const first = texts.find((block) => block.text !== '')
  if (!first) return null
  if (first.text[0] !== BULLET) return null
  const rest = first.text.slice(1)
  if (rest !== '' && !MARKER_SPACES.includes(rest[0])) return null
  const trimmed = rest === '' ? '' : rest.slice(1)
  return texts.map((block) => (block === first ? { ...block, text: trimmed } : block))
}

function contentOf(texts: V1TextBlock[], enc: Encodings): { content?: PmNode[] } {
  const content = inlineContent(texts, enc)
  return content.length > 0 ? { content } : {}
}

function inlineContent(texts: V1TextBlock[], enc: Encodings): PmNode[] {
  const out: PmNode[] = []
  for (const block of texts) {
    if (block.text === '') continue
    const marks = marksOf(block, enc)
    out.push({ type: 'text', text: block.text, ...(marks.length > 0 ? { marks } : {}) })
  }
  return out
}

/**
 * Per-block booleans become per-run marks. underline is counted and then dropped:
 * the mark does not exist in v2, because it collided with link styling and links
 * matter more. The characters survive, only the styling goes.
 */
function marksOf(block: V1TextBlock, enc: Encodings): PmMark[] {
  const marks: PmMark[] = []
  if (block.bold) {
    marks.push({ type: 'bold' })
    enc.bold += 1
  }
  if (block.italic) {
    marks.push({ type: 'italic' })
    enc.italic += 1
  }
  if (block.strike) {
    marks.push({ type: 'strike' })
    enc.strike += 1
  }
  if (block.underline) enc.underline += 1
  if (block.href) {
    marks.push({ type: 'link', attrs: { href: block.href } })
    enc.href += 1
  }
  return marks
}

function paragraph(content: PmNode[]): PmNode {
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

// --- small helpers ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return `a ${typeof value}`
}
