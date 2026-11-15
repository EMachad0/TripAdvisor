// Scaffolds for new places and areas: every field + a commented example of every block.
import { BLOCKS, BLOCK_TYPES, AREA_BLOCK_TYPES } from './schema/blocks.js';
import { COUNTRIES, CATEGORY_IDS, CATEGORIES, KINDS, BOOK_METHOD_IDS, FAME_IDS } from './schema/enums.js';
import { slugify } from './media/index.js';
import { toYaml } from './yamlio.js';
import { placeSpec, areaSpec } from './schema/specs.js';
import { specAt } from './schema/dsl.js';

/** Append "≤N chars" to the comment of every scaffold line whose field has a max length (stops at blocks:). */
export function annotateLimits(text, spec) {
  const stack = []; // [{indent, key}]
  const out = [];
  let inBlocks = false;
  for (const line of text.split('\n')) {
    const m = line.match(/^(\s*)(#\s*)?(- )?([a-z_]+):(.*)$/);
    if (!m || inBlocks) { out.push(line); continue; }
    const [, ind, commented, dash, key, rest] = m;
    const indent = ind.length + (dash ? 2 : 0);
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const pathArr = [...stack.map((s) => s.key), ...(dash ? [0] : []), key];
    if (!commented) stack.push({ indent, key: dash ? key : key });
    if (key === 'blocks' && !ind) { inBlocks = true; out.push(line); continue; }
    const keys = []; for (const s of stack.slice(0, -1)) keys.push(s.key);
    const sub = specAt(spec, pathArr.filter((p) => p !== 0 || true), null);
    const max = sub?.kind === 'string' && sub.max ? sub.max : null;
    if (!max || /chars/.test(rest)) { out.push(line); continue; }
    const head = line.slice(0, line.length - rest.length);
    out.push(rest.includes('#') ? head + rest.replace(/#\s*/, (h) => `${h}≤${max} chars · `) : `${line}   # ≤${max} chars`);
  }
  return out.join('\n');
}

const q = (s) => JSON.stringify(String(s));
const KIND_FOR = { food: 'Eat', nightlife: 'Do', shopping: 'Shop', shows: 'Do', 'odd-local': 'Do', 'day-trip': 'Do', stay: 'Stay' };

function commentedBlock(type) {
  const y = toYaml([BLOCKS[type].example]).trimEnd().split('\n');
  return [`  # ── ${type}: ${BLOCKS[type].summary}`, ...y.map((l) => `  # ${l}`)].join('\n');
}

export function placeTemplate(args) { return annotateLimits(placeTemplateRaw(args), placeSpec); }
export function areaTemplate(args) { return annotateLimits(areaTemplateRaw(args), areaSpec); }

function placeTemplateRaw({ country, city, name, category = 'culture', fx, today, id: givenId }) {
  const id = givenId || slugify(name);
  const stay = category === 'stay';
  const cur = COUNTRIES[country]?.currency || 'CNY';
  const kind = KIND_FOR[category] || 'See';
  const ex = { KRW: 10000, JPY: 1000, THB: 200 }[cur] || 40;
  const fxBlock = fx
    ? `fx: { rate: ${fx.rate}, date: ${fx.date}, source: ${q(fx.source)} }   # filled by ./atr fx ${cur}`
    : `fx: { rate: TODO, date: ${today}, source: TODO }   # run: ./atr fx ${cur}`;
  return `# ${name} — place file. Read docs/CURATOR-GUIDE.md first; \`./atr blocks\` shows every block.
# Replace every TODO. Delete optional lines you cannot fill honestly. Validate often:
#   ./atr validate places/${country}/${city}/${id}
id: ${id}                      # must equal the folder name
name: ${q(name)}
# short_name: TODO            # optional short form for headings when name is long, e.g. "Shanghai Museum"
name_local: TODO               # optional: name in local script (汉字 / 한글 / 日本語 / ไทย). Delete if none.
# name_romanized: TODO         # optional: pinyin / romaji, e.g. "Yùyuán"
country: ${country}            # ${Object.keys(COUNTRIES).join(' | ')}
city: ${city}                  # must equal the parent folder name
area: TODO                     # neighbourhood / district, e.g. "Huangpu · Old City"
category: ${category}          # ONE of: ${CATEGORY_IDS.join(' | ')}
${stay ? '# (stays need no `fame`: it is for attractions)' : `fame: TODO                     # ${FAME_IDS.join(' | ')} — iconic: on every top-10 list · popular: known to anyone who researched the city · hidden: most foreign visitors never hear of it`}
# must_do: TODO                # only if this is on the traveler's must-do list: a key from \`./atr taste\`
# must_do_note: TODO           # ≤140 chars, only when it is not exactly what they named, e.g. "The viral branch closed in 2024; this is the closest open one"
tags: []                       # optional finer labels (slugs), e.g. ${stay ? '[hostel, social, rooftop-bar]' : '[garden, ming-dynasty, free]'}
kind: ${kind}                  # trip page kind: ${KINDS.join(' | ')}${stay ? ' (category stay ⇔ kind Stay)' : ''}
why: TODO                      # 20–160 chars: the swipe-card pitch. Concrete, not generic.
# cover: TODO                  # optional: media name for swipe cards (defaults to the hero image)

cost:                          # ${stay ? 'ONE NIGHT in the cheapest bed, per person (= the first bed in the stay block)' : 'typical spend for ONE visit, per person'}
  local: TODO                  # number in local currency${stay ? '' : '; 0 = free'}
  currency: ${cur}
  brl: TODO                    # = local × fx.rate, e.g. ${ex} × ${fx?.rate ?? 'rate'} = ${fx ? Math.round(ex * fx.rate * 100) / 100 : '…'}
  # note: TODO                 # optional, e.g. ${stay ? '"8-bed dorm on a January weeknight; weekends +30%"' : '"¥30 in winter, ¥40 Apr–Nov"'}
${fxBlock}
# counts_against_budget: false # default: false for food/Eat (meals are budgeted separately) and stays (beds too), true otherwise
${stay ? '' : `
time_needed: TODO              # e.g. "2–3 h"
best_time: TODO                # e.g. "Weekday right at opening" / "After 22:00"
`}
# when:                        # ONLY for date-bound places (events, festivals, seasonal openings)
#   dates:                     # 1–6 ranges with the real year (the trip is Dec 2026 – Jan 2027); one day has from = to
#     - { from: 2026-12-31, to: 2026-12-31 }   # only the opening date announced? leave out \`to\` → "From 18 Dec"
#   kind: only                 # only (default) · season (open during this period) · best (the place is always there; the page is about these dates)
#   weekly: [sat]              # optional: only these weekdays inside the ranges (a show every Saturday)
#   label: TODO                # optional chip text; default is derived: "31 Dec only", "17 Dec – 21 Feb"
#   confirmed: false           # false = dates expected from past years, not announced yet

book_ahead:
  required: false              # true = must book · recommended = walk-in usually OK but safer to book · false
  # lead_days: 7               # REQUIRED when required is true or recommended — book at least N days before
  # deadline: 2026-11-30       # instead of lead_days when sales close on a fixed date (lottery, advance price): "Book by 30 Nov"
  # lead_time: TODO            # human version, e.g. "Slots open 7 days ahead at 00:00"
  # method: TODO               # ${BOOK_METHOD_IDS.join(' | ')} (platform = Hostelworld/Booking/Klook…; phone → a tel:+66… link becomes a call button)
  # links:                    # booking channels, best first (or a single "link:")
  #   - label: TODO            # ≤40 chars, e.g. "Trip.com (foreigner-friendly)"
  #     url: https://TODO      # the exact product/booking page, not a homepage
  #     note: TODO             # ≤100 chars, e.g. "No Chinese phone number needed"
  # rules_changed:             # booking rules changed recently? shown as a badge
  #   date: TODO               # YYYY-MM-DD
  #   note: TODO               # ≤200 chars
  # passport: true             # passport number needed (China real-name tickets)
  # notes: TODO

hours:
  summary: TODO                # e.g. ${stay ? '"Reception 24 h · check-in 15:00 · check-out 11:00"' : '"Tue–Sun 09:00–16:30 (last entry 16:00)"'}
  # closed: TODO               # e.g. "Mondays"
  winter: TODO                 # Dec–Jan: ${stay ? 'New Year price jumps and minimum stays, heating, events' : 'winter hours, Christmas/New Year closures, festivals'}

location:
  address: TODO
  address_local: TODO          # address in local script — shown big for taxi drivers
  lat: TODO                    # decimal degrees, e.g. 31.2272
  lng: TODO                    # e.g. 121.4921
  nearest_transit: TODO        # e.g. "Yuyuan Garden (Line 10), Exit 1"
  # approximate: true          # the pin is only near the place (find coordinates with: ./atr geo "<name>" --country ${country})

sources:                       # ≥ 2 real pages you read; checked = date you read them
  - url: https://TODO
    title: TODO
    checked: ${today}
  - url: https://TODO
    title: TODO
    checked: ${today}
confidence: medium             # high | medium | low — be honest
# confidence_note: TODO        # why not high, e.g. "winter price only in reviews"
last_updated: ${today}

# ─── The page, top to bottom. Uncomment / reorder blocks. Media names come from
# ─── \`./atr media fetch <id> "File:..."\` (see \`./atr media list ${id}\`).
blocks:
  - type: hero
    image: TODO                # media name (landscape, ≥ 1600 px). No free photo? delete this line → typographic hero
    # caption: TODO            # ≤100 chars, e.g. "The street outside — no free photo of the bar exists"
    hook: TODO                 # one evocative line (≤120 chars), not a repeat of why
${stay ? `  - type: quick_facts          # price per night + booking are filled automatically
    extra:                     # up to 3 short facts
      - { label: Check-in, value: TODO }
      - { label: Vibe, value: TODO }      # e.g. "Party hostel" / "Social but quiet after 23:00"
  - type: stay                 # the "The stay" panel
    style: hostel              # hostel | capsule | guesthouse | hotel
    beds:                      # 1–6 bed/room types, cheapest first; beds[0] = cost above
      - label: TODO            # e.g. "8-bed mixed dorm"
        local: TODO            # ONE night, local currency
        brl: TODO              # = local × fx.rate
        note: TODO             # optional: when the price is from, e.g. "Weeknight in January"
        url: https://TODO      # optional: the date-search URL that shows this price (so a reviewer can reproduce it)
    rating:                    # optional but wanted: the review score with source + the day you read it
      score: TODO
      out_of: 10
      source: TODO             # e.g. Hostelworld, Booking.com
      reviews: TODO            # optional: number of reviews
      atmosphere: TODO         # optional: atmosphere / social sub-score out of 10 (Hostelworld "Atmosphere")
      checked: ${today}
    social:                    # what makes it easy to meet people (0–8)
      - TODO                   # e.g. "Rooftop bar until 02:00", "Family dinner every night"
    good_to_know:              # practical notes (0–8)
      - TODO                   # e.g. "Bring a padlock for the locker"` : `  - type: quick_facts          # cost + book-ahead are filled automatically
    time_needed: TODO
    best_time: TODO`}
  - type: highlights
    items:
      - title: TODO
        text: TODO
      - title: TODO
        text: TODO
      - title: TODO
        text: TODO
  - type: map
    note: TODO                 # optional getting-there advice; delete if nothing to add
  - type: tips
    variant: insider
    items:
      - TODO
${stay ? `  - type: book_ahead           # New Year dates sell out: say when and where to book (delete if booking is never needed)
    steps:
      - days_before: TODO      # e.g. 30
        text: TODO             # e.g. "Book Dec 30 – Jan 2 on the hostel's own site; two-night minimum"
      - days_before: 0
        text: TODO             # e.g. "Check-in from 15:00 with your passport"
` : ''}  - type: weather
    temp_low_c: TODO
    temp_high_c: TODO
    conditions: TODO
    note: TODO                 # ${stay ? 'what winter means for the stay: heating, the walk from the station, hot water' : 'what winter does to the visit'}

  # ─── More blocks (uncomment what fits; delete the rest) ───────────────────
${BLOCK_TYPES.filter((t) => !['hero', 'quick_facts', 'highlights', 'map', 'weather', ...(stay ? ['stay', 'menu', 'book_ahead'] : ['stay'])].includes(t)).map(commentedBlock).join('\n')}
`;
}

function areaTemplateRaw({ country, name, today, scope = 'city', id: givenId }) {
  const id = givenId || slugify(name);
  return `# ${name} — area card for the broad (areas) round. See docs/CURATOR-GUIDE.md.
# Replace every TODO. Validate: ./atr validate areas/${country}/${id}.yaml
id: ${id}                      # must equal the file name
country: ${country}
name: ${q(name)}
# short_name: TODO            # optional short form for headings when name is long, e.g. "Koh Phangan"
name_local: TODO               # optional local-script name; delete if none
region: TODO                   # province / prefecture / region
scope: ${scope}                # city | region
# must_do: TODO                # only if this area is on the traveler's must-do list: a key from \`./atr taste\`
cities: [${id}]                # city slugs this card covers (places/${country}/<city>/)
why: TODO                      # 20–220 chars: why go here, for a budget winter traveler
best_for: [TODO]               # 1–4 of: ${CATEGORY_IDS.join(', ')}
highlights: []                 # up to 6 short names, e.g. ["Ice and Snow World", "Central Street"]
days_suggested: { min: TODO, max: TODO }
cost_level: medium             # low | medium | high relative to the country's daily budget
fame: TODO                     # is the CITY one the traveler has heard of? iconic | popular | hidden
lat: TODO                      # city centre (or the region's main base), WGS84 decimal degrees, e.g. 45.7567
lng: TODO                      # e.g. 126.6424 — puts the area on the country overview map
getting_there: TODO            # optional: how to get there from the main route; delete if obvious
getting_around: TODO           # optional: how a backpacker moves inside it (metro, buses, on foot)
winter_note: TODO              # what Dec–Jan is like here (cold, festivals, closures)
image: TODO                    # media name in areas/${country}/media (./atr media fetch --area ${id} ...)
sources:
  - url: https://TODO
    title: TODO
    checked: ${today}
  - url: https://TODO
    title: TODO
    checked: ${today}
confidence: medium
last_updated: ${today}

# ─── The area PAGE (optional but wanted: the traveler picks cities from it). The facts strip, winter note,
# ─── must-dos, researched places, map and sources are automatic. Allowed blocks: ${AREA_BLOCK_TYPES.join(', ')}.
# ─── Photos: ./atr media fetch --area ${id} "File:..." --as <name>
# blocks:
#   - type: hero
#     hook: TODO               # one evocative line under the name (the hero photo defaults to \`image\`)
#   - type: highlights         # 3–6 reasons to spend days here
#     items:
#       - title: TODO
#         text: TODO
#   - type: prose
#     title: Why come here
#     text: TODO               # what a few days here feel like; which neighbourhood to base in
#   - type: gallery
#     images:
#       - { file: TODO, caption: TODO }
#   - type: tips
#     variant: insider
#     items:
#       - TODO
#   - type: weather            # replaces the automatic winter panel
#     temp_low_c: TODO
#     temp_high_c: TODO
#     conditions: TODO
#     note: TODO
`;
}

export const CATEGORY_HELP = Object.entries(CATEGORIES).map(([k, v]) => `${k}: ${v.desc}`).join('\n');
