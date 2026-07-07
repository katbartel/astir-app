# Pipeline screen and All applications page

Build to this spec. For anything visual this spec does not name, follow AGENTS.md tokens and the existing component recipes exactly. Reuse existing dropdown, modal, tooltip, and snackbar patterns; do not hand-roll new variants. Reference mock: `astir-pipeline-v8.html`.

## 1. Product amendments

1. Pipeline is response-only. It shows only applications in `1st stage`, `2nd stage`, `3rd stage`, `Offer`, and `Hired`.
2. `Rejected` is retired. Any stored `Rejected` stage is migrated to `Closed`.
3. The archive is a page, not a modal. It is reached through the Pipeline kebab and uses route `#applications`.
4. The archive menu label is `All applications`.
5. A count is allowed only on All applications, below the title: `1 application` or `[number] applications`.
6. Missing table values may use an em dash only inside table cells. The prose ban still stands.
7. Decorative sleepy `z` glyphs are allowed only in the Pipeline empty state.
8. The single product exclamation-mark exception is the hired modal title: `Congratulations! 🎉`.

## 2. Pipeline header

1. Row: h1 `Pipeline`, then the kebab trigger 4px to its right, spacer, ghost button `Log application`, then ghost button `Move to pipeline`.
2. Kebab trigger uses the shared 30px round icon control with tooltip `More`.
3. Kebab menu contains one item, `All applications`, with tooltip `View everything you have applied to.` Clicking navigates to `#applications`.
4. When Pipeline is empty, hide both header buttons and show them in the empty state. Keep the h1 and kebab.
5. When Pipeline is empty, the `All applications` menu item is disabled. Its hover copy is `This is where your applications will live`.

## 3. Pipeline cards

1. Show only applications in `1st stage`, `2nd stage`, `3rd stage`, `Offer`, and `Hired`.
2. Sort by most recent stage change, newest first. If no stage-change date exists, fall back to applied date.
3. Collapsed card is a single row: company name, dot separator, role title with truncation, optional open-posting icon, then the stage dropdown pinned right.
4. Clicking the card, except on the open-posting icon, dropdown, or note field, toggles expansion.
5. Expansion contains one meta line: `Posted: [date] · Applied: [date] · Location: [city] · Type: [Remote/Hybrid/On-site]`. Omit the Posted pair when there is no posting object.
6. Expansion also contains the notes field.

## 4. Notes field

1. Use a contenteditable area styled like the standard input: paper background, line2 border, input radius, gold focus border.
2. Placeholder: `Add a note`.
3. Notes autosave. No save button.
4. Store rich notes as structured data so checkbox notes can be reliable.
5. Typing `[]` converts in place to a checkbox that can be ticked and unticked.

## 5. Stage dropdown

1. Same visual recipe as the Status dropdown in Log application.
2. Item order: `Applied`, separator, `1st stage`, `2nd stage`, `3rd stage`, `Offer`, `Hired`, separator, `Closed`.
3. Changing a Pipeline card to `Applied` removes it from Pipeline and shows snackbar `Moved back to applied. Kept in all applications.`
4. Changing a Pipeline card to `Closed` removes it from Pipeline and shows snackbar `Closed. Kept in all applications.`
5. Changing a card to `Hired` keeps it visible in Pipeline for now and opens the hired modal.
6. Changing stage in All applications edits the row in place. Moving to `1st stage` or later makes the item appear in Pipeline.

## 6. Empty state

1. Shown when no applications are in interview stages.
2. Free-floating on page background, no card, centered.
3. Visual: static gold ember circle with slow breathing. Three decorative `z` glyphs rise from beside it and fade. Respect `prefers-reduced-motion`.
4. Copy: `Nothing in motion for now. When you hear back, it will show here. In the meantime, add companies to your Watchlist and log applications as you send them.`
5. `Watchlist` is an inline link to `#watchlist`.
6. Buttons below, centered: ghost `Log application`, then ghost `Move to pipeline`.

## 7. Hired moment

1. Trigger: stage set to `Hired` from anywhere.
2. Confetti uses existing token colors only and is skipped under `prefers-reduced-motion`.
3. Modal title: `Congratulations! 🎉`.
4. Body: `You accepted an offer at [Company]. This is a big deal, give yourself a pat on the back.`
5. If other applications are still in Pipeline stages, show the cleanup choice. `I will close them myself` is preselected. `Close them for me` marks every other Pipeline item `Closed`.

## 8. All applications page

1. Route: `#applications`.
2. Reached through the Pipeline kebab and snackbar links. It is not in the rail.
3. A quiet crumb `Pipeline` above the title returns to `#pipeline`.
4. Title row: h1 `All applications`.
5. Below the title, show the count: `1 application` or `[number] applications`.
6. A round search icon expands into an inline field that filters rows live on company and role.
7. Do not include `Delete all` in this build.
8. Content width may exceed the standard Home column.
9. Table is free-floating on paper, no card container. Hairline row separators only.
10. Columns: Company, Role, Stage, Location, Type, Posted, Applied, kebab.
11. Role carries the open-posting icon when a posting exists.
12. Stage is editable.
13. Company, Role, and Stage headers sort the table. Stage sorts in journey order.
14. Columns are resizable with hairline drag handles and a minimum width token.
15. Closed rows are styled identically to every other row.
16. Row kebab menu: Edit and Delete.
17. Delete opens a confirmation modal: title `Delete this application?`, body `This removes [Company], [Role] and its notes. There is no undo.`, Cancel ghost + Delete solid.

## 9. Move to pipeline flow

1. `Move to pipeline` opens the same typeahead modal from Home.
2. After picking an application, the second step asks what happened with the grouped stage menu.
3. Picking a stage applies the same stage behavior as Pipeline and All applications, including `Hired`.
