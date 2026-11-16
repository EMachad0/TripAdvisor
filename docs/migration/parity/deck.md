# Parity: slice E, the swipe deck, My calls, the place sheet, the cards and the note editor

Old behaviour: `game/public/game.js` (`viewDeck`, `deckCard`, `bindTopCard`, `swipeTop`, `advanceDeck`, `undo`,
`openPlace`, `openArea`, `closeSheet`, the notes block, `viewCalls`, `callRow`, `setCall`, the keyboard handler and
`refresh`), `game/public/game.css` and the card HTML from `platform/lib/render/index.js` (`renderPlaceCard`,
`renderAreaCard`, `flagChips`). New: `apps/web/src/lib/features/{deck,cards}/`, `components/shared/PlaceSheet.svelte`,
`routes/(app)/decide/{areas,swipe,calls}`.

Checked by `e2e/deck.spec.ts` and `e2e/calls.spec.ts` (desktop, pixel, iphone), the unit tests in
`features/deck/deck.test.ts` and `features/cards/model.test.ts`, and by looking at each screen with playwright-cli at
390x844 in light and dark mode.

## Decks: Areas round (`/decide/areas`, was `#/areas`) and Swipe round (`/decide/swipe`, was `#/swipe`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Header: "Step 1 · regions & cities" / "Step 2 · attractions", title, `done / total` with a meter | Same, with the shadcn Progress | |
| [x] | Country filter chips: All plus each country with cards left, counts, trip order | ToggleGroup with the same chips and counts; a filtered country with nothing left keeps its chip | |
| [x] | Deck order: new first, then (places) kept-area cities, others, skipped-area cities last; trip order, city, name | `areaDeck` / `placeDeck` in `deck.ts` | Unit tested. |
| [x] | Three stacked cards, depth offset and dimming | Same three cards, Tailwind depth classes | |
| [x] | Place card: photo or local name in large type, category, New, booking badge (rec variant), 🛸 Drone show, flag chips, city · area, name, local name, why (clamped), price (/ night for a bed), local price, time needed, kind | `PlaceCard.svelte` from `ContentPlace.card` | Built from structured data, no card HTML. Clock times in the why get their UTC offset (TzText). |
| [x] | Area card: photo, flag chips, name + local name, flag + region, best-for chips, why, highlights, suggested days, cost, winter note; highlights and winter hidden in the phone deck | `AreaCard.svelte` | Same rule for what the phone deck hides. |
| [x] | "Note" chip on a card with a note | Same chip in the meta row (places) or the chip list (areas) | |
| [x] | Drag the top card: lean stamps (Must / Skip / Maybe) past a 30 px dead zone, opacity by distance | Same, `leanOf` / `leanAmount` | |
| [x] | Release: past 110 px, or a flick over 0.6 px/ms past 40 px, swipes sideways; 110 px up is Maybe; else spring back | `releaseVerdict`, same numbers | Unit tested; e2e drags with the mouse on all three projects (pointer events, as before). |
| [x] | A tap (under 6 px of movement) opens the sheet | Same | |
| [x] | Fly-out animation (28° rotate, 420 ms), skipped with reduced motion | Same transforms, Web Animations API | The next card moves up while the old one flies, instead of after 300 ms. |
| [x] | Buttons Skip / Maybe / Must with key hints in the labels | Same (`aria-label` "Must (→)" etc.) | |
| [x] | Keys: ← Skip, → Must, ↑ Maybe, with the button press flash | Same | |
| [x] | Z or Backspace: undo; Space or Enter: open; N: note panel; Escape: close the note panel; Escape: close the sheet | Same | Keys are ignored in inputs and with Ctrl/Cmd/Alt, as before. |
| [x] | 300 ms lock between swipes | Same | |
| [x] | Haptics: 8 ms on Skip, 14 ms on Must and Maybe | Same (`navigator.vibrate`) | |
| [x] | `ms` (time on screen) sent with each swipe | Same | |
| [x] | Optimistic swipe; on failure "Couldn’t save: <reason>" and the card comes back | Same, Convex optimistic update rolls back | Guest and frozen refusals keep write.ts's wording. |
| [x] | Undo is local only: the card comes back unswiped and stays so until swiped again (survives background refreshes, not a reload); toast "Card is back. Swipe it again to change your call." | Same (`undone` set and `undoStack` in `cards/calls.svelte.ts`) | e2e checks that a reload shows the swipe again. |
| [x] | Undo button disabled when there is nothing to undo in this round | Same | |
| [x] | Details button, "N left" | Same | |
| [x] | Note panel over the card's text (below the photo on a phone, beside it on desktop): "Your note on <name>", Done, editor with the round's placeholder; never starts a drag | `DeckNotePanel.svelte` | Placed by fixed fractions of the card instead of measuring the text box. |
| [x] | Note button: active state, "Add a note (N)" / "Edit your note (N)", aria-expanded | Same | |
| [x] | Hint "Drag the card, or use ← Skip · ↑ Maybe · → Must" | Same text from md up | Different on purpose: hidden on a phone, which has no arrow keys. |
| [x] | Deck cleared: 🎉, "Deck cleared!" or "<Country> cleared!", Must / Maybe counts (areas: must-go count), next step button, "Show all countries" | Same | Next step links to `/decide/duels` and `/decide/board` (slice F routes). |
| [x] | No cards at all: 🗺️ "No area cards yet" / 🧭 "No places yet" with the old text and link | shadcn Empty with the same text and link | Not covered by e2e (the data set always has cards). |
| [x] | New curator cards land in the deck without a reload, toast "✨ N new cards from the curator" | Shell refresh (`refresh.svelte.ts`); the deck re-derives from content | Shell feature, not this slice. |
| [x] | (none: the client ignored the role) | Guest: calls, drag-to-swipe and the note button disabled, a read-only line; cards still open | Different on purpose: guest read only, as the plan asks. |

## The place / area sheet (`PlaceSheet`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Bottom sheet, 94svh, full page in an iframe (`/place/<id>?embed=1`, `/area/<id>?embed=1`, `#answer-<id>`) | shadcn Sheet from the bottom (top 3rem to the bottom edge), same iframe URL | |
| [x] | Bar: Close (Esc), name, Skip / Maybe / Must | Same (`VerdictSeg`) | |
| [x] | Note editor under the bar | Same (`NoteEditor`, variant sheet) | Guest: the note as text. |
| [x] | Place call: toast "<Verdict>: <name>"; optimistic, no rollback | Optimistic with rollback | Different on purpose (plan section 8). |
| [x] | Area call: toast, pushes an undo entry, closes the sheet | Same | |
| [x] | Close: button, backdrop, Escape (not while typing a note), `{atr:'close'}` from the page; notes flushed on close | Same | |
| [x] | `{atr:'open', id}` from the page opens that place | Same, in the same sheet | |
| [x] | Theme toggle reaches the iframe (`{atr:'theme'}`) | Same, from a watch on `<html data-theme>` | |
| [x] | Background refresh paused while the sheet is open | `holdRefresh()` | |
| [x] | Focus moves to Close on open and back on close | Focus trap of the Sheet | |
| [x] | (none) | Back on the phone closes the sheet (shallow history entry) | New, per plan section 8. |

## My calls (`/decide/calls`, was `#/calls`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Header "Your verdicts and the reasons", "My calls", "<n> calls · <m> notes", lede | Same | |
| [x] | Every swiped or noted card; areas first, then places; trip order, verdict, name | `callItems` | Unit tested. |
| [x] | Groups Areas / Places with counts; country sub-heads (areas only with 2+ countries) | Same | |
| [x] | Filters: All / Areas / Places; Must / Maybe / Skip (second tap clears); With notes; countries (2+); counts | ToggleGroups, same rules (`toggleCallsFilter`) | Filters are kept while moving between screens, as before. |
| [x] | Nothing matches: message ("No notes yet…" for an empty notes filter) and "Show everything" | Same | |
| [x] | Row: thumb (photo, flag or category icon), name, meta, opens the sheet | Same | |
| [x] | Row call: optimistic with rollback, toast "<Verdict>: <name>" | Same | |
| [x] | Note: editor when there is one, else "+ Add a note"; the new editor folds back if left empty | Same | |
| [x] | No calls yet: ✍️ text and "Start swiping" (to Areas while areas are left, else Swipe) | shadcn Empty, same text and link | Not covered by e2e (the data set has calls). |
| [x] | (none) | Guest: calls disabled, notes as text, no "Add a note" | Different on purpose. |

## The note editor (`NoteEditor`, everywhere)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Autosave 1200 ms after typing stops, and on blur | Same | |
| [x] | Saves for one card run in order; a save equal to the current note sends nothing | `saveNote` chain per card; the server also answers `unchanged` | |
| [x] | "Saving…", "Saved" (fades after 1.8 s), "Not saved"; toast "Couldn’t save your note: <reason>" | Same | |
| [x] | Escape or Ctrl/Cmd+Enter finishes editing (closes the deck panel) | Same | |
| [x] | Grows with the text up to a max height; tinted when there is a note; 2000 characters max | Same (`field-sizing-content`) | |
| [x] | On a phone, scrolls into view above the keyboard on focus | Same | |
| [x] | Other editors of the same card follow a save unless being typed in | Same, through the live `feedback.state` | |
| [x] | Unsaved text is saved when the editor goes away (sheet closed, filter changed, panel closed) | Same | |
| [x] | Refresh paused while a note is focused or saving | `holdRefresh()` | |

## Rows not ticked

None. Two rows have no end-to-end test because the e2e data set never reaches that state: the empty decks and the
empty My calls page. Their text and links were compared with the old code by hand.

## Shared pieces other slices use

`features/cards` (index.ts): `PlaceCard`, `AreaCard`, `CardFlags`, `VerdictSeg`, `NoteEditor`, `NoteSnip`, `VERDICTS`,
`setCall`, `verdictsOf`, `undoLast`, `canUndo`, `saveNote`, `haptic`, `langOf`. `PlaceSheet` keeps its frozen props;
`SheetTarget` is also in `components/shared/PlaceSheet.types.ts` so type-aware lint in `.ts` files can see it.
