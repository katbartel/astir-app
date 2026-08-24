# Notes editor, visual findings round 1

Ten findings from using the rebuilt editor. Most are the recovered CSS not
matching what the old editor did, or rules that were never written down.

**Before starting:** confirm three earlier corrections landed. If any did not,
say so.
1. Placeholder decoration extended to cover an empty section title.
2. All three shortcuts bound: cmd K link, shift cmd E quote, shift cmd O
   section.
3. Grip on checkbox rows only. Plain text and bullet rows are not draggable by
   mouse.

**Rule for every fix below:** write it into section 5 of the spec as a stated
rule, not only into the CSS. The reason these regressed is that the polish
lived in code and nowhere else, so deleting the code deleted the polish. If a
fix cannot be expressed as a rule, say so and we will decide what to do about
it.

---

## 1. One shared left edge

The most visible problem, and it covers findings 1, 2 and 4.

Every row's content starts at the same left edge, and that edge is the left
edge of the checkbox, not the left edge of a checkbox's text.

- A plain text row starts where a checkbox starts.
- A bullet row starts where a checkbox starts.
- The "Add a note" placeholder starts where a checkbox starts. It is currently
  indented to the text column.
- The same applies inside a section body. Every row in the body shares one
  left edge with every other row in that body.

This reverses a choice you made deliberately and flagged: you aligned
paragraph text to checkbox text and called section 5 rule 1 satisfiable two
ways. It is not ambiguous any more. The box defines the edge. Nothing sits
inboard of it.

State the rule in section 5 in those words, and assert it: on a note
containing a text row, a bullet row, a checkbox row, and the placeholder, all
four have an identical left offset, at top level and inside a section body.

## 2. Grip vertical centring

The grip is not vertically centred on a checkbox row. It sits low.

Centre it on the checkbox box, not on the line box or the row box. Assert the
grip's vertical centre equals the box's vertical centre, on a single line row
and on a row whose text wraps to two lines.

## 3. Disclosure arrow direction

Currently inverted: collapsed points up, expanded points right.

Collapsed points right. Expanded points down. The usual convention, no
invention. Assert both states.

## 4. No chip behind the arrow

Remove the rounded square background behind the section arrow, in every state
including hover. The arrow alone.

## 5. Dragging does not work

The grip appears on hover and dragging does nothing at all.

Scope: checkbox rows only, and it must work in both places, loose in the note
and inside a section body.

The drag suite passes while this is broken, so something is being verified
that is not what ships. That is the fourth instance of the same pattern, after
the host versus container mismatch, the faked save, and the stale bundle. Find
what the suite is actually exercising, fix the suite first so it fails, then
fix the drag. Report what the gap was.

## 6. Enter inside a collapsed section

With a section collapsed and the caret at the end of its title, pressing Enter
adds rows into the hidden body. Two presses go in invisibly and the third
appears below the section.

Correct behaviour: Enter expands the section and adds one empty row, visibly,
as the first row of the body. Caret on that row.

Add the general rule as an invariant: no keystroke ever places the caret or
new content inside a collapsed body without expanding the section first. This
extends what we already ruled for Backspace and Delete.

If you read this as conflicting with "a collapsed section is sealed, no
auto-expand", it does not. That rule is about drag targets, where the list
would reflow under the pointer mid-gesture. An explicit keystroke is a
different case. Note the distinction in the spec so the two rules do not look
contradictory.

## 7. Link popover, redesigned

The current popover is a box inside a box and it reads wrong. Rebuild it as a
single surface that is itself the field.

Surface:
- One rounded surface, radius 14. No inner input element with its own border.
- A grey outline in the same tone as the internal divider, plus the menu
  shadow.
- Height 46. Padding 16 on the left, 6 on the right.
- A 1px vertical divider between the URL text and the icons.

States, two of them, one field:
- Empty: placeholder "Paste the link". A tick icon on the right.
- Typing or editing: the URL as editable text. Same tick, in the same
  position, so nothing moves when you start typing.
- Saved: the URL as editable text, then two icons, open in new tab and
  delete. No tick.

Icons:
- Outline only. No gold fill, no solid button.
- Resting state is the bare icon. Hover adds a soft tinted square and the
  tooltip.
- Tooltips: "Save", "Open in new tab", "Remove link".

Removed:
- No pencil or edit action. The URL text in the popover is directly editable.
- No second field for the link's display text.

## 8. Link text is one unbroken token

Space is blocked inside a link. Typing a space with the caret inside linked
text does nothing.

Typing a space at the end of a link exits link mode. The space and everything
after it are plain text.

So a link never spans a space. A two word link is not possible; removing and
re-adding is the path. The user can edit the linked text itself in the note,
adding characters before, after, or in the middle, and it stays one link as
long as no space is involved.

Write this in section 6 with the reason, because it also makes a class of bug
impossible: a link can never swallow the rest of a line.

## 9. Tooltip shortcut treatment

In toolbar tooltips the shortcut is jammed against the label and competes with
it.

- 14px gap between label and shortcut.
- Label slightly brighter than now.
- Shortcut dimmer, derived with color-mix from the snackbar text token rather
  than a new token, matching the pattern sanctioned for the link underline.

Keyboard symbols in the shortcut are allowed under the AGENTS.md 4.6
amendment, since the character is the content rather than a drawing standing
in for an icon.

---

## Method

Fix these, do not report between them. Come back once with what changed, the
full suite result, which assertions are new, and anything you decided on my
own behalf.

The CSS lint still applies. Any recovered or new value with no token gets a
proposed token rather than an inline value.

--write stays parked.
