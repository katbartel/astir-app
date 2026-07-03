# AGENTS.md, Astir

You are building Astir with Kate. Read this fully before any change. It is the source of truth for what the product is, how it looks, and how changes must be made. When anything here conflicts with an ad-hoc request, say so and propose the system-level fix.

---

## 1. What Astir is

A calm job-search companion. Core thesis: "apply and forget." Apply mindfully, log it, let go. The app only surfaces what is alive; everything else rests out of view.

Non-negotiable product rules:
1. No counts of applications anywhere, ever. No totals, no "14 applied," no streak numbers, no response rates.
2. Pipeline shows only roles that progressed to interview stages. Applied and closed jobs are stored but hidden.
3. The archive ("View all applications") is reachable but deliberately not easy (kebab menu on the Pipeline title, with a one-line explainer inside the menu).
4. "I heard back!" is the only loud button in the app.
5. Rest is a feature, not a gap. Rest and prep days count the same as applying.
6. No guilt mechanics: nothing breaks, snaps, or shames. Absence makes things sleepy, never dead.

## 2. Screens

1. **Today** (home): greeting, the living sphere (hero), whisper line, action row (Add a job solid button, then Prep day / Rest day chips), This week strip, In motion glance (max 2-3 items).
2. **Watchlist**: companies with matched open roles. "Add company" ghost button. Each role row has a quiet "I applied" action opening the add-job modal prefilled. Companies with no matches say so gently.
3. **Pipeline**: response-only. "I heard back!" hero button, kebab with archive link, cards for active pursuits (company, role, next step line, stage pill). Quiet closing line, no counts.
4. **Add-job modal**: opens from Today and Watchlist. Link (optional), Company, Role, Applied date (default today), Status (default Applied). Saving logs the day, flares the sphere, shows snackbar "Application added. Today is done."

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
| --line | rgba(70,60,40,.10) | borders |
| --line2 | rgba(70,60,40,.16) | input and chip borders |
| --gold | #DFA83F | THE accent: solid buttons, the sphere, today ring |
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
| --snack-bg | #3A342A | snackbar surface |
| --snack-text | #F3EDE1 | snackbar text |

Sphere particle colors (richer than UI accents, canvas only): gold #BA7C1E, rest #66855F, prep #8E76B4.

Rule: gold is the only accent that may appear solid. Rest and prep exist only as soft tints and states, never as buttons.

### 3.2 Spacing

Scale: 4, 8, 12, 16, 24, 32, 48, 64. Nothing else. If a layout seems to need 20px, it needs 16 or 24.

Common applications: card padding 24-26px, gaps between buttons 8, section gaps 22-24, main content padding 44-56.

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
1. **Bricolage Grotesque** (display): h1 27px/600, modal title 19px/600, brand 17px/600. Never for body.
2. **Instrument Sans** (everything else): body 14.5, controls 13.5/500, secondary 12.5, meta 12, tiny 11.5. Italic Instrument Sans for whisper/gentle lines (13.5, ink2 or ink).

Section labels: 12.5px, uppercase, letter-spacing .05em, muted.
No third font. No Newsreader (reads as a Wispr Flow copy).

### 3.5 Elevation and motion

Shadows: cards `0 1px 3px rgba(60,50,30,.04)`, menus `0 6px 24px rgba(60,50,30,.12)`, modal `0 18px 50px rgba(46,42,35,.22)`.
Motion: eases, never snaps. Micro-transitions .2-.3s. Sphere flare ~1.4s ease-out. Respect prefers-reduced-motion everywhere (all ambient animation off).

## 4. Components (build once, reuse always)

1. **Solid button**: gold bg, on-gold text, pill radius, 9px 18px padding, 13.5/500. Only for "Add a job" and "I heard back!" (600 weight, ✦ prefix).
2. **Ghost button**: transparent, line2 border, ink2 text, same geometry.
3. **Chip** (check-in): ghost geometry; selected state = state-soft bg, no border, state-text color.
4. **Stage pill**: 11.5/500, 4px 11px, pill radius, state-soft bg + state-text.
5. **Day dot**: 30px circle. applied = gold-soft bg + small star glyph (gold-deep); rest = rest-soft + leaf stroke; prep = prep-soft + book stroke; quiet = line2 ring only; today = gold ring. Never a number inside.
6. **Card**: card bg, line border, r-lg, card shadow.
7. **Row** (list item): card recipe with r-md, 14-18px padding.
8. **Kebab menu**: 30px square trigger, menu = card surface with r-md, hint text (11.5 muted) above items.
9. **Modal**: r-xl, 28px padding, backdrop rgba(46,42,35,.32). Esc and backdrop close. Inputs: paper bg, line2 border, 10px radius, gold focus ring.
10. **Snackbar**: bottom-center, snack tokens, 11px radius, auto-dismiss ~3.5s, no progress bar.
11. **Rail**: 200px, rail bg, active item = card bg + soft shadow. Brand = mini orb + "Astir" in display font.

## 5. The living sphere (signature element)

Canvas particle sphere. It is a creature, not a chart.

Behavior model, THE most important rule: **identity is always warm gold; today tints it; history never accumulates in it.**
1. Default: gold particles drifting in layered wavy currents (no rigid rotation). Individual particles ride sine-field flows through the ball volume.
2. Rest day: ~45% of particles wash to rest color, staggered over ~2.5s, pace slows (~0.55x), glow dims slightly.
3. Prep day: same wash in prep lilac, pace ~0.8x.
4. Application added: wash clears to full gold, warm flare (speed and glow pulse, ~1.4s decay).
5. "I heard back!": the big flare, larger swell and longer decay. The one loud moment.
6. Away for days: pace and glow reduce further (sleepy), never below visible breathing. Waking is gentle, no guilt copy.
7. The sphere must NEVER encode quantity. No proportion of color may map to how many applications exist.

Reference implementation exists (Kate has the HTML prototypes): ~1200 particles, fibonacci-seeded, radius share 0.55-1.0, pre-rendered radial-gradient sprites per color, depth-sorted, alpha by depth, DPR-capped at 2. Keep 60fps; if perf suffers, reduce N before touching the look.

Rail mini-orb: static gradient ember (CSS), soft halo breathing at ~6s, echoes flares only. No other reactions. The sphere lives ONLY on Today; nothing follows the user across screens.

**Whisper line**: single italic sentence under the sphere. One voice: warm, brief, adult. Never chirpy, no exclamation marks except "I heard back!". This is also where gentle suggestions appear (e.g. after a long steady stretch: suggest a rest day, framed as earned, and it counts).

## 6. Copy rules (apply to ALL strings, UI and code comments)

1. No em-dashes, ever. Use commas, colons, parentheses, or periods.
2. Never use the word "land" except for physical ground.
3. Never use the word "signal" except for the Signal app.
4. Never use "resting" as a label for stored/applied jobs. (As a verb for rest days it is fine.)
5. No counts in copy: no "X applied," "X in progress" for hidden items, no streak numbers.
6. Sentence case. Plain verbs. Buttons say what happens: "Add application," not "Submit."
7. Empty states are invitations, not apologies. Errors say what happened and what to do.

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
