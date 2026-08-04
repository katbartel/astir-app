// Every notes check, in the order that matters.
//
//   node scripts/notes-suite.mts
//
// The container smoke check runs FIRST and stops the run if it fails. That order is
// the lesson of one incident: all four suites were green, `next build` was green, and
// the app would not start, because none of it had ever run in the environment that
// runs the app. A green editor suite is evidence about the editor, not about the app.
//
// See docs/notes-editor.md, the architecture section, for which of these run in the
// container and which are host-only by nature.

import { spawnSync } from 'node:child_process'

type Suite = { name: string; script: string; where: 'container' | 'host'; stopOnFail: boolean }

const suites: Suite[] = [
  {
    name: 'container smoke: does the app run at all',
    script: 'scripts/container-smoke.test.mts',
    where: 'container',
    stopOnFail: true,
  },
  {
    name: 'note persistence: real API + real localStorage, no fakes',
    script: 'scripts/note-persistence.test.mts',
    where: 'container',
    stopOnFail: false,
  },
  { name: 'migration mapping', script: 'scripts/migrate-notes.test.mts', where: 'host', stopOnFail: false },
  { name: 'schema', script: 'scripts/note-schema.test.mts', where: 'host', stopOnFail: false },
  { name: 'editing semantics', script: 'scripts/note-editing.test.mts', where: 'host', stopOnFail: false },
  { name: 'regression script', script: 'scripts/note-regression.test.mts', where: 'host', stopOnFail: false },
  { name: 'CSS scope lint', script: 'scripts/note-css-lint.test.mts', where: 'host', stopOnFail: false },
]

// The harness bundles the real component, so a stale bundle silently tests the code
// as it was. Building here rather than remembering to: running a suite against an old
// bundle is the same class of mistake as verifying on the host and shipping to a
// container.
console.log('building the harness bundles')
const built = spawnSync('node', ['scripts/harness/build.mjs'], { encoding: 'utf8' })
process.stdout.write(`${built.stdout ?? ''}${built.stderr ?? ''}`)
if (built.status !== 0) {
  console.log('the harness did not build, so nothing below would test the current code')
  process.exit(1)
}

const results: { name: string; where: string; ok: boolean; tail: string }[] = []

for (const suite of suites) {
  console.log(`\n${'='.repeat(72)}\n${suite.name}  [${suite.where}]\n${'='.repeat(72)}`)
  const run = spawnSync('node', [suite.script], { encoding: 'utf8', stdio: 'pipe' })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  process.stdout.write(output)
  const ok = run.status === 0
  const lines = output.trim().split('\n')
  results.push({ name: suite.name, where: suite.where, ok, tail: lines[lines.length - 1] ?? '' })
  if (!ok && suite.stopOnFail) {
    console.log('\nStopping: the app does not run, so nothing below would mean anything.')
    break
  }
}

console.log(`\n${'='.repeat(72)}\nSuite summary\n${'='.repeat(72)}`)
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name.padEnd(46)} [${result.where}]  ${result.tail}`)
}
const failures = results.filter((result) => !result.ok).length
console.log(failures === 0 ? '\nall suites green' : `\n${failures} suite(s) failed`)
process.exit(failures > 0 ? 1 : 0)
