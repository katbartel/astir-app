// Bundles the real NoteEditor for the harness. See docs/notes-editor.md 14.
import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const out = resolve(repo, 'scripts/.harness')

mkdirSync(out, { recursive: true })

await build({
  entryPoints: [resolve(here, 'mount.tsx')],
  outfile: resolve(out, 'bundle.js'),
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2022',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"development"' },
  alias: {
    // Same alias Next resolves, so the component's own imports work unchanged.
    '@': resolve(repo, 'frontend/src'),
    // One React copy. Two is a hook-dispatcher error that reads as a Tiptap bug.
    react: resolve(repo, 'node_modules/react'),
    'react-dom': resolve(repo, 'node_modules/react-dom'),
  },
})

// The real stylesheets, not a copy of the rules: a layout assertion against
// hand-written CSS would prove nothing about the app.
copyFileSync(resolve(repo, 'frontend/src/styles/tokens.css'), resolve(out, 'tokens.css'))
copyFileSync(resolve(repo, 'frontend/src/styles/app.css'), resolve(out, 'app.css'))
copyFileSync(resolve(here, 'harness.html'), resolve(out, 'harness.html'))

console.log('harness built: scripts/.harness/harness.html')
