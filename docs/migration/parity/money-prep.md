# Parity: slice G, Money, To do and Bag

Old behaviour: `game/public/trip.js` (`viewMoney`, `verdictHtml`, `currentBudget`, `viewTodo`, `viewBag`, `taskRow`,
`openTasks`, `SCHEMA`, `openEdit`, `submitEdit`, the click handler), `game/public/trip.css`, `game/lib/trip.js`
(`moneyTotals`, `priceCheck`, `dailyOf`, `RATES`), the Prep sub-tabs and badge in `game/public/game.js`.
New: `apps/web/src/routes/(app)/money/**`, `(app)/prep/**`, `src/lib/features/money/**`, `src/lib/features/prep/**`.

Checked by `src/lib/features/money/{model,links}.test.ts`, `src/lib/features/money/record/schema.test.ts`,
`src/lib/features/prep/model.test.ts` (units), and `e2e/money.spec.ts`, `e2e/todo.spec.ts`, `e2e/bag.spec.ts` on
desktop, pixel and iphone. Screens checked at 390x844 in light and dark with playwright-cli.

## Money (`#/money` → `/money`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "R$ X planned · cap R$ Y", title, lede | `PageHead` | Same text. |
| [x] | "Log expense" button in the head | Same | Hidden for the guest. |
| [x] | Empty state "No budget yet / Set a cap and the daily budgets to start." when no budget, no fixed cost and no cap | `Empty` | Adds a "Set the cap" button for the owner (the old page had no way in from the empty state except the head button). |
| [x] | Summary card: plan total, "planned of your R$ cap", "R$ N to spare" / "R$ N over" chip, ⋯ edits settings | Summary `Card` | |
| [x] | Stack bar fixed / ground scaled to max(cap, plan), legend with Flights and fixed, Days on the ground, Spare, Logged so far | `Bar` (SVG widths, no inline style) | |
| [x] | Booking check: country (budget rows), what (bed/food/other), price, currency (RATES), live verdict with conversion, ok / warn (≤125 %) / over wording and colours | `PriceCheck` + `checkVerdict` | Same strings (unit tests). |
| [x] | Booking check default: where you are today, else the next stay abroad, else the first row; changing country sets its currency | Same (`currentBudget`, `checkDefaults`) | |
| [x] | Booking check choice kept while moving between pages (`T.chk`) | Module state in `PriceCheck` | Kept per tab, not across reloads, as before. |
| [x] | "Per day, by country" heading with ground total and days | Same | |
| [x] | Country card: flag and name, ⋯ edit, "R$ X / day · N days · R$ planned", bed/food/other split bar and legend | `BudgetCard` | Days come from the trip config, as before. |
| [x] | Spent so far line and mini bar, red when over | Same | |
| [x] | "How to pay in X" `<details>` with linkified text | `Collapsible` + `RichText` | Clock times in the text get the country's UTC offset (new: the old page had no `data-tz` here). |
| [x] | "How money works on this trip" tips block, linkified | Same | No offset on its times: the tips cover every country, so none is guessed (as before). |
| [x] | "Flights and fixed costs" with total, rows with Paid / To pay / Estimate chip, title, note, amount, ⋯ | Same | |
| [x] | Empty "No fixed costs / Add flights, insurance or the eSIM here." and "Add cost" button | Same | Button hidden for the guest. |
| [x] | "Spending log" heading with Bed / Food / Other totals | Same | |
| [x] | Empty "Nothing logged yet / Tap Log expense…" | Same | |
| [x] | Log grouped by date (newest first, then latest written), day header "Sun 6 Dec" with the day's R$ total, "No date" group | `spendGroups` | |
| [x] | Expense row: category chip (k3/k4/k5), note or category or "Expense", country, R$ amount, local amount and currency when not BRL, ⋯ | Same | |
| [x] | R$ conversion of an expense from the hard-coded RATES | `trip.write` mutation (`amountBRL` in `normalizeTripFields`) | Same rates and rounding, computed on the server instead of the browser. |

## Add / edit sheet (all six collections)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Forms for tasks, bag, budget, fixed, spend, settings with the old fields, labels and select options | `RecordDialog` + `recordSchema` | |
| [x] | Title "Add …" / "Edit …" | Same | |
| [x] | New expense starts today, as Food, in the current country with its currency | `initialValues` | |
| [x] | Task form shows the effective status (done from the old `done` flag) | Same | |
| [x] | Bag category suggestions from existing categories (datalist) | Same (native `datalist` on `Input`) | The plan named a Combobox; the native list is kept because it is what phones handle best and it allows a new category. |
| [x] | Number fields: empty is 0; strings trimmed | `submitData` | |
| [x] | "Give it a name first." / "Enter the amount first." when the main field is empty | Same toasts | |
| [x] | First field focused on Add | `onOpenAutoFocus` | |
| [x] | Save closes the sheet and toasts "Added" / "Saved"; a failure toasts the error | Same | Pessimistic, as before. An edit sends only the fields that changed (plan section 11); an edit that changed nothing closes without a write or toast. |
| [x] | Delete asks for a second tap ("Tap Delete again to remove it."), toasts "Deleted"; settings has no Delete | Same | |
| [x] | Cancel, Escape and a backdrop click close without writing | Dialog | |
| [x] | Form shaping: task `done` mirrors status, bag qty defaults to 1, new bag item unpacked, new doc gets order max+1 | `trip.write` mutation | Moved to the server by the backend layer. |
| [x] | Background refresh held while the sheet is open (`tripSheetOpen()`) | `holdRefresh()` | |

## To do (`#/todo` → `/prep/todo`, and `/prep`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "N open · M done" (or "To do"), title, lede naming the departure day before the trip | Same | |
| [x] | "Add task" button | Same | Hidden for the guest. |
| [x] | Empty "No tasks yet / Add the first thing you need to do." | Same | |
| [x] | Progress bar "M of N done" | `Progress` | Bar uses the theme primary colour (the old one was green); ui components are not restyled. |
| [x] | Open tasks in order, "Everything is ticked." when none, then a "Done · N" group | Same | |
| [x] | Row: tick box ("Mark done: …" / "Mark not done: …"), title, In progress and Suggested chips, linkified note, ⋯ | `CheckRow` | An in-progress task shows a half-ticked box (the old half-filled box). |
| [x] | Tap the box: done ↔ to do, an in-progress task becomes done | `toggleTaskFields` | Pessimistic, as before; the box is disabled while its write runs. |
| [x] | Prep tab badge and To do sub-tab badge with the open count | Sub-tab badge in `PrepNav` | The section tab badge in the bottom bar belongs to the shell (not this slice); see below. |
| [x] | Prep tab opens To do | `/prep` shows To do | Also reachable as `/prep/todo`. |

## Bag (`#/bag` → `/prep/bag`)

| | Old view or action | New equivalent | Note |
|---|---|---|---|
| [x] | Eyebrow "P of N packed" (or "Bag"), title, lede | Same | |
| [x] | "Add item" button | Same | Hidden for the guest. |
| [x] | "Untick all" shown when something is packed; arm, then "Confirm: untick all" / "Cancel" | `AlertDialog` ("Untick all N packed items?", Cancel, "Confirm: untick all") | Different on purpose: a dialog instead of buttons that change in place. One `trip.bagUntickAll` write instead of one POST per item. Toast "All items unticked". |
| [x] | Empty "Bag is empty / Add the first thing to pack." | Same | |
| [x] | Progress bar "P of N packed" | `Progress` | |
| [x] | Groups by category in first-seen order ("Other" when none), header with packed/total | Same | |
| [x] | Row: tick box ("Packed: …"), item, "×N" when qty ≠ 1, note, ⋯ | `CheckRow` | |

## Guest (read only)

| | Old behaviour | New | Note |
|---|---|---|---|
| [x] | Sees every view | Same | |
| [x] | Write controls present, every write refused with 403 and a toast | Add, edit, delete and untick-all controls hidden; tick boxes shown disabled | Different on purpose (task brief): nothing a guest can tap tries a write. The booking check still works (it writes nothing). |

## Not matched, or owned elsewhere

- Clock times in task, bag and fixed-cost notes and in the money tips get no UTC offset, exactly as on the old page:
  their zone is unknown (before departure the traveler is in Brazil, later anywhere), and `TzText` does not guess.
- The Prep badge on the section tab (old `secBadge.prep`) is not shown: the bottom bar is `AppShell.svelte`, a
  shared file. `openTasks(trip)` in `src/lib/features/prep/model.ts` gives the count when the shell adds it.
- Offline reads and queued writes (the old site had none) are slice L's.
