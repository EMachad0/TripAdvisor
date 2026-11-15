> **Superseded 2026-11-12:** Thailand was cut to 8 nights (Jan 2–10), Korea moved to Jan 10–20 and Japan now starts Wed Jan 20. `docs/TRIP.md`, `config/trip.yaml` and the trip page calendar are current; trust them over the dates below.

# Handoff: new route and work/vacation split (2026-11-11)

The traveler re-planned the second half of the trip. Your job: **update the Calendar on the trip page** to match the plan below. Only do it when the traveler asks you to; this file is the brief.

- Trip page: https://claude.ai/artifact/4E3SGCCdrUzfD5JhsGFNtW. Read it with the Artifact tool (`read`) first, then edit its data with `ArtifactData` (collections include `legs`, `fixed`, `settings`; learn the shapes from the page and the existing rows before writing).
- Screenshot of the calendar before this change: `/Users/eliton.silva/.t3/userdata/attachments/0aadfd81-513c-4c24-9038-6337d83fc7ad-e2a37e5c-8927-402d-acc3-2c2b69b55a2b.png`
- Never write to the `places` collection without asking the traveler (rule from `docs/TRIP.md`).

## Why it changed
- The traveler works remotely for part of the trip, on São Paulo hours (09:00–18:00 BRT), which means **night shifts** in Asia (Bangkok 19:00–04:00, China 20:00–05:00, Korea/Japan 21:00–06:00).
- They have **16 vacation days** left after the first block and want **at least 2 weeks of work in a row**. Thailand is the main work base. Korea gets a short work stretch, and Japan and Hong Kong are all vacation.
- Ending in Hong Kong puts them there for **Lunar New Year (Sat Feb 6, 2027)**. Carnaval Mon–Wed (Feb 8–10) are days off at work, so the return moves to around Feb 9.

## The new plan

| Dates | Where | Nights | Status |
|---|---|---|---|
| Dec 1 – Dec 3 | São Paulo | — | Unchanged |
| Dec 4 – Dec 5 | Flights (TK280 lands PVG Dec 6 05:10) | — | Unchanged |
| Sun Dec 6 – Sat Jan 2 | China | Dec 6 – Jan 1 (27) | Vacation until **Thu Dec 24**; work **Mon Dec 28 – Thu Dec 31** (Jan 1 is a holiday) |
| Sat Jan 2 | Fly China → Bangkok | | Visa-free limit: must leave China by about Jan 4 |
| Sat Jan 2 – Wed Jan 13 | Thailand (Bangkok, maybe Chiang Mai) | Jan 2 – Jan 12 (11) | Work |
| Wed Jan 13 | Fly Bangkok → Seoul | | Thu Jan 14 is also fine. It's a workday, and the shift before ends 04:00 Bangkok time |
| Wed Jan 13 – Fri Jan 22 | Korea (Seoul, Hwacheon day trip) | Jan 13 – Jan 21 (9) | Work nights Jan 13–15 and 18–20; weekend Jan 16–17 free; **vacation from Thu Jan 21** |
| Fri Jan 22 | Fly Seoul → Tokyo | | |
| Fri Jan 22 – Thu Feb 4 | Japan (Tokyo → Kyoto → Osaka) | Jan 22 – Feb 3 (13) | Vacation |
| Thu Feb 4 | Fly Osaka KIX → Hong Kong | | |
| Thu Feb 4 – Tue Feb 9 | Hong Kong | Feb 4 – Feb 8 (5) | Vacation until Fri Feb 5, then weekend + Carnaval days off |
| Tue Feb 9 → Wed Feb 10 | Fly Hong Kong → São Paulo | | Date and carrier not decided (being priced) |
| Thu Feb 11 | São Paulo | | Back at work |

**Vacation and work**
- Vacation 1: until Thu Dec 24. The start date is set with HR. Dec 25–27 is a holiday plus weekend.
- Work: Mon Dec 28 – Wed Jan 20, without a break (China, then Thailand, then Korea).
- Vacation 2: **Thu Jan 21 – Fri Feb 5** (16 days). Then Feb 6–7 weekend, Feb 8–10 Carnaval off.

If the calendar can show work days versus vacation days (or day notes), mark them. If it can't, say so to the traveler rather than inventing a field.

## Remove from the calendar
- The old order: Korea Jan 2–10, Japan Jan 10–19, Hong Kong Jan 19–22, Thailand Jan 22–30.
- Flight **ET629 Bangkok → Addis Ababa, 01:35 Sun Jan 31**, and São Paulo on Jan 31.
- São Paulo Feb 1–6 and the **flight on Sun Feb 7**. **Ask the traveler what the Feb 7 flight was before deleting it**; it may be a separate Carnaval trip.

## What's fixed and what isn't
- Fixed: São Paulo Dec 1–3, flights Dec 4–5, China from Dec 6.
- Everything from Jan 2 on is **not booked**: mark it "dates not fixed". The flight home is not booked either.

## Events that pin the dates (for day notes, if the calendar has them)
- Fri Dec 25: Christmas. Thu Dec 31: New Year's Eve falls during a China work night (open question below).
- Korea: Hwacheon ice festival (Jan 9–31; free weekend Jan 16–17), LCK matches from about mid-January (Wed–Sun, around 17:00, before work nights), Seoul Plaza ice rink (until about Feb 7).
- Japan: **Ado live in Osaka, Jan 30–31** (lottery tickets, not secured). Setsubun on Feb 3. Daikoku PA car meet on a weekend night (Sat Jan 23 is the free one).
- Hong Kong: New Year's Eve flower markets on Fri Feb 5, Lunar New Year Sat Feb 6 (night parade), harbour fireworks around Feb 7 (date to confirm).

## Open items (don't resolve them silently; tell the traveler)
1. **Flight home**: being priced in the [Price flight home from Hong Kong (Feb 2027)](t3-thread://v2/0fa98fe4-0f39-4d14-a59c-391fd4ef1f6d/mcp:launch:310bd30fa509c21abdf5f2b62ddb27719cacfc0f5a0147fa0c1f84df5c5f235b) thread (change the Ethiopian ticket or buy a new one-way, Feb 8 or 9).
2. **Working from China** (firewall, VPN, company policy): see the [Working remotely from China: VPN and connectivity](t3-thread://v2/0fa98fe4-0f39-4d14-a59c-391fd4ef1f6d/mcp:launch:9e368a6c9902d16c79cbd2266ff4fc93f7844e8fff4304d58104fbadff5ec9c3) thread. Plan B would move that work week to Hong Kong.
3. New Year's Eve (Dec 31) is a work night in China unless the company gives the day off.
4. Vacation 2 starts on a Thursday: the traveler should confirm with HR.
5. Book Hong Kong beds early (Lunar New Year prices). Thailand needs the online arrival card (TDAC).

## Out of scope unless the traveler asks
- `config/trip.yaml` and `docs/TRIP.md` still have the old route. When asked to update them, the new country windows are: China Dec 6 – Jan 2 (27), Thailand Jan 2–13 (11), Korea Jan 13–22 (9), Japan Jan 22 – Feb 4 (13), Hong Kong Feb 4–9 (5). Keep the order `china, thailand, korea, japan, hong-kong`, and update the home-flight constraint.
- Some place cards mention the old windows (for example, `places/japan/tokyo/ado-utattemita-tour-ariake-arena` says the Tokyo shows fall inside the Japan dates; under this plan they don't, and the Osaka Jan 30–31 shows do). That's curator work.
