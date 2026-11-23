---
name: trip-answers
description: Use whenever the user asks a factual question about the Asia trip (China, Korea, Japan, Hong Kong, Thailand, Dec 2026 to Feb 2027) or one of its places, areas or countries, such as logistics, bookings, tickets, visas, weather, costs, prices, opening hours, transport, routes, safety, food or what to do. Answer in the conversation, then publish the answer as a card on the trip site (answers/*.md, ./atr answers publish).
---

# Trip answers: answer, then publish a card

The traveler reads the trip site on a phone during the trip. Answers worth keeping go there as cards: one Markdown file per answer in `answers/`, shown on the place or area page, on Places › Answers, and on Today.

## When to publish

Publish when the user asks something about the trip and the answer is reusable trip knowledge: hours, prices, how to get somewhere, whether to book, what a place is like, a visa rule, a comparison of two options.

Skip the card for questions about the code, the site or the deploy, for chit-chat, for opinions still being worked out together, and for one-word clarifications. If unsure, publish.

## Workflow

1. **Answer in the conversation first.** Research properly (the place's page in `places/` or `areas/`, then the web), cite your sources, and say when something could not be confirmed.
2. **Write the file** `answers/<YYYY-MM-DD>-<short-slug>.md`. The date is today's (when it was asked) and also goes in `asked`. The slug is a few lowercase words, e.g. `yu-garden-passport`.
3. **Check it:** `./atr answers --check`.
4. **Publish it:** `./atr answers publish answers/<file>.md`. It works from any checkout and never touches your working tree: it copies only that file into a temporary worktree of `origin/main`, opens a pull request, merges it, then waits until the site's `/healthz` reports the merge commit and opens the card's pages as the read-only guest to see the card on them, so "live" means the site really shows the card. If it prints `pages not opened`, the guest login is missing or refused: say that the page was not seen instead of calling it checked. If it prints `PROBLEM on <url>`, the card is deployed but that page does not show it: look into it. To read any other page of the site yourself, use `./atr site get <path>` (plain `curl` and web fetches only get the sign-in page). Add `--dry-run` to preview a publish.
5. **Tell the user in one line** that the card is live, with the `card:` link the command printed (copy it, never build it by hand). Only say "live" when the output ends a line with `the card is live.` (`the site serves <sha> … the card is live`). If it says "deploy not confirmed", say exactly that. If publishing fails, say so plainly, quote the error and leave the file in place for a retry.
6. **Tidy up:** the command prints how to drop your local copy (`rm answers/<file>.md`, or `git restore` for an edited one). Run it, or a later `git pull` will refuse to overwrite the file.

## The file

```markdown
---
question: Do I need my passport to enter Yu Garden?
asked: 2026-11-21
about: yu-garden
tldr: "Yes: tickets are sold by passport number, and the guards check it at the gate (as of Nov 2026)."
sources:
  - title: Yu Garden official ticketing page
    url: https://example.com/yu-garden-tickets
---
Book on the official mini-program 1–3 days ahead; morning slots open at 08:30 UTC+8.

- The window sells walk-up tickets on weekdays in winter.
- Bring the physical passport, not a photo.
```

- `question`: the traveler's question, lightly cleaned (fix typos, keep their words).
- `tldr`: one or two sentences that stand alone. It is what most people read.
- Body: the full answer. It may be empty when the tldr says it all. Markdown is limited to paragraphs, `- ` lists, `1. ` lists, `**bold**`, `*italic*`, `` `code` `` and `[text](https://…)`. No headings, tables, images or HTML (HTML shows as text).
- `sources`: a list of `{ title, url }`. Include them.
- `updated: YYYY-MM-DD`: add it when you correct an answer later.
- YAML: put any value that contains `: ` or starts with a quote, `[` or `*` in double quotes.

## Content rules

- Write for the traveler reading on a phone months later: self-contained, tldr first, no "as I said above", no reference to this conversation.
- **Every clock time carries its UTC offset:** `09:00 UTC+8`. China, Hong Kong and Singapore UTC+8, Thailand UTC+7, Korea and Japan UTC+9, Brazil UTC−3 (none of them changes clocks during the trip).
- **Prices in the local currency first, then BRL**, the way the site does it: `¥330 (≈ R$ 273)`, `₩12,200 (≈ R$ 45)`, `฿500 (≈ R$ 78)`, `HK$100 (≈ R$ 66)`, `S$5.60 (≈ R$ 25)`. Symbols and number format follow `fmtLocal` and `fmtBRL` in `platform/lib/render/util.js` (R$ uses pt-BR digits: R$ 1.234). Get the rate with `./atr fx CNY` (or JPY, KRW, THB, HKD, SGD) and say in the body which rate and date you used.
- **Dated facts say as of when:** "(as of Nov 2026)", "the 2026 timetable".
- **Never put secrets or sensitive personal data in a card:** booking references, passport or document numbers, the address of where the traveler sleeps, card details, phone numbers, passwords. The read-only guest login sees every card and git keeps the history forever, even after a delete.

## `about`: what the card is about

Pick the most specific thing that exists, in this order: a place id, an area id (a city or region), a country id, else `trip`.

- Find ids with `./atr answers --ids` (add `--country japan` to narrow it), or from the folders: `places/<country>/<city>/<id>/place.yaml`, `areas/<country>/<id>.yaml`.
- Countries: `china`, `korea`, `japan`, `hong-kong`, `thailand`, `singapore`.
- A question about getting to a city goes on its area, not on one place in it.
- If a place and an area share an id, write `place:<id>` or `area:<id>`.
- The id must already be on `origin/main`; the publish command says so if it is not.

## Correcting or removing an answer

- **Correct:** edit the file (add `updated:`), run `./atr answers --check`, then `./atr answers publish answers/<file>.md` again.
- **Remove:** `./atr answers publish --remove answers/<file>.md`, then delete your local copy if you have one.
- `--no-merge` stops after opening the pull request (when the user wants to review first).
