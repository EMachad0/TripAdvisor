// Place and area card specs.
import { t } from './dsl.js';
import { COUNTRY_IDS, CATEGORY_IDS, KINDS, BOOK_METHOD_IDS, CONFIDENCE, COST_LEVELS, CURRENCIES, FAME_IDS } from './enums.js';
import { blockSpec, areaBlockSpec } from './blocks.js';

export const sourceSpec = t.object({
  url: t.url({ example: 'https://www.example.gov.cn/visit' }),
  title: t.string({ max: 140, example: 'Official visitor information' }),
  checked: t.date({ desc: 'The day you opened the page and confirmed the facts you used.', example: '2026-11-09' }),
}, { desc: 'Where a fact came from.' });

export const fxSpec = t.object({
  rate: t.number({ min: 0, desc: '1 unit of local currency = rate × BRL. Get it with `./atr fx CNY`.', example: 0.76 }),
  date: t.date({ example: '2026-11-09' }),
  source: t.string({ max: 80, example: 'frankfurter.dev (ECB)' }),
}, { desc: 'Exchange rate used for every R$ amount on this page.' });

export const whenSpec = t.object({
  dates: t.array(t.object({
    from: t.date({ desc: 'First day (ISO date).', example: '2026-12-31' }),
    to: t.opt(t.date({ desc: 'Last day; equal to `from` for a one-day event. Leave it out only when the end date is not announced yet (an opening date with no closing date): the page then says "From 18 Dec" and treats it as open from then on.', example: '2026-12-31' })),
  }), { min: 1, max: 6, desc: 'Date ranges with the real year of the trip (Dec 2026 – Jan 2027).' }),
  kind: t.opt(t.enum(['only', 'season', 'best'], { desc: 'only (default) = it happens only on these dates ("31 Dec only") · season = open during this period ("From 20 Dec to 28 Feb") · best = the place is there all the time, the page is about these dates ("Best on 24–25 Dec").', example: 'only' })),
  weekly: t.opt(t.array(t.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], { example: 'sat' }), { min: 1, max: 7, desc: 'Only these weekdays inside the ranges (e.g. a show every Saturday): one range for the whole period instead of one per date.', example: ['sat'] })),
  label: t.opt(t.string({ max: 40, desc: 'Chip text. Default is derived from the dates and the kind: "31 Dec only", "17 Dec – 21 Feb", "Saturdays, 6 Dec – 2 Jan", "Best on 24–25 Dec".', example: "New Year's Eve only" })),
  confirmed: t.opt(t.boolean({ desc: 'false = dates expected from past years, not announced yet.', example: false })),
}, { desc: 'Only for date-bound places (events, festivals, seasonal openings): when it happens. Checked against the trip dates in config/trip.yaml.', example: { dates: [{ from: '2026-12-31', to: '2026-12-31' }], confirmed: false } });

export const placeSpec = t.object({
  fixture: t.opt(t.boolean({ desc: 'Test fixtures only. Never set in real places.', example: true })),
  id: t.slug({ desc: 'Unique id; must equal the folder name.', example: 'yu-garden' }),
  name: t.string({ max: 80, example: 'Yu Garden' }),
  short_name: t.opt(t.string({ max: 32, desc: 'Short form used in headings ("Finding …") and small cards when `name` is long.', example: 'Shanghai Museum' })),
  name_local: t.opt(t.string({ max: 60, desc: 'Name in local script (Chinese, Hangul, Japanese, Thai).', example: '豫园' })),
  name_romanized: t.opt(t.string({ max: 80, example: 'Yùyuán' })),
  country: t.enum(COUNTRY_IDS, { example: 'china' }),
  city: t.slug({ desc: 'City slug; must equal the parent folder name.', example: 'shanghai' }),
  area: t.string({ max: 80, desc: 'Neighbourhood / district.', example: 'Huangpu · Old City' }),
  category: t.enum(CATEGORY_IDS, { desc: 'Main balance category (one). `stay` (with kind Stay) is a place to sleep, not an attraction.', example: 'culture' }),
  fame: t.opt(t.enum(FAME_IDS, { desc: 'How well known it is. iconic = on every top-10 list, the traveler has surely heard of it; popular = well known to anyone who researched the city; hidden = most foreign visitors never hear of it. Shown as a chip (Icon / Hidden gem); the traveler wants discovery, so be honest.', example: 'hidden' })),
  must_do: t.opt(t.slug({ desc: "Claims an item of the traveler's must-do list: a `key` from config/taste.yaml (see `./atr taste`). Shows the \"On your list\" chip.", example: 'great-wall' })),
  must_do_note: t.opt(t.string({ max: 140, desc: 'One line shown next to "On your list" when the page is not exactly what the traveler named (and in `./atr taste`).', example: 'The viral Chongqing branch closed in 2024; this is the closest open one.' })),
  tags: t.opt(t.array(t.slug({ example: 'garden' }), { max: 10, desc: 'Finer labels, lowercase slugs.', example: ['garden', 'ming-dynasty'] })),
  kind: t.enum(KINDS, { desc: 'Trip page kind.', example: 'See' }),
  why: t.string({ min: 20, max: 160, desc: 'Swipe-card pitch: why the traveler should care, in one sentence.', example: 'A 450-year-old classical garden that is calm and nearly empty on winter mornings.' }),
  cover: t.opt(t.string({ max: 80, desc: 'Image for swipe cards (media name). Defaults to the hero image.', example: 'main-hall-at-dusk' })),
  cost: t.object({
    local: t.number({ min: 0, desc: 'Typical spend for one visit in local currency (0 = free). Stay places: ONE NIGHT in the cheapest bed.', example: 40 }),
    currency: t.enum(CURRENCIES, { example: 'CNY' }),
    brl: t.number({ min: 0, desc: 'Same amount in R$ = local × fx.rate (rounded).', example: 30.4 }),
    note: t.opt(t.string({ max: 140, example: 'Ticket ¥40 in peak season, ¥30 Dec–Mar' })),
  }, { desc: 'Typical per-person spend for one visit (ticket + must-have extras).' }),
  fx: fxSpec,
  counts_against_budget: t.opt(t.boolean({ desc: 'Does this cost come out of the "everything else" daily budget? Default: false for food places (category food or kind Eat — meals are budgeted separately) and for stays (beds are budgeted separately), true otherwise.', example: false })),
  time_needed: t.opt(t.string({ max: 40, example: '2–3 h' })),
  best_time: t.opt(t.string({ max: 60, example: 'Weekday, right at opening' })),
  when: t.opt(whenSpec),
  book_ahead: t.object({
    required: t.enum([true, false, 'recommended'], { desc: 'true = must book (likely turned away without); "recommended" = walk-in usually possible but booking is safer (sources disagree, sell-outs on peak days); false = no booking.', example: true }),
    lead_days: t.opt(t.int({ min: 0, max: 365, desc: 'Book at least this many days before the visit. Required when required is true or "recommended" (unless `deadline` is set).', example: 7 })),
    lead_time: t.opt(t.string({ max: 80, desc: 'Human version of the lead time.', example: 'Slots open 7 days ahead at 00:00' })),
    method: t.opt(t.enum(BOOK_METHOD_IDS, { desc: 'How to book. `platform` = a booking site such as Hostelworld, Booking.com or Klook (labelled with its name, not "Official website"); `phone` = by phone (a `tel:` link becomes a call button).', example: 'passport-registered' })),
    deadline: t.opt(t.date({ desc: 'A fixed "book by" date (a lottery that closes, an advance price that ends), when that matters more than `lead_days`. The hero and the booking panel then say "Book by 30 Nov" instead of "Book N days ahead".', example: '2026-11-30' })),
    link: t.opt(t.url({ desc: 'Main booking page. Use `links` for several channels.', example: 'https://www.example.gov.cn/tickets' })),
    links: t.opt(t.array(t.object({
      label: t.string({ max: 40, example: 'Trip.com (foreigner-friendly)' }),
      url: t.url({ tel: true, desc: 'The booking page; with method phone, a tel: link (tel:+6622465472) renders as a call button.', example: 'https://www.trip.com/things-to-do/detail/12345/' }),
      note: t.opt(t.string({ max: 100, example: 'Email sign-up, no Chinese phone number needed' })),
    }), { min: 1, max: 4, desc: 'Booking channels, best one first (e.g. a foreigner-friendly reseller plus the official channel).' })),
    rules_changed: t.opt(t.object({
      date: t.date({ desc: 'When the booking rules changed.', example: '2025-09-01' }),
      note: t.markdown({ max: 200, example: 'General reservations dropped; only special exhibitions need a timed ticket.' }),
    }, { desc: 'Recently changed booking rules — shown as a badge so the traveler double-checks.' })),
    passport: t.opt(t.boolean({ desc: 'Needs passport number at booking / entry.', example: true })),
    notes: t.opt(t.markdown({ max: 300, example: 'Book in the official WeChat mini-program; Trip.com resells at +¥10.' })),
  }),
  hours: t.object({
    summary: t.string({ max: 140, example: 'Tue–Sun 09:00–16:30 (last entry 16:00)' }),
    closed: t.opt(t.string({ max: 80, example: 'Mondays' })),
    winter: t.opt(t.markdown({ max: 400, desc: 'Dec–Jan specifics: winter hours, Christmas/New Year closures, festivals.', example: 'Winter hours from Nov 1. Open on Jan 1. Lantern festival setup from mid-January.' })),
  }),
  location: t.object({
    address: t.string({ max: 160, example: '218 Anren St, Huangpu, Shanghai' }),
    address_local: t.opt(t.string({ max: 120, desc: 'Address in local script — shown big for taxi drivers.', example: '上海市黄浦区安仁街218号' })),
    lat: t.number({ min: -90, max: 90, example: 31.2272 }),
    lng: t.number({ min: -180, max: 180, example: 121.4921 }),
    nearest_transit: t.opt(t.string({ max: 80, example: 'Yuyuan Garden (Line 10), Exit 1' })),
    approximate: t.opt(t.boolean({ desc: 'true when the pin is only near the place (the building is not on OpenStreetMap, you pinned the block or the mall). The map says "approximate location".', example: true })),
  }),
  sources: t.array(sourceSpec, { min: 2, desc: 'At least 2 real sources you actually read.' }),
  confidence: t.enum(CONFIDENCE, { desc: 'How sure you are about prices/hours/booking. Be honest.', example: 'high' }),
  confidence_note: t.opt(t.string({ max: 400, example: 'Winter price not on the official site; from two recent reviews.' })),
  last_updated: t.date({ example: '2026-11-09' }),
  blocks: t.array(blockSpec, { min: 1, desc: 'The page, top to bottom. Start with hero.' }),
});

export const areaSpec = t.object({
  fixture: t.opt(t.boolean({ example: true })),
  id: t.slug({ desc: 'Unique id; must equal the file name (without .yaml).', example: 'harbin' }),
  country: t.enum(COUNTRY_IDS, { example: 'china' }),
  name: t.string({ max: 60, example: 'Harbin' }),
  short_name: t.opt(t.string({ max: 32, desc: 'Short form used in headings ("Where … is", "… in <name>") when `name` is long.', example: 'Koh Phangan' })),
  name_local: t.opt(t.string({ max: 40, example: '哈尔滨' })),
  region: t.string({ max: 80, desc: 'Province / region / prefecture.', example: 'Heilongjiang, Northeast China' }),
  scope: t.enum(['city', 'region'], { desc: 'A single city or a multi-city region.', example: 'city' }),
  must_do: t.opt(t.slug({ desc: "Claims an item of the traveler's must-do list: a `key` from config/taste.yaml (see `./atr taste`). Shows the \"On your list\" chip.", example: 'cyberpunk-city' })),
  cities: t.opt(t.array(t.slug(), { desc: 'City slugs this card covers (places/<country>/<city>/).', example: ['harbin'] })),
  why: t.string({ min: 20, max: 220, desc: 'Swipe-card pitch for the broad round.', example: 'The world\'s biggest ice-and-snow festival, Russian-era streets and −25 °C nights.' }),
  best_for: t.array(t.enum(CATEGORY_IDS), { min: 1, max: 4, example: ['nature', 'odd-local'] }),
  highlights: t.opt(t.array(t.string({ max: 80 }), { max: 6, example: ['Ice and Snow World', 'Central Street', 'Siberian tiger park'] })),
  days_suggested: t.object({
    min: t.int({ min: 0, max: 30, example: 2 }),
    max: t.int({ min: 0, max: 30, example: 3 }),
  }),
  cost_level: t.enum(COST_LEVELS, { desc: 'Relative to that country\'s daily budget.', example: 'medium' }),
  when: t.opt(whenSpec),
  must_do_note: t.opt(t.string({ max: 140, desc: 'One line shown next to "On your list" when the page is not exactly what the traveler named (and in `./atr taste`).', example: 'The viral Chongqing branch closed in 2024; this is the closest open one.' })),
  fame: t.opt(t.enum(FAME_IDS, { desc: 'Is the CITY one the traveler has heard of? iconic | popular | hidden (same meaning as on places).', example: 'popular' })),
  lat: t.opt(t.number({ min: -90, max: 90, desc: "Latitude of the city centre (or the region's main base), WGS84. Puts the area on the country overview map and gives its page a map.", example: 45.7567 })),
  lng: t.opt(t.number({ min: -180, max: 180, desc: 'Longitude (WGS84).', example: 126.6424 })),
  approximate: t.opt(t.boolean({ desc: 'true when lat/lng are only roughly the centre (e.g. a region).', example: true })),
  getting_around: t.opt(t.string({ max: 200, desc: 'How a backpacker moves inside it.', example: 'Metro Lines 1–3 cover the centre; buses and Didi for the ice park.' })),
  getting_there: t.opt(t.string({ max: 200, example: 'Overnight sleeper from Beijing (~10 h) or 3h40 high-speed rail from Shenyang.' })),
  winter_note: t.markdown({ max: 400, example: 'Brutally cold (−15 to −30 °C) but this is the whole point: the festival runs from late December.' }),
  image: t.string({ max: 80, desc: 'Media name in areas/<country>/media/credits.yaml.', example: 'harbin-ice-festival' }),
  sources: t.array(sourceSpec, { min: 2 }),
  confidence: t.enum(CONFIDENCE, { example: 'medium' }),
  confidence_note: t.opt(t.string({ max: 400, example: 'Train times from one booking site; not on the operator page.' })),
  last_updated: t.date({ example: '2026-11-09' }),
  blocks: t.opt(t.array(areaBlockSpec, { max: 16, desc: 'Optional area PAGE, top to bottom. Without it the page shows only the automatic parts (facts, winter note, must-dos, researched places, map).' })),
});

export const creditSpec = t.object({
  file: t.string({ max: 80, desc: 'Media name used in place.yaml (no extension).', example: 'main-hall-at-dusk' }),
  title: t.opt(t.string({ max: 300 })),
  author: t.string({ max: 300, example: 'Jane Doe' }),
  license: t.string({ max: 80, example: 'CC BY-SA 4.0' }),
  license_url: t.opt(t.url()),
  source_url: t.url({ example: 'https://commons.wikimedia.org/wiki/File:Example.jpg' }),
  original_url: t.opt(t.url()),
  description: t.opt(t.string({ max: 1000 })),
  width: t.opt(t.int({ min: 1 })),
  height: t.opt(t.int({ min: 1 })),
  widths: t.array(t.int({ min: 1 }), { min: 1, example: [640, 1280] }),
  fetched: t.date(),
  origin: t.opt(t.enum(['commons', 'local'])),
  area: t.opt(t.slug({ desc: 'Area media only: the area card this photo was fetched for (`--area <id>`). Areas of one country share a media folder.', example: 'harbin' })),
});
export const creditsSpec = t.array(creditSpec);
