# AGENTS.md, Astir

You are building Astir with Kate. Read this fully before any change. It is the source of truth for what the product is, how it looks, and how changes must be made. When anything here conflicts with an ad-hoc request, say so and propose the system-level fix.

---

## 1. What Astir is

A calm job-search companion. Core thesis: "apply and forget." Apply mindfully, log it, let go. The app only surfaces what is alive; everything else rests out of view.

Non-negotiable product rules:
1. No outcome counts anywhere, ever: no totals of applications sent, no response rates, no rejection tallies, no streaks. Self-set weekly effort goals are the first exception: their count-up progress (numbers and arc gauges) may appear inside the This week's goals card on Home, and nowhere else. All applications has the second and only archive exception: a single count below the title, formatted as "1 application" or "[NUMBER] applications."
2. Pipeline shows only roles that progressed to interview stages. Applied and closed jobs are stored but hidden.
3. The archive ("All applications") is reachable but deliberately not easy (kebab menu on the Pipeline title, with a one-line explainer inside the menu).
4. "Move to pipeline" is a quiet ghost action. It is used when an application moves to screening, and does not use the solid gold primary button recipe.
5. Rest is a feature, not a gap. Rest and prep days count the same as applying.
6. No guilt mechanics: nothing breaks, snaps, or shames. Absence makes things sleepy, never dead.

## 2. Screens

1. **Home**: greeting, Applications card, conditional Screenings card, and the This week's goals card. No date line, sphere, whisper line, day check-in chips, week dot strip, or In motion glance. Greeting says "Welcome, [Name]" on first visit and "Welcome back, [Name]" after that, tracked in local storage.
2. **Watchlist**: companies with matched open roles first, sorted by freshest match. Header has "Watchlist" and an "Add company" ghost button. Company rows include name, bell, and kebab management. Role rows include a flame for postings first seen in the last 48 hours, an open-posting icon, and a Log application icon that opens the shared log-application modal prefilled. Companies with no matches live in the quiet disclosure.
3. **Pipeline**: response-only. "Move to pipeline" ghost button, kebab with archive link, cards for active pursuits (company, role, next step line, stage pill). Quiet closing line, no counts. Hired roles remain visible in Pipeline for now.
4. **Log application modal**: opens from Home and Watchlist. Link, Company, Role, Status, Applied date, and optional Note. Watchlist-origin opens prefilled and includes the one-line hint. Saving logs the day's application activity and shows snackbar "Application logged."
5. **Move to pipeline modal**: opens from Home after at least one application exists. Typeahead searches logged applications by company. Choosing a role moves it to 1st stage and shows a linked snackbar.

## 3. Design tokens (the only values allowed)

Everything below lives in one tokens file (tokens.css or the Tailwind theme). Components reference tokens by name. Raw hex values or arbitrary pixel values inside components are bugs.

### 3.1 Color

| Token | Value | Use |
|---|---|---|
| --paper | #F7F3EB | page background |
| --rail | #F0EAE0 | sidebar background |
| --card | #FFFDF8 | cards, modals, menus |
| --ink | #2E2A23 | headings, primary text |
| --ink2 | #57503F | body text |
| --muted | #8C8371 | secondary text, labels |
| --placeholder | rgba(140,131,113,.72) | placeholder text |
| --line | rgba(70,60,40,.10) | borders |
| --line2 | rgba(70,60,40,.16) | input and chip borders |
| --gold | #DFA83F | THE accent: solid buttons, today ring |
| --gold-hover | #D69C31 | solid button hover |
| --gold-deep | #C08F2B | gold icon strokes/fills on tints |
| --gold-soft | rgba(223,168,63,.16) | applied tints, pills |
| --gold-text | #8A6416 | text on gold-soft |
| --on-gold | #3A2E10 | text on solid gold |
| --rest | #8CA48A | rest state |
| --rest-soft | rgba(140,164,138,.18) | rest tints |
| --rest-text | #586E56 | text on rest-soft |
| --rest-deep | #6E8A6C | rest icon strokes |
| --prep | #9B84BC | prep state (lilac, NOT blue) |
| --prep-soft | rgba(155,132,188,.18) | prep tints |
| --prep-text | #6B5590 | text on prep-soft |
| --prep-deep | #7D659F | prep icon strokes |
| --docs | #7E9C99 | docs state |
| --docs-soft | rgba(126,156,153,.16) | docs tints |
| --docs-text | #4E706D | text on docs-soft |
| --docs-deep | #5F827F | docs icon strokes |
| --snack-bg | #3A342A | snackbar surface |
| --snack-text | #F3EDE1 | snackbar text |

Rail mini-orb colors: ember light #F0CE8B, ember mid #DCA246, ember deep #B87B1F.

Rule: gold is the only accent that may appear solid. Rest and prep exist only as soft tints and states, never as buttons.

### 3.2 Spacing

Scale: 2, 4, 8, 12, 16, 24, 32, 48, 64. Nothing else. If a layout seems to need 20px, it needs 16 or 24.

Common applications: card padding 24px, gaps between buttons 8px, section gaps 24px, main content padding uses named page tokens.

### 3.3 Radius

| Token | Value | Use |
|---|---|---|
| --r-sm | 8 | menu items, small controls |
| --r-md | 12 | list rows, menus |
| --r-lg | 14 | cards |
| --r-xl | 18 | hero card, modal |
| --r-pill | 999 | buttons, chips, pills, dots |

### 3.4 Type

Two fonts only:
1. **Bricolage Grotesque** (display): h1 27px/600, modal title and brand 19px/600. Never for body.
2. **Instrument Sans** (everything else): UI/body 14px, usually 400 or 500. Helper and support copy is normal, not italic.

Three font sizes total: h1 27px, display title 19px, UI/body 14px. Use color, weight, case, spacing, and layout for hierarchy instead of adding more sizes. Section labels use UI/body size, uppercase, letter-spacing .05em, muted. No third font. No Newsreader (reads as a Wispr Flow copy).

### 3.5 Elevation and motion

Shadows: cards `0 1px 3px rgba(60,50,30,.04)`, menus `0 6px 24px rgba(60,50,30,.12)`, modal `0 18px 50px rgba(46,42,35,.22)`.
Motion: eases, never snaps. Micro-transitions .2-.3s. Rail mini-orb flare ~1.4s ease-out. Respect prefers-reduced-motion everywhere (all ambient animation off).

## 4. Components (build once, reuse always)

1. **Primary button**: gold bg, on-gold text, pill radius, 9px 18px padding, 14/500. Used only for committed primary actions that should feel visually warm. No icon or special type treatment for text buttons.
2. **Ghost button**: transparent, line2 border, ink2 text, same geometry.
3. **Stage pill**: UI/body size at 500, compact pill padding, pill radius, state-soft bg + state-text.
4. **Card**: card bg, line border, r-lg, card shadow.
5. **Row** (list item): card recipe with r-md, 14-18px padding.
6. **Icon controls**: icon-only controls always use real SVG/icon components in stable square or round boxes. Never use text glyphs such as `✓`, `⌄`, `⋯`, `+`, or arrows as UI icons. Icons default to muted unless they communicate state. Gold is reserved for active state icons, new/fresh state icons, and hover states.
7. **Kebab menu**: 30px square trigger with a real three-dot SVG icon, menu = card surface with r-md, hint text in muted UI/body above items.
8. **Modal**: r-xl, 32px padding, backdrop rgba(46,42,35,.32). No X close button. Close by Cancel, Esc, or backdrop click only. Inputs: 40px height, paper bg, line2 border, 10px radius, gold focus border with no glow. Field labels are UI/body at 400. Placeholder text uses the placeholder token at 400. If a select, menu, or date picker is open inside a modal, outside click closes that layer first and does not close the modal.
9. **Select**: shared custom select over a hidden input. Trigger uses input recipe with a real down-chevron SVG. Open menu overlays the field so the selected option sits where the closed value was. Menu uses card surface, r-md, menu shadow, and UI/body size. Selected item is ink at 500 with a gold-deep SVG check on the right. Hover rows use hover-soft. Width is at least the field and may expand to fit the longest option on one line.
10. **Date picker**: shared popover calendar anchored to the field. Surface uses menu recipe, 12px padding, fixed calendar width token. Header is month and year on one line with 26px round prev/next buttons. Week starts Monday. Day cells use the calendar day-size token, today is an inset gold ring, selected is solid gold with on-gold text, adjacent-month days use line2-colored text, hover is hover-soft. The trigger uses a real calendar SVG icon. The full month fits without scrolling.
11. **Snackbar**: bottom-center, snack tokens, 11px radius, auto-dismiss ~3.5s, no progress bar.
12. **Rail**: 200px, rail bg, active item = card bg + soft shadow. Brand = mini orb + "Astir" in display font.
13. **Goal tile**: line border, r-md, compact centered column. Goals render five tiles per row on desktop. Gauge is a 96x56 SVG semicircle with line track and activity-deep sweep. Selected active goals show `current/target`, including over-target progress such as `7/5`; empty-state and unselected placeholder tiles show arcs and labels without counts. Labels are stable across empty, in-progress, and met states: Applications, Networking, Prep, Paperwork, Rest. Rest is the last tile. Met state is shown by the completed arc only, with no tile background change. The info icon sits beside the label and matches the label color in every tile state, using the standard dark tooltip plus a small triangle pointing to the icon. Disabled placeholder tiles show the icon without hover tooltip behavior. Editable goal tiles show a subtle split hover control behind the tile content: a vertical line through the tile, minus on the left, plus on the right, and tokenized grey tint states for base hover, side hover, and active. Applications do not have tile controls because they come from application records.
14. **Week setup row**: row border line, r-md, 10px 14px padding. Tapping toggles selection. Selected state uses gold-soft bg and gold-text label. Numeric selected rows show 22px round steppers.

Open surfaces own interaction. When a modal, dropdown, select, or date picker is open, tooltips are hidden and hover states below that surface do not respond until it closes. Tooltips and hover labels never extend over the rail or beyond the screen edge. They wrap at 40 characters or sooner without breaking words; if space is tight, move the tooltip body sideways while keeping the triangle centered on the icon or control it explains.

## 5. Home middle

Astir no longer has a living sphere or whisper line. Home's middle is made of two calm action cards.

1. **Applications card**: always visible. Label "Applications", helper copy "After you apply, record it here. Out of sight until the screening stage.", and ghost "Log application" button.
2. **Screenings card**: visible only after at least one application has been logged. Label "Screenings", helper copy "A company moved you forward. Bring the application into your pipeline.", and ghost "Move to pipeline" button.
3. **This week's goals card**: remains below the Home action cards. Empty state shows copy "Set up your goals for this week" directly under the card title, a header ghost "Set up" action, and all goal tiles as disabled arcs without counts. In-progress state shows "You're doing great, keep it up." under the card title. Completed state shows "You did it. Take a moment to savor it." under the card title. Unselected goals remain visible as disabled placeholder tiles. Do not show a "Same as last week" action. Applications progress comes only from logged applications. Rest progress is automatic for completed past days with no activity, with a user minus override when an automatic rest day should not count. Networking, Prep, and Paperwork are manually tracked by clicking their tiles.
4. **Rail mini-orb**: static gradient ember (CSS), soft halo breathing at ~6s, echoes application saves only. No other reactions.

## 6. Copy rules (apply to ALL strings, UI and code comments)

1. No em-dashes, ever. Use commas, colons, parentheses, or periods.
2. Never use the word "land" except for physical ground.
3. Never use the word "signal" except for the Signal app.
4. Never use "resting" as a label for stored/applied jobs. (As a verb for rest days it is fine.)
5. No outcome counts in copy: no "X applied," "X in progress" for hidden items, no streak numbers. Weekly effort goal progress may use numbers only inside the This week's goals card on Home. All applications may show a single title-area count: "1 application" or "[NUMBER] applications."
6. Sentence case. Plain verbs. Buttons say what happens: "Log application," not "Submit." Do not use exclamation marks in buttons. The hired modal title "Congratulations! 🎉" is the only product exclamation-mark exception.
7. Empty states are invitations, not apologies. Errors say what happened and what to do.
8. Missing table values may use an em dash only in table cells. Prose still follows the em dash ban.

## 7. How to make changes (system discipline)

1. **Tokens first.** A visual change request means: find the token, change the token, let it propagate. Never patch one component with a local value.
2. **Flag conflicts instead of complying silently.** If Kate asks for something that breaks the system ("make this button 15px font"), respond: name the conflict, then offer (a) the system-level change and what it touches ("bumping control text to 15 updates all buttons and chips") or (b) a reason this case is genuinely exceptional. Then wait for her pick.
3. **New values require a decision.** If a design genuinely needs a value outside the scales, propose adding it to the token file as a named token. No anonymous magic numbers.
4. **New components get specs.** Before building a new component, add its recipe to section 4 style: tokens used, geometry, states.
5. **Both modes from day one.** Light is built; dark ("dusk," warm dark, not navy) comes later, but never hardcode a light-only value where a token exists.
6. **One source of truth.** tokens.css / Tailwind theme is canonical. This file describes it; if they drift, fix the drift, do not fork.
7. When in doubt, quieter wins. The calm is the product.

## 8. Working with Kate

1. She gives numbered feedback, often with screenshots. Address every point. No regressions on points already settled.
2. Short, direct answers. No filler.
3. If a request is ambiguous, ask one precise question rather than guessing.
4. Speed over polish, within the system. Ship the change, keep the tokens clean.
5. When sharing a local build, include the normal app link and the preview-state link with `?demo=1`. Keep the demo panel updated with toggles for each screen's important states, especially empty and populated states.

---

## AGENTS.md amendment, July 2026: stack and build state

Replace all stack references in this file with the following. Where older sections mention Next.js, TypeScript, Tailwind, or shadcn/ui, this section wins.

### Stack (actual)

1. Plain HTML, CSS, and JavaScript. No framework, no build step, no package.json.
2. Files: `index.html` (shell), `app.js` (logic and screens), `styles.css` (components), `tokens.css` (all values). Screens are hash routes (`#today`, `#watchlist`, `#pipeline`, `#applications`).
3. State persists in localStorage under the key `astir.v1`. No backend exists. Sample data lives in `app.js` (`defaultWatchlist`, `sampleRolesForCompany()`, `makeDemoPreset()`, `presetApplications()`).
4. The rule "use shadcn components, never hand-roll" is retired. Components are hand-rolled on tokens. In exchange, every interactive component must meet this bar: full keyboard operation, visible focus states, Escape closes overlays, focus returns to the trigger on close, aria labels match tooltips.
5. Prototype files (`astir-*.html`, `astir-components.svg`) are design reference only. They define look and behavior, never implementation. Do not copy their raw values into the app.

### Screen status (keep current)

1. Home: built and working (applications card, conditional Screenings card, weekly goals).
2. Watchlist: built and working.
3. Pipeline: built and working.
4. All applications (archive): built and working. Final polish remains planned in `Pipeline_All_applications.md`.
5. Settings: not built.
6. Naming: the add-job modal is called "Log application" everywhere. "Add job" and "Add application" are retired vocabulary.

### Token exceptions (named, closed list)

1. Breakpoint: the app has exactly one breakpoint, 760px. CSS media queries cannot read custom properties, so the value stays raw, but it is documented at the top of tokens.css as `/* breakpoint: narrow = 760px (raw in media queries by necessity) */`. Any change to the breakpoint updates that comment and every media query together. No second breakpoint without a decision.
2. SVG geometry (viewBox, path coordinates, arc gauge angles) in `app.js` is geometry, not styling, and is exempt from the tokens rule. Colors inside SVG are NOT exempt: they reference tokens.
3. Archive table column minimum width is the named token `--table-column-min`.
4. Anything else outside the scales still requires a named token before use.
