# Astir

A job search app built on one belief: focus only on what you control, and make everything else disappear.

<img width="994" height="501" alt="image" src="https://github.com/user-attachments/assets/27e5491c-fa1e-4945-bb86-162f15ef9721" />


## The idea

It started with a simple frustration. I wanted to be intentional about where I apply: a specific set of companies whose values fit mine. But job boards are noisy and full of nonsense, and some of the best companies never post there at all, they just quietly put openings on their own site. So the seed of Astir was a watchlist: your own curated list of companies that matter to you, watched for relevant openings, instead of drowning in a feed.

<img width="1105" height="599" alt="image" src="https://github.com/user-attachments/assets/f72d0a90-359f-4604-8421-1b51d0f2b999" />


Then it grew into something bigger, because the noise problem is everywhere. Open LinkedIn during a job search and it's fear on a loop: layoffs, AI taking every job, everyone panicking. None of it helps you get hired. Astir is built as the opposite of that feed.

The core insight: rejections tell you almost nothing. You rarely learn why. They hired internally, they changed their mind, someone was two percent better for this one opening. None of that makes you worse, and dwelling on it costs energy you need for the things that actually move the search: a sharp CV, real outreach, focused prep, and rest.

So the app is opinionated about attention:

- Only live things are visible. The pipeline shows what responded and what's in progress. Everything you've applied to sits out of sight. You can look, but the app never pushes it at you. Whether you've applied to 30 or 300 is irrelevant; the three that replied are the whole game.
- No counts, anywhere. No totals of applications sent, no response rates, no streaks. Those numbers measure anxiety, not progress, so they don't exist in the interface at all.
- Nothing gets "rejected." A door closes, you mark it closed, one click, it disappears back into the hidden list. No red banners, no ceremony, no dwelling. Move on.
- One loud moment. "I heard back!" is the only celebratory button in the app. The moments worth feeling are the ones going forward, so everything else stays quiet on purpose.
- Rest is a feature, not a gap. Rest and prep days count the same as applying. Nothing breaks or shames you for stepping back.
- Apply, then forget. The flow is built for it: do the work well, send it, and let it leave your head so the head is free for prep and for rest.

A calm operating system for one of the most stressful projects a person runs.

## Where it's headed

The job search is the emergency room. The bigger idea is everything before it.

Almost everyone loses their own career history. Years at one job, and when it's time to move, nobody remembers what they actually did. The wins are scattered across old notes, buried in tools they no longer have access to, or simply gone. So the vision is a career companion you keep all along: a single source of truth where you dump your weekly progress in whatever messy form it comes, and AI shapes it into sharp, reusable summaries over time (with confidentiality built in, since this is your work history, not your employer's data).

Then, when change comes, wanted or not, everything is already prepped: your record, your proof points, your story. No archaeology under pressure. And for people searching while still employed, the same calm, intentional flow works without the urgency, which is exactly how a search should feel.

## What exists today

Early stage, front-end only, no backend yet. Data lives in localStorage. Currently working:

- Home: the weekly view, with application logging, a conditional "heard back" card, and weekly goals you set yourself, soft targets with quiet progress, never streaks or totals
- Watchlist: the curated list of companies and roles that matter, with alerts, role matching, and one-tap application logging from a role
- The design system: a warm parchment palette with a single gold accent, everything driven by a token file (raw values inside components are treated as bugs)

Pipeline: first working version. Interview-stage pursuits with notes and stage tracking. The full design (stage history, the hidden archive behind it) is done and being built toward.

<img width="1028" height="554" alt="image" src="https://github.com/user-attachments/assets/21e12e13-cf41-4d92-a44b-8ec391f46b99" />

The full product rules and design system live in AGENTS.md.

## How it's built

Solo, end to end: product, design, code. Designed conversationally with Claude, built in VS Code with Codex as the pair, and used daily on my own live job search, so every rough edge gets felt by the one person who can fix it the same day.

Plain HTML, CSS, and JavaScript. No framework, no build step: open index.html and it runs. The whole look is driven by a single token file (tokens.css), and state persists in localStorage. Bricolage Grotesque and Instrument Sans. Light mode first; a warm dark mode is planned.
