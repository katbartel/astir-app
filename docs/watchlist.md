# Watchlist

Source of truth for Watchlist v1 decisions. Astir's Watchlist is a quiet company tracker, not another inbox.

## Product Shape

You add companies you care about. Astir uses existing job-board fetched roles, then shows roles from those companies only when they match your global keywords and location preferences.

If you apply, you log it. The role leaves Watchlist and the application appears in All applications, or Pipeline if the selected status is an interview stage. If you are not interested, you skip it. Skipped roles are tucked behind the page kebab so they can be restored or logged later.

Manual role pasting is out of scope for v1.

## Main List

Companies are shown in one list, always in this order:

1. Companies with the most recent openings.
2. Companies with less recent openings.
3. Companies with no openings.

Role-bearing companies are collapsed by default. The whole company header opens the row, and there is no chevron. The header shows company name, a connection icon only when networking is in progress or established, a "New" chip when any visible matched role was first seen in the last 48 hours, and a kebab menu.

Companies with no openings stay in the same list. They are more muted and do not expand into an empty state.

## Role Rows

Watchlist role rows follow the Job board row pattern: title, open-posting icon, optional "New" chip, location, posted date, Log application icon, and Skip icon.

Watchlist rows omit work mode labels for now. Matching still respects global keyword and location preferences. Remote is allowed as a preference, but Watchlist is not remote-only.

Freshness sorting uses posting date first. If posting date is unavailable, first seen date is the fallback.

Roles older than 90 days stay off the normal Watchlist surface for consistency with Job board.

## Company Menu

Company kebab items for v1:

1. Reconnect, only when Astir cannot pull roles from a saved careers link.
2. Edit.
3. Remove.

Edit includes careers page link, company name, Connections, and Notes. Notes use the shared rich notes editor with the full toolbar, matching Pipeline notes. We are starting with careers page only. Landing page is out of scope for v1.

Open careers page was considered, but removed for now to keep the menu focused.

Per-company alerts were considered, but descoped. Alerts should be a single global setting in Settings or Preferences.

## Connection Icon

The old outreach chip and popover are removed. Company rows show only a passive connection icon when there is active connection context. The icon is derived from the connection rows in Edit:

1. No icon: no networking added.
2. Gold: at least one non-closed connection exists.
3. Green: at least one non-closed connection can refer.

The icon has a tooltip, but no inline explanatory copy. Company details live in Connections and Notes inside Edit.

## Connections

Connections live inside the company Edit modal. Each row has name, status, details, and notes.

Statuses for this first pass:

1. Found.
2. Reached out.
3. Talking.
4. Can refer.
5. Closed.

Decision: use person-level rows instead of a single company-level status. This lets the user track several possible contacts without adding a separate Connections page yet. The company row icon stays passive and summarized, so Watchlist does not become another inbox.

## Skipped Roles

Skipped roles are reachable from the Watchlist page kebab as "Skipped roles." This matches the hidden-role pattern already used elsewhere without creating tabs inside tabs.

Skipped roles are grouped by company, but they are not inside expandable company cards. From there, the user can restore a role or log it as an application.

Decision: use "Skipped roles" rather than "Hidden roles." "Skipped" matches the user action better and feels less mysterious.

## Source Health

We need clear states so the user never thinks Astir is watching a board that has silently stopped working.

Implemented now:

1. Unresolved company with a saved careers link shows a warning icon.
2. Tooltip copy: "Looks like we cannot pull roles from this link. Check that it is correct, or reconnect. Some careers pages may not be supported yet."
3. Kebab shows Reconnect for that state.

Still outstanding:

1. Define exact backend source health statuses and timestamps.
2. Decide how many failed pulls turn a healthy source into a failing source.
3. Add a state for a source that used to work but has stopped pulling.
4. Add a state for a source that has not been checked successfully within the expected sync window.
5. Finalize copy once the backend behavior is settled.

## Decisions

1. Watchlist is a company tracker, not a manual pasted-role list. This keeps it from becoming another spreadsheet.
2. Matched means global keyword match plus global location match.
3. Company role areas are closed by default to avoid a feed.
4. Company rows get a "New" chip when something fresh exists inside.
5. No-opening companies stay in the same list, muted, after role-bearing companies.
6. Skipped roles sit behind the page kebab for recovery.
7. Logging from Watchlist removes the role from Watchlist and shows the application in the right application surface.
8. Company management starts with careers page link, company name, and notes.
9. Global Watchlist alerts belong outside company rows.
10. Notes belong inside Edit rather than as their own company menu item. Chosen because it keeps the kebab focused and uses the same rich editor as other app notes.
11. Networking status is derived from connection rows, not edited directly. Chosen because it keeps the company row honest and avoids asking the user to maintain the same state twice.

## Outstanding Product Questions

1. Where exactly should the global Watchlist alert toggle live: Settings or the existing preferences area?
2. Should company Notes later move out of Edit if we add more connection management?
3. Should skipped roles share a single cross-app skipped surface someday, or stay local to Watchlist and Job board?
4. Should connection follow-up dates and reminders become part of MVP, or wait until after the basic connection tracker feels useful?
