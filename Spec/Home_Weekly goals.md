Spec: weekly home with goals (v1)

Implements the redesigned Home screen: sphere with whisper, one Log application button, and a "This week's goals" card with arc gauges. Replaces the day-page Today layout. Reference mock: astir-home-weekly-v7-states.html. When this spec conflicts with AGENTS.md, this spec wins for the points listed in section 12; everything else in AGENTS.md still applies (tokens, spacing, type, copy rules, motion).


1. Page structure (top to bottom)


Date line: "Week of {start} to {end}" (12.5px uppercase muted, letter-spacing .05em). Week runs Monday to Sunday. Same-month example: "Week of June 29 to July 5".
Greeting h1: "Good morning/afternoon/evening, {name}".
The living sphere, floating directly on the paper background. No card, no border, no container.
Whisper line under the sphere (normal Instrument Sans, ink2, centered).
One ghost button, centered: "Log application". Opens the existing log-application modal.
Card "This week's goals" (card recipe: card bg, line border, r-lg 14, card shadow, 22px x 26px padding). Section label 12.5px uppercase muted with an "Edit" text action right-aligned (12px, muted, hover ink2).


Removed from Home, do not re-add: the In motion glance, the prep/rest/activity chip row, the Mon-Sun day dot strip.

2. Activities (fixed vocabulary, v1)

idNameCounted howUnitapplyApplicationsAutomatic: each application saved through the log-application modal counts oneapplicationsnetNetworkingManual, on the goal tile (minus and plus)people reached out toprepPrep for interviewsManual, binary: Mark donedone or notdocsPaperworkManual, binary: Mark donedone or notrestRest daysInferred: a fully passed day (Mon-Sun, local time) with zero logged activity and zero applications counts as one rest daydays

Rules:


There is no manual logging of applications and no manual logging of rest. Apply follows pipeline data (deleting a job record decrements). Rest counts itself.
Rest is only evaluated for days that have fully passed. Today never shows as rest.
Manual counts are editable in place all day, every day of the current week, via the tile controls. There is no editing of past days' logs in v1 (the weekly totals are what they are; Sunday forgives everything).
Data model: activity types are an extensible enum; v1 ships exactly these five.


3. Weekly goals


A goal = activity id + optional numeric target. Numeric: apply (1-15, default 5), net (1-10, default 3), rest (1-4, default 2). Binary: prep, docs.
Up to 5 goals (the whole list). No minimum. A week with no goals is fully supported and never nagged about.
Goals belong to one week. At week rollover (Sunday 24:00 local) unmet goals dissolve silently: no summary, no carryover, no copy about what was missed. Monday starts unwritten.
Progress counts up from what is logged. Once a goal's target is reached it is "met": met goals stop displaying numbers permanently (see 5.4). Logging beyond the target changes nothing visually.


4. Goals card states


Unwritten (no goals set, includes first run): line "Set up your goals for this week" (normal muted helper copy), then disabled goal tiles at 45% opacity with empty tracks, stable labels, and no numbers. Disabled tiles show info icons without hover tooltips. No Edit action in the label while unwritten.
Active: grid of goal tiles (section 5). Edit action visible.
Setup/edit (section 6).


5. Goal tile

Geometry: tile border line, r-md 12, padding 16px 12px 14px, contents centered in a column.


Gauge: 96x56 SVG semicircle, radius 40, stroke width 8, round caps. Track stroke: --line. Sweep stroke: the activity's deep color (--gold-deep, --net-deep, --rest-deep, --prep-deep, --docs-deep). Sweep fill fraction = min(count, target)/target. Sweep animates on change: stroke-dashoffset transition .5s cubic-bezier(.4,0,.2,1).
Gauge center, in progress: count (19px, 600, ink) over "of {target}" (11px muted). Binary goals in progress show "not yet" (11px muted) and no number.
Label under the gauge: the goal phrase (12.5px, 500, ink2), e.g. "Apply to 5 jobs", "Reach out to 3 people", "Two rest days", "Prep for interviews", "Finish CV and profile".
Met state: tile bg --gold-soft, border transparent, label color --gold-text, sweep full, center replaced by a check glyph stroked in the activity deep color. Numbers do not return.
Note lines are retired. Goal tiles use labels, gauges, and info icons only.
Controls row (min-height reserved so tiles align):

net: two 24px round ghost icon buttons, minus and plus. Plus increments and triggers a small sphere flare; minus decrements to a floor of 0. Both remain available after the goal is met.
prep, docs: one ghost pill "Mark done"; when done it reads "Marked done" and tapping again un-marks.
apply, rest: no controls.



Grid: 3 columns, gap 12. 1 goal = 1 column, 2 = 2 columns, 4 = 2x2, 5 = three on top and two centered beneath (6-column grid, tiles span 2, tile 4 starts at column 2, tile 5 at column 4).


6. Setup and edit flow


Entry: "Shape the week" (unwritten state) or "Edit" (active state). Replaces the card body in place; no modal.
Hint: "Pick what this week is for. Numbers are yours to set, and only you see them." (12.5px muted)
One row per activity (all five, fixed order: apply, net, prep, docs, rest): row border line, r-md, 10px 14px, tap toggles selection. Selected: --gold-soft bg, label --gold-text. Numeric rows show a stepper (minus, value, plus, 22px round buttons) only while selected; the row label re-renders live with the number ("Apply to 6 jobs").
Footer: ghost button "Done", text action "Same as last week" (restores previous week's goal set and targets), and a right-aligned note "That is the whole list" shown only when all five are selected.
Editing mid-week keeps existing logged counts; changing a target re-evaluates met state from the same counts. Removing a goal does not delete its logs.
Leaving setup with nothing selected returns to the unwritten state. Legal, quiet, never questioned.


7. Whisper lines (v1 set)

Priority order, first match wins:


All goals met (at least one goal set): "Everything you set out to do is done. The rest of the week is a gift."
No goals set: "An open week. Shape it, or take it as it comes."
Default: "Warm and steady. Today is still unwritten."


Hard rules: the whisper never states remaining amounts, never references unmet goals, never says "you haven't" or "still" or "behind" in any phrasing. No exclamation marks. Future variants (returning after quiet days, late-week invitations) are out of scope for this change.

8. Sphere behavior changes

Everything in AGENTS.md section 5 stands except as amended here:


Today's wash: the sphere's identity stays gold at all times. When today has logged manual activities, a fixed share of particles (40%) washes to the corresponding particle colors, split evenly if several: net #B06A50, docs #5E8A86, prep #8E76B4. The wash is staggered over ~2.5s per particle. The share never varies with volume: one networking log or five produce the same wash. Kind of day, never amount.
Applying contributes no foreign color: an application flares (existing 1.4s flare) and the wash rule keeps gold dominant.
The wash resets to full gold at day rollover.
The rest tint (sage) is no longer user-triggered (the rest chip is gone). Sage belongs to the sleepy/away behavior: after quiet days, reduced pace and glow may carry the rest particle color #66855F. Never below visible breathing.
Increment actions (+ on networking, Mark done) trigger a small flare (about a third of the application flare).
prefers-reduced-motion: all ambient animation off, washes apply instantly, flares reduced to a brief glow change.


9. Snackbars


"Application logged." on saving an application.
No snackbars for manual goal logging: the tile change is the feedback. Snackbars are acknowledgments, never undo mechanisms.


10. New tokens

Add to tokens.css (docs is a new activity color, eucalyptus, pending final eyeball but ship with these values):

--docs: #7E9C99;
--docs-soft: rgba(126,156,153,.16);
--docs-text: #4E706D;
--docs-deep: #5F827F;

Sphere particle colors (canvas only, add to the existing particle palette constants): net #B06A50, docs #5E8A86 (prep #8E76B4 and rest #66855F already exist).

11. Temporary demo state switcher (build this, mark it clearly temporary)

A dev-only control for reviewing states. Ship behind a flag (e.g. NEXT_PUBLIC_DEMO_STATES=true or a ?demo=1 query param), never in production builds.


Fixed bottom-left panel: snack-bg surface, r-md, 10px 12px padding, menu shadow. Label "Preview states" (10.5px uppercase, snack-text at 55% opacity).
Five buttons (12px, snack-text, left-aligned, r-sm, hover rgba(243,237,225,.1), active state gold-soft-on-dark with #F0CE8B text):

"Week not set up": no goals, no logs, no applications this week.
"Mid-week, in progress": goals apply 5 / net 3 / rest 2; counts apps 3, net 1, one inferred rest day.
"Three goals, all done": same goals, all targets met, one networking log today (wash visible).
"All five goals, mixed": apply 4 / net 3 / prep / docs / rest 2; counts apps 2, net 2, prep done, docs not, rest 1; today logged net and prep (blended wash).
"All five goals, done": all five met; today logged net, prep, docs.



Switching state resets in-memory week data to the preset and re-renders the goals card, whisper, and sphere wash. It must exercise the real rendering and derivation code paths, not a parallel mock renderer.
Remove path: the whole switcher lives in one component plus the preset data; deleting that component and the flag removes it cleanly.


12. AGENTS.md amendments (apply these edits alongside the build)


Rule 1 becomes: "No outcome counts anywhere, ever: no totals of applications sent, no response rates, no rejection tallies, no streaks. Self-set weekly effort goals are the one exception: their count-up progress (numbers and arc gauges) may appear inside the This week's goals card on Home, and nowhere else."
Section 2 screen 1 (Today) is replaced by this spec's Home description; the day check-in chips and week dot strip entries are removed.
Section 5 sphere: add the today's-wash rule (8.1-8.4 above); rest tint reassigned from user action to away behavior.
Add the docs tokens (section 10) to the token table.
Component list: add "Goal tile" (section 5) and "Week setup row" (section 6.3) as new component recipes; remove "Day dot" and check-in "Chip".


13. Out of scope for this change


Editing past days' logs.
Whisper copy beyond the three lines in section 7.
Any month or history view.
Over-completion states, celebrations, or animations beyond the existing flare.
Custom (user-authored) activity types.
The Sunday-night rollover moment's visual treatment (rollover itself must work per 3.3; any dedicated copy or animation for it comes later).
