// Block library: the YAML shape of every page block, with docs and examples.
// Examples are illustrative shapes only, not researched place content.
import { t } from './dsl.js';
import { TIP_VARIANTS, STAY_STYLES } from './enums.js';
import { FOCUS_RE, FOCUS_KEYWORDS } from '../kinds.js';

const imageRef = (o = {}) => t.string({
  desc: 'Image name in this place\'s media/credits.yaml (the `file` key, no extension). Fetch with `./atr media fetch`.',
  example: 'main-hall-at-dusk', max: 80, ...o,
});
const focus = (desc, example) => t.string({
  max: 16, pattern: FOCUS_RE, suggest: FOCUS_KEYWORDS, desc, example,
  patternHint: `one of ${FOCUS_KEYWORDS.join(' | ')}, or a focal point as two percentages "x% y%" (from the left edge, from the top; 0–100 each), e.g. "20% 60%"`,
});
const money = (desc) => t.number({ min: 0, desc, example: 60 });

export const BLOCKS = {
  hero: {
    summary: 'Big full-bleed photo with the title, local-script name, a one-line hook, category chips and the book-ahead badge. Put it first. No free photo of the place? Omit `image` for a typographic hero (category colours + the local-script name), or use a nearby/area photo with an honest `caption`. Hero photos should be landscape and ≥ 1600 px wide.',
    spec: t.object({
      image: t.opt(imageRef({ desc: 'Landscape photo ≥ 1600 px wide. Omit for a typographic (no-photo) hero.' })),
      caption: t.opt(t.string({ max: 100, desc: 'Shown small on the hero. Use it to be honest when the photo is not the venue itself.', example: 'The street outside — no free photo of the bar exists' })),
      hook: t.string({ max: 120, desc: 'One evocative line under the title. Not a repeat of `why`.', example: 'A Ming-era maze of rockeries and koi ponds, hidden behind a tourist bazaar.' }),
      focus: t.opt(focus('Which part of the photo must stay visible when cropped: a keyword, or the focal point "x% y%" (e.g. "20% 60%" = 20% from the left, 60% from the top). On a phone the hero is taller than wide, so a landscape photo already fills its height: only the x value moves it, y has no effect, and the title covers the lower half. A subject low in a wide photo stays under the text; pick a photo with the subject in its upper half.', 'center')),
      credit_inline: t.opt(t.boolean({ desc: 'Show the photo credit on the hero itself (it is always in the sources footer).', example: false })),
    }),
    example: { type: 'hero', image: 'main-hall-at-dusk', hook: 'A Ming-era maze of rockeries and koi ponds, hidden behind a tourist bazaar.', focus: 'center' },
  },
  quick_facts: {
    summary: 'Strip of key facts. Cost (R$ + local) and the book-ahead badge come from the top-level `cost` and `book_ahead` automatically; you add the rest.',
    spec: t.object({
      time_needed: t.opt(t.string({ max: 40, desc: 'How long a visit takes. Required except on stay places.', example: '2–3 h' })),
      best_time: t.opt(t.string({ max: 60, desc: 'Best time of day / week. Required except on stay places.', example: 'Weekday, right at opening' })),
      nearest_transit: t.opt(t.string({ max: 80, desc: 'Nearest metro/bus stop and exit. Defaults to location.nearest_transit.', example: 'Line 10, Exit 1 (5 min walk)' })),
      extra: t.opt(t.array(t.object({
        label: t.string({ max: 24, example: 'Dress code' }),
        value: t.string({ max: 60, desc: 'Keep it short (≤ 28 chars reads best); put the rest in `detail`.', example: 'None' }),
        detail: t.opt(t.string({ max: 80, desc: 'Smaller second line under the value.', example: 'Shorts are fine' })),
      }), { max: 3, desc: 'Up to 3 extra facts. Do not repeat the automatic ones: Cost, Time needed, Best time, Book ahead/Booking, Getting there, Hours.' })),
    }),
    example: { type: 'quick_facts', time_needed: '2–3 h', best_time: 'Weekday, right at opening', nearest_transit: 'Line 10, Exit 1 (5 min walk)', extra: [{ label: 'Good in rain', value: 'Partly', detail: 'Covered halls, open courtyards' }] },
  },
  highlights: {
    summary: '"Why you\'ll love it": 3–6 short, concrete reasons. Each a bold title + one or two sentences.',
    spec: t.object({
      title: t.opt(t.string({ max: 60, example: "Why you'll love it" })),
      items: t.array(t.object({
        title: t.string({ max: 60, example: 'Rockery mountains' }),
        text: t.markdown({ max: 280, example: 'Piles of porous **Taihu stone** stacked into mini mountains you can climb through.' }),
      }), { min: 2, max: 6 }),
    }),
    example: { type: 'highlights', items: [{ title: 'Rockery mountains', text: 'Piles of porous **Taihu stone** stacked into mini mountains you can climb through.' }, { title: 'Winter calm', text: 'December mornings are nearly empty — the opposite of the summer crush.' }] },
  },
  prose: {
    summary: 'Free-form story text (Markdown subset: **bold**, *italic*, [links](https://...), "- " lists, blank line = new paragraph). Keep it tight: 1–4 paragraphs.',
    spec: t.object({
      title: t.opt(t.string({ max: 80, example: 'The story' })),
      text: t.markdown({ max: 3000, example: 'Built in the 1500s by a retired official for his parents...\n\nToday the garden is ringed by a bazaar.' }),
      dropcap: t.opt(t.boolean({ desc: 'Magazine-style large first letter.', example: true })),
    }),
    example: { type: 'prose', title: 'The story', dropcap: true, text: 'Built in the 1500s by a retired official for his parents, the garden survived wars and a century of neglect.\n\nToday it is ringed by a busy bazaar — walk past the souvenir stalls and the noise drops away.' },
  },
  gallery: {
    summary: 'Photo grid (1–8 images; optional block). Any count lays out without orphan tiles. With an odd count the first photo is shown wide ("feature") — it should be landscape and ≥ 1280 px; set `feature: false` to avoid that. Credits are shown automatically.',
    spec: t.object({
      title: t.opt(t.string({ max: 60, example: 'In pictures' })),
      feature: t.opt(t.boolean({ desc: 'Show the first photo wide when the count is odd (default true).', example: true })),
      images: t.array(t.object({
        file: imageRef(),
        caption: t.opt(t.string({ max: 140, example: 'The zig-zag bridge at opening time' })),
        focus: t.opt(focus('What must stay visible when cropped: a keyword or a focal point "x% y%".', 'top')),
      }), { min: 1, max: 8 }),
    }),
    example: { type: 'gallery', images: [{ file: 'zigzag-bridge', caption: 'The zig-zag bridge at opening time' }, { file: 'rockery', caption: 'Taihu stone rockery' }] },
  },
  book_ahead: {
    summary: 'Timeline of booking steps relative to the visit day. The header (lead time, method, booking buttons, "rules changed" badge) comes from top-level `book_ahead`; `passport_note` and `book_ahead.notes` are merged into one callout under the steps — do not repeat the same advice in both. Use when booking is required or strongly advised.',
    spec: t.object({
      steps: t.array(t.object({
        days_before: t.int({ min: 0, max: 365, desc: 'Days before the visit (0 = visit day).', example: 7 }),
        text: t.markdown({ max: 240, example: 'Tickets open on the official WeChat mini-program. Book with your **passport number**.' }),
      }), { min: 1, max: 6 }),
      passport_note: t.opt(t.markdown({ max: 300, desc: 'Passport/real-name details, e.g. "bring the same passport you booked with".', example: 'Bring the **same passport** you booked with — it is scanned at the gate.' })),
    }),
    example: { type: 'book_ahead', steps: [{ days_before: 7, text: 'Slots open 7 days ahead on the official WeChat mini-program; book with your **passport number**.' }, { days_before: 0, text: 'Show the passport at the gate; no printed ticket needed.' }], passport_note: 'Bring the **same passport** you booked with.' },
  },
  cost_breakdown: {
    summary: 'Itemised costs in local currency + R$, with an automatic total. Currency comes from top-level `cost.currency`.',
    spec: t.object({
      items: t.array(t.object({
        label: t.string({ max: 60, example: 'Entry ticket' }),
        local: money('Amount in local currency.'),
        brl: money('Same amount in R$ (local × fx.rate).'),
        note: t.opt(t.string({ max: 100, example: 'Winter price' })),
        optional: t.opt(t.boolean({ desc: 'Optional extra (excluded from the total).', example: false })),
        estimate: t.opt(t.boolean({ desc: 'A rough figure (a typical fare, a snack): shown with "≈" before both amounts.', example: true })),
      }), { min: 1, max: 10 }),
      note: t.opt(t.markdown({ max: 300, example: 'Students with an ISIC card get half price.' })),
    }),
    example: { type: 'cost_breakdown', items: [{ label: 'Entry ticket', local: 30, brl: 22.8, note: 'Winter price' }, { label: 'Metro round trip', local: 6, brl: 4.56 }, { label: 'Tea in the pavilion', local: 50, brl: 38, optional: true }], note: 'Free for under-1.3 m children.' },
  },
  map: {
    summary: 'Location card: the local-script address big enough to show a taxi driver, map deep links for the country (China → Amap/Baidu, Korea → Naver/Kakao, others → Google/Apple) and a static OpenStreetMap image with a pin (made at build time). Data comes from top-level `location`.',
    spec: t.object({
      zoom: t.opt(t.int({ min: 10, max: 19, example: 16 })),
      note: t.opt(t.markdown({ max: 300, desc: 'Getting-there advice.', example: 'Enter by the **north gate**; the south side is a souvenir maze.' })),
      embed: t.opt(t.boolean({ desc: 'Show the static map image (default true).', example: true })),
    }),
    example: { type: 'map', zoom: 16, note: 'Enter by the **north gate**; the south side is a souvenir maze.' },
  },
  tips: {
    summary: `Tips list. variant: ${Object.entries(TIP_VARIANTS).map(([k, v]) => `${k} (${v})`).join(', ')}. Use several tips blocks for several variants.`,
    spec: t.object({
      variant: t.enum(Object.keys(TIP_VARIANTS), { example: 'insider' }),
      title: t.opt(t.string({ max: 60, example: 'Insider tips' })),
      items: t.array(t.markdown({ max: 300, example: 'Arrive at **08:45**; the first hour is tour-group free.' }), { min: 1, max: 8 }),
    }),
    example: { type: 'tips', variant: 'insider', items: ['Arrive at **08:45**; the first hour is tour-group free.', 'The tea house upstairs is overpriced — drink tea at the stalls outside.'] },
  },
  menu: {
    summary: 'Dish / drink highlights for Eat and nightlife places, menu-card style.',
    spec: t.object({
      title: t.opt(t.string({ max: 60, example: 'What to order' })),
      items: t.array(t.object({
        name: t.string({ max: 60, example: 'Xiaolongbao' }),
        name_local: t.opt(t.string({ max: 40, desc: 'Name in local script, to point at on the menu.', example: '小笼包' })),
        price_local: t.opt(money('Price in local currency.')),
        price_brl: t.opt(money('Price in R$.')),
        note: t.opt(t.string({ max: 140, example: 'Soup dumplings; bite a hole, sip, then eat.' })),
        tag: t.opt(t.enum(['must-try', 'veg', 'spicy', 'signature', 'cheap', 'drink'], { example: 'must-try' })),
      }), { min: 1, max: 14 }),
      note: t.opt(t.markdown({ max: 300, example: 'Picture menu available; cash or Alipay.' })),
    }),
    example: { type: 'menu', items: [{ name: 'Xiaolongbao', name_local: '小笼包', price_local: 28, price_brl: 21.3, note: 'Soup dumplings; bite, sip, eat.', tag: 'must-try' }], note: 'Picture menu; pay with Alipay.' },
  },
  stay: {
    summary: '"The stay" panel for stay places (category stay): beds with the price per night, the review score with its source and date, what makes it easy to meet people, and practical notes. `cost` at the top level is one night in the cheapest bed (= beds[0]).',
    spec: t.object({
      style: t.enum(Object.keys(STAY_STYLES), { desc: 'hostel | capsule (capsule/pod hotel) | guesthouse | hotel.', example: 'hostel' }),
      beds: t.array(t.object({
        label: t.string({ max: 60, example: '8-bed mixed dorm' }),
        local: money('Price for ONE night in local currency.'),
        brl: money('Same price in R$ (local × fx.rate).'),
        note: t.opt(t.string({ max: 100, desc: 'When the price is from, what is included.', example: 'Weeknight in January' })),
        url: t.opt(t.url({ desc: 'The date-search URL that shows this price (dates in the query string), so a reviewer can reproduce it.', example: 'https://www.hostelworld.com/pwa/hosteldetails.php/Example/Shanghai/12345?from=2026-12-08&to=2026-12-09&guests=1' })),
      }), { min: 1, max: 6, desc: 'Bed/room types, cheapest first.' }),
      rating: t.opt(t.object({
        score: t.number({ min: 0, max: 100, example: 9.1 }),
        out_of: t.number({ min: 1, max: 100, example: 10 }),
        source: t.string({ max: 40, desc: 'Where the score is from.', example: 'Hostelworld' }),
        reviews: t.opt(t.int({ min: 0, desc: 'Number of reviews behind the score.', example: 2300 })),
        atmosphere: t.opt(t.number({ min: 0, max: 10, desc: 'Atmosphere / social sub-score out of 10 from the same source (e.g. Hostelworld "Atmosphere"). The traveler picks hostels to meet people.', example: 9.4 })),
        checked: t.date({ desc: 'The day you read the score.', example: '2026-11-10' }),
      }, { desc: 'Review score with its source and the date you checked it.' })),
      social: t.opt(t.array(t.markdown({ max: 160, example: 'Rooftop bar until 02:00' }), { max: 8, desc: 'What makes it easy to meet people: bar, common room, events, pub crawls, family dinners.' })),
      good_to_know: t.opt(t.array(t.markdown({ max: 160, example: 'Check-in from 14:00' }), { max: 8, desc: 'Practical notes: check-in, lockers, curfew, noise, deposit.' })),
    }),
    example: { type: 'stay', style: 'hostel', beds: [{ label: '8-bed mixed dorm', local: 60, brl: 49.6, note: 'Weeknight in January' }, { label: 'Private double', local: 220, brl: 181.9 }], rating: { score: 9.1, out_of: 10, source: 'Hostelworld', reviews: 2300, checked: '2026-11-10' }, social: ['Rooftop bar until 02:00', 'Free walking tour every morning'], good_to_know: ['Check-in from 14:00', 'Bring a padlock for the locker'] },
  },
  faq: {
    summary: '"You asked": answers to questions the traveler asked in the game about this place (see `./atr feedback --new`). Fix the field the question is about first; add the answer here when it is not obvious from the page. Each answer needs a source in `sources`. `q` is the question (the traveler\'s words, tidied), `a` the answer, `asked` the date they asked it.',
    spec: t.object({
      title: t.opt(t.string({ max: 60, example: 'You asked' })),
      items: t.array(t.object({
        q: t.string({ max: 200, desc: "The traveler's question, shortened if needed.", example: 'Do I need to book with my passport?' }),
        a: t.markdown({ max: 600, desc: 'The answer, concrete and sourced.', example: 'No. In winter you can **walk in**; bring the passport anyway, it is scanned at the gate.' }),
        asked: t.opt(t.date({ desc: 'The DATE the question was asked (YYYY-MM-DD, from `./atr feedback --new`), shown as "asked 21 Nov". Not the question text: that goes in `q`.', example: '2026-11-21' })),
        correction: t.opt(t.boolean({ desc: "true when this answer differs from what the game's Ask box told the traveler (see the \"game answered\" line in `./atr feedback --new`). Shows a small \"Correction\" tag.", example: true })),
      }), { min: 1, max: 8 }),
    }),
    example: { type: 'faq', items: [{ q: 'Do I need to book with my passport?', a: 'No. In winter you can **walk in**; bring the passport anyway, it is scanned at the gate.', asked: '2026-11-21' }] },
  },
  quote: {
    summary: 'Big pull quote (variant quote, with attribution) or a one-line mood (variant vibe).',
    spec: t.object({
      text: t.string({ max: 280, example: 'The best seat in the city is the one by the window at 6 pm.' }),
      attribution: t.opt(t.string({ max: 80, example: 'a regular, on Dianping' })),
      variant: t.opt(t.enum(['quote', 'vibe'], { example: 'quote' })),
    }),
    example: { type: 'quote', text: 'Steam, chatter and the clack of mahjong tiles — this is a Tuesday night here.', variant: 'vibe' },
  },
  pairs_well: {
    summary: 'Links to other places (by id) that combine well — same area, before/after. Missing ids render as plain text and show as a validation warning.',
    spec: t.object({
      title: t.opt(t.string({ max: 60, example: 'Pairs well with' })),
      items: t.array(t.object({
        id: t.slug({ desc: 'The other place\'s `id`.', example: 'old-street-teahouse' }),
        note: t.opt(t.string({ max: 120, example: '10 min walk; go after for dinner.' })),
      }), { min: 1, max: 6 }),
    }),
    example: { type: 'pairs_well', items: [{ id: 'old-street-teahouse', note: '10 min walk; go after for dinner.' }] },
  },
  weather: {
    summary: 'Winter reality check for Dec–Jan: typical temperature range, conditions, what it means for the visit.',
    spec: t.object({
      temp_low_c: t.number({ min: -50, max: 45, example: 2 }),
      temp_high_c: t.number({ min: -50, max: 45, example: 9 }),
      conditions: t.string({ max: 80, example: 'Damp, grey, occasional drizzle' }),
      note: t.markdown({ max: 400, example: 'Most of the visit is outdoors; pavilions are unheated.' }),
      wear: t.opt(t.string({ max: 120, example: 'Warm layers, waterproof shoes' })),
    }),
    example: { type: 'weather', temp_low_c: 2, temp_high_c: 9, conditions: 'Damp, grey, occasional drizzle', note: 'Mostly outdoors; pavilions are unheated. Bare winter trees, but the rockeries and koi are still great.', wear: 'Warm layers, waterproof shoes' },
  },
  sources: {
    summary: 'Sources footer (auto from top-level `sources` + photo credits). It is appended automatically at the end; add this block only to place it elsewhere or add a note.',
    spec: t.object({
      note: t.opt(t.markdown({ max: 300, example: 'Prices checked on the official site; hours confirmed on Dianping.' })),
    }),
    example: { type: 'sources', note: 'Prices checked on the official site; hours confirmed on Dianping.' },
  },
};

export const BLOCK_TYPES = Object.keys(BLOCKS);
/** Blocks an area page may use. The rest are place-only. */
export const AREA_BLOCK_TYPES = ['hero', 'highlights', 'prose', 'gallery', 'quote', 'tips', 'weather', 'faq', 'sources'];
const areaHero = { ...BLOCKS.hero.spec, fields: { ...BLOCKS.hero.spec.fields, hook: t.opt({ ...BLOCKS.hero.spec.fields.hook, desc: 'One evocative line under the name. Optional on areas.' }), image: t.opt(imageRef({ desc: 'Landscape photo ≥ 1600 px wide from areas/<country>/media. Defaults to the area `image`.' })) } };
export const areaBlockSpec = t.tagged('type', Object.fromEntries(AREA_BLOCK_TYPES.map((k) => [k, k === 'hero' ? areaHero : BLOCKS[k].spec])), {
  desc: 'An area-page block. Allowed: ' + AREA_BLOCK_TYPES.join(', ') + '.',
});
export const blockSpec = t.tagged('type', Object.fromEntries(BLOCK_TYPES.map((k) => [k, BLOCKS[k].spec])), {
  desc: 'A page block. `type` selects the block; run `./atr blocks` for every shape.',
});
