# Notes editor, visual findings round 2

Findings 6, 8 and 9 landed and are correct. The tooltip treatment, the link
popover structure, and the collapsed-section Enter behaviour all read right.

Four new findings. Same rule as round 1: every fix gets written into the spec
as a stated rule, not only into the code.

---

## 11. The drag lifts the text, not the row

The lifted element is a small pill containing only the row's text. Four
symptoms, one cause:

- The checkbox is not in the lifted card. It stays behind.
- The card hugs the text width instead of filling the row.
- The origin row still renders, as a ghosted copy below the card.
- The gap renders as a grey filled bar instead of empty space.

Correct behaviour, all four already stated in the spec:

- The lifted element is the entire row: grip, checkbox, and text, as one card.
- Full row width of the editor. Not fitted to the text.
- Nothing renders at the origin.
- The placeholder gap is empty space. No fill, no grey bar, no dashed outline.

This is the same defect the stages reorder had before it was fixed, and the
rule has been in the spec since then with nothing asserting it. That is the
second time a spec rule shipped unimplemented because no assertion stood
behind it, after the toolbar flip and clamp.

Assert, and write these first so they fail:
- The lifted card's width equals the row's width, within a pixel.
- The lifted card contains the checkbox element.
- No element with the row's text renders at the origin during the drag.
- The gap has no background colour and no border.

## 12. Toolbar chrome regressed

Every button now carries its own border, and the whole toolbar has a gold
outline. The tooltips are right; the container is wrong.

Target treatment:
- Container: card surface, radius 14, menu shadow, and exactly one 1px border
  in the divider tone (the same `--line2` value used for the internal
  divider and now for the link popover outline).
- Buttons: no border, no outline, in any state. Resting is the bare glyph.
  Hover is a soft tinted square.
- Active state: gold-soft square with gold-text glyph. That is the only gold
  in the toolbar.
- The divider stays between the link button and the checkbox button.

Prime suspect is the `outline-offset: 1px` to `var(--border-thin)` change from
the visual sweep. Check every place that change touched, not only the toolbar.

Assert: no toolbar button has a computed border or outline in resting, hover,
or active state, and the container has exactly one 1px border.

## 13. Link popover tooltips

Two problems.

1. The tooltip overlaps the popover itself. It must sit entirely outside the
   popover's bounds, flipping to the other side when there is no room.
   Assert that the tooltip's box does not intersect the popover's box, at the
   top of the viewport and at the bottom.

2. Copy is wrong. The three tooltips read exactly "Save", "Open", "Delete".
   Not "Open in new tab", not "Remove link".

## 14. Toolbar type buttons toggle the wrong thing

With the caret on a checkbox row, pressing the active checkbox button unticks
the box. On an unticked row it does nothing at all. Both are wrong.

These buttons change a row's **type**. They must never touch `checked`.

| Row now | Button pressed | Result |
|---|---|---|
| check, ticked | checkbox | becomes a plain paragraph, text kept, checked discarded |
| check, unticked | checkbox | becomes a plain paragraph, text kept |
| paragraph | checkbox | becomes an unticked check, text kept |
| bullet | bullet | becomes a plain paragraph, text kept |
| paragraph | bullet | becomes a bullet, text kept |
| section | section | dissolves, per the existing rule |

The only thing that changes `checked` is the checkbox's own box in the row.
Nothing in the toolbar does.

Assert all six transitions, and assert specifically that pressing the checkbox
button on a **ticked** row removes the marker rather than unticking it. Each
transition is one undo step, through the existing undo loop.

---

## Method

Fix all four, do not report between them. Come back once with what changed,
the full suite result, which assertions are new, and anything decided without
asking.

The CSS lint still applies. Any value with no token gets a proposed token.

`--write` stays parked.
