# Design: target screens and visual language

Read this before changing anything a person sees in `apps/web`. It records the four screens the site is designed for
and the rules every screen follows. Tokens and recipes live in `apps/web/src/routes/layout.css`; the frame is
`apps/web/src/lib/components/shell/AppShell.svelte`.

## Target screens

The traveler uses exactly these four. Design for them, in this order of care.

| # | Screen | Used for | Panel | CSS viewport (about) | Tailwind range | Input |
|---|---|---|---|---|---|---|
| 1 | Samsung Galaxy Z Fold 8 Ultra, **inner** screen | Showing the trip to other people. Must look the best. | 8.0 in, 2504 × 2256 px, about 422 ppi, 1.11:1, OLED 1 to 120 Hz, up to 3000 nits | 750 to 860 wide × 700 to 830 tall, DPR 2.6 to 3 | `md` to below `xl` | touch |
| 2 | Samsung Galaxy Z Fold 8 Ultra, **cover** screen | Daily use on the trip, one hand, on the move | 6.5 in, 2520 × 1080 px, 21:9, OLED 1 to 120 Hz | 360 to 412 wide × 760 to 850 tall, DPR 2.6 to 3 | below `md` | touch |
| 3 | MacBook Pro 14 in (M4) | On the go during the trip | 14.2 in, 3024 × 1964 px, 254 ppi, mini-LED 120 Hz, P3, notch | 1512 × about 860 (default scaling), DPR 2 | `xl` to below `3xl` | trackpad, keyboard |
| 4 | 27 in 1440p 16:9 IPS monitor | Planning at home | 2560 × 1440 px, 109 ppi, sRGB, 60 Hz or more | 2560 × about 1300, DPR 1 | `3xl` | mouse, keyboard |

Notes:

- The Fold's CSS viewport depends on the display-size setting in Android, which nobody has measured on the real
  phone yet. The ranges above cover the plausible values (a 2256 px wide panel at DPR 3 is 752 px; at 2.625 it is
  859 px). Layouts must hold across the whole range. If you learn the real numbers, write them here.
- The inner screen is nearly square. Height is as scarce as width: about 790 px with the browser bar showing.
- The cover screen is narrow and very tall. One column, thumb reach at the bottom, nothing important at the top
  corners.
- The monitor has a pixel ratio of 1: hairlines and thin fonts look rougher there than on the other three. Do not go
  below 12 px text or 400 weight for body copy.
- Both phone panels are OLED and the MacBook is P3: dark mode matters and must look as considered as light.
- Screenshots at the four sizes, light or dark: `node apps/web/scripts/shots.ts --help` (reads the header of the
  file). The viewport sizes it uses are the ones in this table.

### Breakpoints

Set in `layout.css` to match the screens, not Tailwind's defaults:

| Name | Min width | Meaning |
|---|---|---|
| (base) | 0 | Fold cover and other phones |
| `sm` | 640 px | Rare: large phones in landscape. Do not design for it. |
| `md` | **704 px** (not 768) | Fold inner screen. Lowered so the unfolded phone always gets this layout. |
| `lg` | 1024 px | Tablets, small windows. Usually the same as `md`. |
| `xl` | 1280 px | MacBook |
| `2xl` | 1536 px | Rare. Do not rely on it: the MacBook at 1512 px is just below. |
| `3xl` | **1920 px** | The monitor |

Write classes for base, `md`, `xl` and `3xl`. Use container queries (`@container`, `@md:`) for a component that
lives in columns of different widths.

### What each screen gets

| | Cover (base) | Fold inner (`md`) | MacBook (`xl`) | Monitor (`3xl`) |
|---|---|---|---|---|
| Navigation | Slim top bar; floating glass tab bar at the bottom, above the safe-area inset | Icon rail on the left, 84 px | Sidebar with labels, 256 px | Same sidebar |
| Columns | 1 | 2 where it helps; master and detail side by side | 2 or 3 | 3 or 4; no line of text longer than about 75 characters |
| Page padding | 16 px | 24 px | 40 px | 56 px |
| Tap targets | 44 px or more | 44 px or more | 32 px or more | 32 px or more |
| Detail views | Bottom drawer or full page | Side sheet or second column | Second column or sheet | Second column, always visible if there is room |
| Hover effects | none | none | yes | yes |

The content area is everything right of the rail or sidebar. On the monitor that is about 2300 px: a single centred
column wastes it. Use `page-wide` (max 104 rem) with a grid for boards, maps, dashboards and lists of cards; use
`page` (72 rem) for mixed pages and `page-narrow` (46 rem) only for forms and pure reading.

## Visual language

Warm paper, ink, and one accent. An editorial travel journal, not a dashboard kit.

- **Type.** Fraunces (serif) for titles, big numbers and place names; Inter for everything else; JetBrains Mono only
  for codes (flight numbers, booking references). One `h1` per page, through `PageHeader`
  (`src/lib/components/shell/PageHeader.svelte`): eyebrow, serif title, optional italic accent, lede, actions.
  Numbers that should line up get `nums`.
- **Colour.** Use the semantic tokens (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`) and the
  trip ones (`text-cat`, `text-must`, `text-maybe`, `text-skip`, `text-note`, `bg-k1` to `bg-k7` for countries). Never
  write a hex colour in a component. The accent (`cat`) follows `data-cat` on any ancestor, so a food card turns
  amber without extra code. Tints are made with `color-mix` or an opacity (`bg-cat/12`).
- **Surfaces.** Three levels. The page (`bg-background`, with the soft washes on `body`). The panel: class `panel`
  (card colour, hairline border, radius 2xl, the flat shadow). Floating chrome: class `glass` (see-through and
  blurred; the phone tab bar, sticky bars over content). A panel that is one big link or button also gets
  `panel-lift`. Do not nest a panel in a panel: inside a panel, group with `bg-muted/60 rounded-xl` or a hairline.
- **Shape.** Radius: `rounded-2xl` for panels, `rounded-xl` for things inside them, `rounded-full` for chips, pills
  and segmented controls. Shadows: `shadow-flat` at rest, `shadow-soft` when raised or hovered, `shadow-big` only for
  things that float over the page.
- **Photos.** They are the best asset the site has. Give them room, crop with `object-cover`, round the corners with
  the surface they sit in, and put text over them only on a scrim (`from-scrim/70`), in `text-on-scrim`.
- **Labels.** Small caps labels use `eyebrow`. Status goes in a pill with a tinted background of its own colour
  (`bg-must/12 text-must`), never a solid loud block.
- **Motion.** Short and soft: 150 to 250 ms, `ease-soft`; `ease-spring` for things the finger moves. Route changes
  cross-fade (view transitions, started in `src/routes/+layout.svelte`). Respect `prefers-reduced-motion`
  (`motion-safe:`).
- **Dark mode.** Follows the system unless the toggle set `data-theme`. Every screen is checked in both.
- **Empty and loading states.** Use `Empty` and `Skeleton` from `components/ui`, sized like the content they stand
  in for, so the page does not jump.

## Rules for changes

- Do not add tests that pin design: no assertions on class names, colours, sizes, pixel positions, layout at a
  viewport, or anything specific to one phone. Tests check behaviour through roles, labels and text.
- Keep accessible names, `data-testid`s and the heading structure stable when restyling; the end-to-end specs in
  `apps/web/e2e` find things by them.
- Look at the result on all four screens (`apps/web/scripts/shots.ts`) before calling a visual change done.
- The place and area pages (`/place/<id>`, `/area/<id>`) are rendered by the platform with its own stylesheet
  (`platform/lib/render/assets/atr.css`), which shares the palette above.

## Lint rules that shape the styling

`pnpm lint` fails on arbitrary Tailwind values (`text-[11px]`, `rounded-[1.6rem]`, `bg-[#fff]`), on inline styles,
on unknown classes, and on restyling a `components/ui` component beyond layout classes (give it a variant in its
`*.variants.ts` instead, or use a plain element). So anything off the scale becomes a token or a `@utility` in
`layout.css` first. The ones that exist: `text-2xs`, `text-3xs`, `panel`, `panel-lift`, `glass`, `eyebrow`, `nums`,
`count`, `count-quiet`, `bg-accent-fill`, `shadow-flat`, `shadow-soft`, `shadow-big`, `shadow-inset`, `page`,
`page-wide`, `page-narrow`, `pt-safe`, `pb-safe`, `bottom-safe`, `no-scrollbar`, `duel-stack-h`, `duel-pair-h`, `bottom-dock`, `deck-h`, `board-col-h`. Add
to the list when you add one.
