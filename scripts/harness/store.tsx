// Exposes the real astir.v1 persistence functions so an integration test can
// drive them against real window.localStorage — no faked store. See
// docs/notes-editor.md 4.5: the goal harness fakes the store, so the localStorage
// round trip (write a task note, reload, read it back) had never run once.

import * as goals from '@/lib/goals'
import { readNote } from '@/lib/noteMigration'

declare global {
  interface Window {
    GOALS: typeof goals
    readNote: typeof readNote
  }
}

window.GOALS = goals
window.readNote = readNote
