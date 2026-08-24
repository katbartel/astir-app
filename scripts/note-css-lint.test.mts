// Lint the notes editor's CSS scope. See docs/notes-editor.md 5.2 and 7.
//
//   node scripts/note-css-lint.test.mts
//
// A test asserting a computed style equals its own custom property tests that the
// CSS says what the CSS says: it passes for the wrong reason and fails on every
// legitimate change. What those tests were really protecting against is drift — a
// raw hex, an rgba, a stray px appearing in the notes CSS. That is caught here, at
// the moment it is written, by one guard over the class instead of a dozen cases.
//
// The rule: inside any rule whose selector names a `.note-` class, no raw hex
// colour, no rgba()/rgb(), and no px literal — except in the definition of a named
// component token (a `--note-*` custom property, section 5.1), which is the one
// place a px value is allowed to live.
//
// Second rule, added after the lifted drag card rendered unreadably: a row rule may
// not be scoped to `.note-editor`. Row markup renders in two places, and the card is
// on the body with no editor ancestor, so an editor-scoped row rule silently applies
// to one of them. `.note-surface` is the context both carry. Section 8.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CSS_PATH = resolve('frontend/src/styles/app.css')
const source = readFileSync(CSS_PATH, 'utf8')

type Violation = { selector: string; decl: string; reason: string }
const violations: Violation[] = []

// Strip comments first: a "1px" in prose is not a value. Then walk the innermost
// `{ }` blocks. A selector cannot contain braces, so the innermost pairs are the
// declaration blocks, and @media wrappers fall away because the rules inside them
// match on their own selectors.
const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
const ruleRe = /([^{}]+)\{([^{}]+)\}/g

for (let match = ruleRe.exec(css); match; match = ruleRe.exec(css)) {
  const selector = match[1].trim().replace(/\s+/g, ' ')
  if (!selector.includes('.note-')) continue
  for (const raw of match[2].split(';')) {
    const decl = raw.trim()
    if (!decl) continue
    const prop = (decl.split(':')[0] ?? '').trim()
    // A named component token definition is the one place px is allowed (5.1).
    if (prop.startsWith('--note-')) continue
    const value = decl.slice(decl.indexOf(':') + 1)
    if (/#[0-9a-fA-F]{3,8}\b/.test(value)) violations.push({ selector, decl, reason: 'raw hex colour' })
    if (/rgba?\(/i.test(value)) violations.push({ selector, decl, reason: 'rgba()/rgb() colour' })
    if (/\b\d*\.?\d+px\b/.test(value)) violations.push({ selector, decl, reason: 'raw px value' })
  }
}

/**
 * Row internals: class names that appear in row markup and therefore render inside the
 * lifted drag card as well as inside the editor.
 */
const ROW_INTERNALS = [
  'note-row',
  'note-check-row',
  'note-bullet-row',
  'note-line',
  'note-box',
  'note-bullet',
  'note-para',
  'note-link',
  'note-grip',
]

/**
 * `.note-dragging` is the deliberate exception, stated at its rule: it hides a row that
 * is in the air, and the card carries .note-surface, so scoping it to the surface would
 * hide the card itself.
 */
const SCOPE_EXCEPTIONS = ['.note-dragging']

const misscoped: { selector: string; reason: string }[] = []
for (let match = ruleRe.exec(css); match; match = ruleRe.exec(css)) {
  for (const part of match[1].split(',')) {
    const selector = part.trim().replace(/\s+/g, ' ')
    if (!/^\.note-editor(-shell)?\s/.test(selector)) continue
    if (SCOPE_EXCEPTIONS.some((entry) => selector.includes(entry))) continue
    const hit = ROW_INTERNALS.find((name) => selector.includes(`.${name}`))
    if (hit) {
      misscoped.push({
        selector,
        reason: `.${hit} renders in the drag card too, which has no editor ancestor: scope it to .note-surface`,
      })
    }
  }
}

console.log('Notes CSS lint')
console.log('='.repeat(64))
if (misscoped.length > 0) {
  for (const entry of misscoped) console.log(`  FAIL  ${entry.selector}\n        ${entry.reason}`)
}
if (violations.length === 0 && misscoped.length === 0) {
  console.log('ok    no raw hex, rgba, or non-token px in the notes CSS scope')
  console.log('ok    every row rule is scoped to .note-surface, so the drag card matches it')
  process.exit(0)
}
for (const violation of violations) {
  console.log(`FAIL  ${violation.reason}\n        ${violation.selector} { ${violation.decl} }`)
}
console.log(
  `\n${violations.length} value violation(s) and ${misscoped.length} mis-scoped rule(s). Colours come from` +
    ' the palette tokens; opacity from color-mix on a token; px only inside a --note- component token' +
    ' (5.1); row rules on .note-surface, not .note-editor (8.0).',
)
process.exit(1)
