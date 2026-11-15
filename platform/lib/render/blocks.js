// One render function per block type. Each gets (block, ctx) and returns HTML.
// ctx: { place, credits, url(name,w), opts, lang }
import { esc, md, mdInline, safeUrl } from './escape.js';
import { ICONS } from './icons.js';
import { fmtBRL, fmtLocal, img, creditLine, catLabel, titleCase, countryName, bookBadgeText, methodLabel, methodDesc, hostOf, shortName } from './util.js';
import { gallerySlots, factSpans } from './layout.js';
import { CATEGORIES, TIP_VARIANTS, FAME_CHIP, MUST_DO_CHIP, STAY_STYLES } from '../schema/enums.js';
import { isStay, countsAgainstBudget, focusPos } from '../kinds.js';
export { countsAgainstBudget, focusPos };
import { whenLabel, whenTitle, whenKind, eventDates, rangeLabel, routeNote, tripMonths } from '../when.js';

const section = (inner, { width = 'col', cls = '', label } = {}) =>
  `<section class="block wrap ${cls}"${label ? ` aria-label="${esc(label)}"` : ''}><div class="${width === 'col' ? 'col' : width === 'mid' ? 'col mid' : ''}"${width === 'mid' ? ' style="max-width:980px"' : ''}>${inner}</div></section>`;
const heading = (eyebrow, title) => `${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}${title ? `<h2 class="h2">${esc(title)}</h2>` : ''}`;

export function hero(b, ctx) {
  const p = ctx.place;
  const credit = b.image ? ctx.credits.find((c) => c.file === b.image) : null;
  const cat = CATEGORIES[p.category];
  const badge = bookBadgeText(p.book_ahead);
  const chips = [
    `<li class="chip chip--cat">${esc(cat?.icon ?? '')} ${esc(catLabel(p.category))}</li>`,
    flagChips(p, 'li', { trip: ctx.opts.trip }),
    p.kind && !isStay(p) ? `<li class="chip">${esc(p.kind)}</li>` : '',
    `<li class="chip">${esc(titleCase(p.city))}${p.area ? ` · ${esc(p.area)}` : ''}</li>`,
    ...(p.tags || []).slice(0, 2).map((t) => `<li class="chip chip--tag">${esc(t.replace(/-/g, ' '))}</li>`),
  ].join('');
  const image = credit ? `<picture class="hero__img">${img(b.image, { credits: ctx.credits, url: ctx.url, eager: true, sizes: '100vw', alt: b.hook || p.name })}</picture>` : '';
  const watermark = !image ? `<div class="hero__type" aria-hidden="true"${p.name_local ? ` lang="${ctx.lang}"` : ''}>${esc(p.name_local || p.name)}</div>` : '';
  const changed = p.book_ahead?.rules_changed;
  return `<header class="hero${image ? '' : ' hero--type'}" style="--focus:${esc(focusPos(b.focus))}">
  ${image}${watermark}<div class="hero__shade"></div>
  ${ctx.topbar}
  <div class="hero__content">
    <ul class="chips" aria-label="Category">${chips}</ul>
    <h1 class="hero__title"${titleStyle(p.name)}>${esc(nfc(p.name))}</h1>
    ${p.name_local || p.name_romanized ? `<p class="hero__local${String(p.name_local || '').length + String(p.name_romanized || '').length > 28 ? ' hero__local--stack' : ''}">${p.name_local ? `<span lang="${ctx.lang}">${esc(nfc(p.name_local))}</span>` : ''}${p.name_romanized ? `<span class="rom">${esc(nfc(p.name_romanized))}</span>` : ''}</p>` : ''}
    ${b.hook ? `<p class="hero__hook">${esc(b.hook)}</p>` : ''}
    ${p.must_do && p.must_do_note ? `<p class="hero__note">${ICONS.star}<span><b>On your list:</b> ${esc(p.must_do_note)}</span></p>` : ''}
    <div class="hero__badges">${badge ? `<span class="badge badge--book${bookingLevel(p.book_ahead) === 'recommended' ? ' badge--rec' : ''}">${ICONS.calendar} ${esc(badge)}</span>` : `<span class="badge badge--free">${ICONS.door} No booking needed</span>`}${changed ? `<span class="badge badge--changed">${ICONS.alert} Rules changed ${esc(monthYear(changed.date))}</span>` : ''}</div>
  </div>
  ${b.caption || (b.credit_inline && credit) ? `<p class="hero__credit">${ICONS.camera}<span>${b.caption ? esc(b.caption) : ''}${b.caption && b.credit_inline && credit ? ' · ' : ''}${b.credit_inline && credit ? creditLine(credit) : ''}</span></p>` : ''}
</header>`;
}

// Precomposed letters (ā, not a + combining macron): the italic serif draws them from its latin-ext subset.
const nfc = (t) => String(t ?? '').normalize('NFC');
/** style="--lw:N" when the title has a word of 10+ letters: the phone hero shrinks the font so it fits unbroken. */
export const titleStyle = (name) => { const n = Math.max(0, ...String(name || '').split(/\s+/).map((w) => [...w].length)); return n >= 10 ? ` style="--lw:${n}"` : ''; };

const AUTO_FACTS = ['cost', 'meal cost', 'time needed', 'best time', 'book ahead', 'booking', 'getting there', 'hours'];
export { AUTO_FACTS };
const longDate = (d) => { const dt = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const monthYear = (d) => { const dt = new Date(d + 'T00:00:00Z'); return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };

/** Does a `when.label` already state the dates ("Christmas, 24–25 Dec")? Then the quick fact does not repeat them. */
export function labelHasDates(label, ranges) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/[-‐–—]/g, '–');
  const l = norm(label);
  return ranges.length > 0 && ranges.every((r) => l.includes(norm(rangeLabel(r))) || l.includes(norm(rangeLabel(r)).replace(/^from/, '')));
}

const mealPhrase = (r) => (r < 1 ? 'less than a cheap local meal' : r === 1 ? 'about a cheap local meal' : `≈ ${r}× a cheap local meal`);

/** "On your list" / "Hidden gem" / "Icon" chips for a place or area. tag: 'li' | 'span'. */
export function flagChips(item, tag = 'span', { trip } = {}) {
  const out = [];
  const when = whenLabel(item);
  if (when) out.push(`<${tag} class="chip chip--flag chip--when chip--when-${whenKind(item)}" title="${esc(whenTitle(item))}">${ICONS.calendar}${esc(when)}${item.when?.confirmed === false ? '<span class="chip__q" aria-label="not confirmed">?</span>' : ''}</${tag}>`);
  // Dated page vs the days the traveler is in that country (trip: the trip config or a { from, to } window).
  const route = when && trip ? routeNote(item, trip) : null;
  if (route?.state === 'none') out.push(`<${tag} class="chip chip--flag chip--offroute" title="${esc(route.text)}">${ICONS.alert}${esc(route.chip)}</${tag}>`);
  if (item?.must_do) out.push(`<${tag} class="chip chip--flag chip--must" title="You asked for this by name">${ICONS.star}${esc(MUST_DO_CHIP)}</${tag}>`);
  if (FAME_CHIP[item?.fame] && !isStay(item)) out.push(`<${tag} class="chip chip--flag chip--${esc(item.fame)}" title="${item.fame === 'hidden' ? 'Most foreign visitors never hear of it' : 'On every top-10 list'}">${item.fame === 'hidden' ? ICONS.gem : ICONS.landmark}${esc(FAME_CHIP[item.fame])}</${tag}>`);
  return out.join('');
}

export function quick_facts(b, ctx) {
  const p = ctx.place;
  const cost = p.cost || {};
  const counts = countsAgainstBudget(p);
  const stay = isStay(p);
  const budget = counts ? ctx.opts.budgetPerDay : null;
  const share = budget && cost.brl ? Math.round((cost.brl / budget) * 100) : null;
  const meal = ctx.opts.cheapMealBrl;
  const mealRatio = !counts && !stay && meal && cost.brl ? Math.round((cost.brl / meal) * 2) / 2 : null;
  const ba = p.book_ahead || {};
  const facts = [
    stay ? {
      cls: 'fact--money', icon: 'bed', label: 'Cheapest bed', value: fmtBRL(cost.brl), unit: cost.brl ? '/ night' : '',
      sub: [cost.local ? `${fmtLocal(cost.local, cost.currency)} / night` : '', counts ? (share !== null ? `${share}% of daily budget` : '') : 'beds are budgeted separately'].filter(Boolean).join(' · '),
    } : {
      cls: 'fact--money', icon: 'wallet', label: counts ? 'Cost' : 'Meal cost', value: fmtBRL(cost.brl),
      sub: [cost.local ? fmtLocal(cost.local, cost.currency) : '', share !== null ? `${share}% of daily budget` : '', !counts ? (mealRatio ? mealPhrase(mealRatio) : 'meals are budgeted separately') : ''].filter(Boolean).join(' · '),
    },
    whenLabel(p) && (() => {
      const route = ctx.opts.trip ? routeNote(p, ctx.opts.trip) : null;
      return { cls: `fact--when${route?.state === 'none' ? ' fact--offroute' : ''}`, icon: 'calendar', label: 'When', value: whenLabel(p), sub: [p.when.label && !labelHasDates(p.when.label, eventDates(p)) ? eventDates(p).map(rangeLabel).join(', ') : '', eventDates(p).some((r) => r.open) ? 'end date not announced' : '', p.when.confirmed === false ? 'dates not confirmed yet' : ''].filter(Boolean).join(' · '), warn: route?.text };
    })(),
    (b.time_needed || p.time_needed) && { icon: 'clock', label: 'Time needed', value: b.time_needed || p.time_needed },
    (b.best_time || p.best_time) && { icon: 'sun', label: 'Best time', value: b.best_time || p.best_time },
    bookingLevel(ba) === 'recommended'
      ? { cls: 'fact--rec', icon: 'calendar', label: 'Booking', value: 'Recommended', sub: [ba.deadline ? `by ${shortDay(ba.deadline)}` : ba.lead_days !== undefined ? (ba.lead_days === 0 ? 'same day' : `${ba.lead_days} day${ba.lead_days === 1 ? '' : 's'} before`) : '', methodLabel(ba.method, ba), ba.rules_changed ? `rules changed ${monthYear(ba.rules_changed.date)}` : ''].filter(Boolean).join(' · ') }
      : bookingLevel(ba) === 'required'
      ? { cls: 'fact--book', icon: 'calendar', label: 'Book ahead', value: ba.deadline ? `By ${shortDay(ba.deadline)}` : ba.lead_days !== undefined ? (ba.lead_days === 0 ? 'Same day' : `${ba.lead_days} day${ba.lead_days === 1 ? '' : 's'} before`) : 'Required', sub: [methodLabel(ba.method, ba), ba.passport && ba.method !== 'passport-registered' ? 'passport needed' : '', ba.rules_changed ? `rules changed ${monthYear(ba.rules_changed.date)}` : ''].filter(Boolean).join(' · ') }
      : { icon: 'door', label: 'Booking', value: 'Not needed', sub: [ba.method === 'walk-in' ? 'Walk in' : '', ba.rules_changed ? `rules changed ${monthYear(ba.rules_changed.date)}` : ''].filter(Boolean).join(' · ') },
    (b.nearest_transit || p.location?.nearest_transit) && { icon: 'train', label: 'Getting there', value: b.nearest_transit || p.location.nearest_transit },
    ...(b.extra || []).map((e) => ({ icon: 'info', label: e.label, value: e.value, sub: e.detail })),
  ].filter(Boolean);
  const spans = factSpans(facts.length);
  const h = p.hours;
  const hours = h ? `<div class="hours"><b>Hours</b><span>${esc(h.summary)}</span>${h.closed ? `<span>Closed: ${esc(h.closed)}</span>` : ''}${h.winter ? `<span class="rich"><strong>${tripMonths(p, ctx.opts.trip)}:</strong> ${mdInline(h.winter)}</span>` : ''}</div>` : '';
  const sizeCls = (v) => { const n = String(v ?? '').length; return n > 34 ? ' fact__value--xs' : n > 22 ? ' fact__value--sm' : ''; };
  return `<section class="facts" aria-label="Quick facts"><div class="facts__card">
${facts.map((f, i) => `<div class="fact ${f.cls || ''}" style="--d:${spans[i].dSpan};--m:${spans[i].mSpan}"><p class="fact__label">${ICONS[f.icon]}${esc(f.label)}</p><p class="fact__value${sizeCls(f.value)}">${esc(f.value)}${f.unit ? ` <small class="per">${esc(f.unit)}</small>` : ''}</p>${f.sub ? `<p class="fact__sub">${esc(f.sub)}</p>` : ''}${f.warn ? `<p class="fact__sub fact__route">${esc(f.warn)}</p>` : ''}</div>`).join('\n')}
${hours}</div></section>`;
}


export function highlights(b) {
  return section(`${heading(b.title || "Why you'll love it", null)}<div class="hl hl--${b.items.length}">${b.items.map((it) => `<article class="hl__item"><h3>${esc(it.title)}</h3><p>${mdInline(it.text)}</p></article>`).join('')}</div>`, { width: 'mid' });
}

export function prose(b) {
  return section(`${b.title ? heading(null, b.title) : ''}<div class="rich prose-text${b.dropcap ? ' dropcap' : ''}">${md(b.text)}</div>`);
}

export function gallery(b, ctx) {
  const portraits = b.images.map((im) => { const c = ctx.credits.find((x) => x.file === im.file); return !!(c?.width && c?.height && c.height > c.width * 1.05); });
  const slots = gallerySlots(b.images.length, { feature: b.feature !== false, portraits });
  const figs = b.images.map((im, i) => {
    const s = slots[i];
    const c = ctx.credits.find((x) => x.file === im.file);
    const sizes = s.wide ? '(max-width: 1180px) 100vw, 1180px' : `(max-width: 560px) ${s.mSpan === 2 ? '100vw' : '50vw'}, ${Math.round(1180 / s.d)}px`;
    return `<figure style="--d:${s.dSpan};--m:${s.mSpan};--ar:${s.aspect};--arm:${s.phoneAspect};--focus:${esc(focusPos(im.focus))}">${img(im.file, { credits: ctx.credits, url: ctx.url, sizes, alt: im.caption })}<figcaption>${im.caption ? esc(im.caption) : ''}${c ? `<span class="credit">${creditLine(c)}</span>` : ''}</figcaption></figure>`;
  }).join('');
  return `<section class="block wrap">${heading(b.title || 'In pictures', null)}<div class="gallery">${figs}</div></section>`;
}

export { bookingLinks } from '../booking.js';
import { bookingLinks, bookingLevel, isTel, shortDay } from '../booking.js';
/** tel:+66 2 246-5472 → tel:+6622465472 */
const telHref = (u) => 'tel:' + String(u).trim().slice(4).replace(/[^\d+]/g, '');

export function book_ahead(b, ctx) {
  const ba = ctx.place.book_ahead || {};
  const steps = [...b.steps].sort((x, y) => y.days_before - x.days_before);
  const when = (d) => d === 0 ? '<b>Visit</b>day' : `<b>${d}</b>day${d === 1 ? '' : 's'} before`;
  const links = bookingLinks(ba);
  const sub = [methodLabel(ba.method, ba), ba.lead_time].filter(Boolean).join(' · ');
  const changed = ba.rules_changed;
  const callout = [b.passport_note, ba.notes].filter(Boolean);
  return section(`${heading('Book ahead', 'How to get in')}
<div class="book">
  <div class="book__head">
    <div class="book__title"><strong>${esc(bookBadgeText(ba) || 'Booking advised')}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
    ${links.length ? `<div class="book__links">${links.map((l, i) => isTel(l.url)
      ? `<a class="btn btn--call ${i === 0 ? 'btn--warm' : 'btn--ghost'}" href="${esc(telHref(l.url))}"${l.note ? ` title="${esc(l.note)}"` : ''}>${ICONS.phone || ''}${esc(l.label)}</a>`
      : `<a class="btn ${i === 0 ? 'btn--warm' : 'btn--ghost'}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener"${l.note ? ` title="${esc(l.note)}"` : ''}>${esc(l.label)} ${ICONS.arrow}</a>`).join('')}</div>` : ''}
  </div>
  ${links.some((l) => l.note) ? `<ul class="book__notes">${links.filter((l) => l.note).map((l) => `<li><b>${esc(l.label)}:</b> ${esc(l.note)}</li>`).join('')}</ul>` : ''}
  ${changed ? `<div class="book__changed">${ICONS.alert}<div class="rich"><p><strong>Rules changed ${esc(monthYear(changed.date))}.</strong> ${mdInline(changed.note)}</p></div></div>` : ''}
  <ol class="tl">${steps.map((s) => `<li><span class="tl__when">${when(s.days_before)}</span><div class="tl__text rich"><p>${mdInline(s.text)}</p></div></li>`).join('')}</ol>
  ${callout.length ? `<div class="note">${b.passport_note ? ICONS.passport : ICONS.info}<div class="rich">${callout.map((t) => `<p>${mdInline(t)}</p>`).join('')}</div></div>` : ''}
</div>`);
}

export function cost_breakdown(b, ctx) {
  const p = ctx.place;
  const cur = p.cost?.currency;
  const req = b.items.filter((i) => !i.optional);
  const totL = req.reduce((s, i) => s + (i.local || 0), 0);
  const totB = req.reduce((s, i) => s + (i.brl || 0), 0);
  const counts = countsAgainstBudget(p);
  const stay = isStay(p);
  const budget = ctx.opts.budgetPerDay;
  // The real share in the text (the hero says 112%, so must this); only the bar's fill stops at 100%.
  const share = budget && counts ? Math.round((totB / budget) * 100) : null;
  const over = share !== null && share > 100;
  // One number format per column: if any row needs centavos (R$ 2,48), every row gets them (R$ 49,00).
  const cents = b.items.some((i) => typeof i.brl === 'number' && i.brl !== 0 && fmtBRL(i.brl).includes(','));
  const rowBRL = (n) => (cents && typeof n === 'number' && n !== 0 ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fmtBRL(n));
  const meal = ctx.opts.cheapMealBrl;
  const fx = p.fx;
  const loc = (n) => (n === 0 ? '–' : fmtLocal(n, cur));
  return section(`${heading('Cost', stay ? 'What a night costs' : counts ? 'What it costs' : 'What a meal costs')}
<div class="receipt"><table>
<thead><tr><th scope="col">Item</th><th scope="col">Local</th><th scope="col">R$</th></tr></thead>
<tbody>${b.items.map((i) => `<tr${i.optional ? ' class="opt"' : ''}><td class="lbl"><span class="lbl__main">${esc(i.label)}${i.optional ? ' <span class="opt-chip">optional</span>' : ''}</span>${i.note ? `<small>${esc(i.note)}</small>` : ''}</td><td class="num loc">${i.estimate && i.local ? '≈ ' : ''}${esc(loc(i.local))}</td><td class="num brl">${i.estimate && i.brl ? '≈ ' : ''}${esc(rowBRL(i.brl))}</td></tr>`).join('')}
<tr class="total"><td class="lbl">${stay ? 'Total / night' : 'Total'}</td><td class="num loc">${esc(loc(totL))}</td><td class="num brl">${esc(fmtBRL(Math.round(totB * 100) / 100))}</td></tr></tbody></table>
${share !== null ? `<div class="budget-bar${over ? ' budget-bar--over' : ''}">${over ? `<b>Over budget:</b> ` : ''}${share}% of your ${esc(fmtBRL(budget))}/day ${esc(countryName(p.country))} budget${over ? ` (${esc(fmtBRL(Math.round(totB - budget)))} more)` : ''}<div class="budget-bar__track" role="img" aria-label="${share}% of the daily budget"><div class="budget-bar__fill" style="width:${Math.min(100, share)}%"></div></div></div>` : ''}
${stay && !counts ? '<div class="budget-bar">Per night, per person. Beds are budgeted separately from the “everything else” daily budget.</div>' : ''}
${!counts && !stay ? `<div class="budget-bar">Food: paid from your meal money, not the “everything else” budget${meal && totB ? ` · ${mealPhrase(Math.round((totB / meal) * 2) / 2)} (≈ ${esc(fmtBRL(meal))})` : ''}.</div>` : ''}
<div class="receipt__note rich">${b.note ? md(b.note) : ''}${fx ? `<p>Rate: 1 ${esc(cur)} = R$ ${esc(fx.rate)} (${esc(fx.source)}, ${esc(fx.date)}).</p>` : ''}</div>
</div>`);
}

export function mapLinks(place) {
  const { lat, lng } = place.location || {};
  const name = place.name_local || place.name;
  const q = encodeURIComponent(name);
  const links = [];
  if (place.country === 'china') {
    links.push({ label: 'Amap 高德', href: `https://uri.amap.com/marker?position=${lng},${lat}&name=${q}&coordinate=wgs84&callnative=1`, primary: true });
    links.push({ label: 'Baidu 百度', href: `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${q}&content=${encodeURIComponent(place.location?.address_local || place.location?.address || '')}&output=html&coord_type=wgs84&src=atr` });
    links.push({ label: 'Apple Maps', href: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(place.name)}` });
  } else if (place.country === 'korea') {
    links.push({ label: 'Naver Map', href: `https://map.naver.com/p/search/${q}?c=${lng},${lat},16,0,0,0,dh`, primary: true });
    links.push({ label: 'KakaoMap', href: `https://map.kakao.com/link/map/${q},${lat},${lng}` });
  } else {
    links.push({ label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, primary: true });
    links.push({ label: 'Apple Maps', href: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(place.name)}` });
  }
  return links;
}

export function map(b, ctx) {
  const p = ctx.place;
  const loc = p.location || {};
  const sm = b.embed !== false ? ctx.opts.staticMap : null;
  const osm = typeof loc.lat === 'number' ? `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=${b.zoom || 16}/${loc.lat}/${loc.lng}` : '#';
  const frame = sm
    ? `<a class="map__frame map__frame--static" href="${esc(osm)}" target="_blank" rel="noopener" aria-label="Open ${esc(shortName(p))} on OpenStreetMap"><img src="${esc(sm.url)}" width="${sm.width}" height="${sm.height}" alt="Map around ${esc(shortName(p))}" loading="lazy" decoding="async"><span class="map__pin" aria-hidden="true"><svg viewBox="0 0 32 44" width="34" height="46"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg></span>${loc.approximate ? '<span class="map__approx">Approximate location</span>' : ''}<span class="map__osm">© OpenStreetMap contributors</span></a>`
    : typeof loc.lat === 'number' ? `<a class="map__frame" href="${esc(osm)}" target="_blank" rel="noopener"><div class="map__ph" aria-hidden="true">${ICONS.pin}<span>Open map</span></div><span class="map__coords">${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</span></a>` : '';
  const chinaNote = p.country === 'china' ? '<p class="map__fine">Google Maps is blocked and offset in mainland China — use Amap or Baidu (or Apple Maps).</p>' : '';
  return `<section class="block wrap">${heading('Location', `Finding ${shortName(p)}`)}
<div class="map"${frame ? '' : ' style="grid-template-columns:1fr"'}>
  <div class="map__card">
    ${loc.address_local ? `<div class="taxi"><div class="taxi__label">${ICONS.car} Show this to your driver</div><p class="taxi__addr" lang="${ctx.lang}">${esc(loc.address_local)}</p></div>` : ''}
    <p class="map__addr">${esc(loc.address)}</p>
    ${loc.nearest_transit ? `<p class="map__transit">${ICONS.train} ${esc(loc.nearest_transit)}</p>` : ''}
    ${loc.approximate ? `<p class="map__fine map__fine--approx">${ICONS.pin} The pin is approximate: it marks the block or complex, not the door. Use the address.</p>` : ''}
    ${b.note ? `<div class="map__note rich">${md(b.note)}</div>` : ''}
    ${chinaNote}
    <div class="map__links">${mapLinks(p).map((l) => `<a${l.primary ? ' class="primary"' : ''} href="${esc(l.href)}" target="_blank" rel="noopener">${ICONS.pin} ${esc(l.label)}</a>`).join('')}</div>
  </div>
  ${frame}
</div></section>`;
}

const TIP_ICON = { insider: 'bulb', locals: 'people', pitfalls: 'alert' };
export function tipsCard(b) {
  return `<div class="tips tips--${esc(b.variant)}"><div class="tips__head"><span class="tips__icon">${ICONS[TIP_ICON[b.variant]] || ICONS.bulb}</span><h2>${esc(b.title || TIP_VARIANTS[b.variant] || 'Tips')}</h2></div><ul class="rich">${b.items.map((t) => `<li>${mdInline(t)}</li>`).join('')}</ul></div>`;
}
export function tips(b) { return section(tipsCard(b)); }
export function tipsGroup(list) {
  if (list.length === 1) return tips(list[0]);
  return section(`<div class="tips-row">${list.map(tipsCard).join('')}</div>`, { width: 'mid' });
}

export function menu(b, ctx) {
  const cur = ctx.place.cost?.currency;
  return section(`${heading('On the menu', b.title || 'What to order')}
<div class="menu"><ul class="menu__list">${b.items.map((it) => `<li class="menu__item"><div class="menu__row"><span class="menu__name">${esc(it.name)}${it.name_local ? `<span class="menu__local" lang="${ctx.lang}">${esc(it.name_local)}</span>` : ''}${it.tag ? `<span class="tag tag--${esc(it.tag)}">${esc(it.tag.replace('-', ' '))}</span>` : ''}</span>${it.price_local !== undefined || it.price_brl !== undefined ? `<span class="menu__dots"></span><span class="menu__price"><b>${esc(fmtBRL(it.price_brl))}</b><small>${esc(fmtLocal(it.price_local, cur))}</small></span>` : ''}</div>${it.note ? `<p class="menu__note">${esc(it.note)}</p>` : ''}</li>`).join('')}</ul>
${b.note ? `<div class="receipt__note rich">${md(b.note)}</div>` : ''}</div>`);
}

/** "The stay" panel: beds per night, review score, what makes it social, practical notes. */
export function stay(b, ctx) {
  const p = ctx.place;
  const cur = p.cost?.currency;
  const r = b.rating;
  const fmtScore = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
  const pct = r && r.out_of ? Math.max(0, Math.min(100, (r.score / r.out_of) * 100)) : 0;
  const rating = r ? `<div class="stay__rating" title="Checked ${esc(r.checked)}"><div class="stay__score"><b>${esc(fmtScore(r.score))}</b><span>/ ${esc(fmtScore(r.out_of))}</span></div><div class="stay__rmeta"><span class="stay__meter" aria-hidden="true"><i style="width:${pct.toFixed(0)}%"></i></span><span>${esc(r.source)}${typeof r.reviews === 'number' ? ` · ${esc(r.reviews.toLocaleString('en-US'))} reviews` : ''}</span>${typeof r.atmosphere === 'number' ? `<span class="stay__atmo">Atmosphere ${esc(fmtScore(r.atmosphere))} / 10</span>` : ''}<span class="stay__checked">checked ${esc(r.checked)}</span></div></div>` : '';
  const beds = (b.beds || []).map((bed, i) => `<li class="stay__bed${i === 0 ? ' stay__bed--best' : ''}"><div class="stay__bedname"><span>${esc(bed.label)}</span>${i === 0 && b.beds.length > 1 ? '<span class="tag">cheapest</span>' : ''}${bed.note || bed.url ? `<small>${bed.note ? esc(bed.note) : ''}${bed.note && bed.url ? ' · ' : ''}${bed.url ? `<a href="${esc(safeUrl(bed.url))}" target="_blank" rel="noopener">price source</a>` : ''}</small>` : ''}</div><div class="stay__price"><b>${esc(fmtBRL(bed.brl))}</b><small>${esc(fmtLocal(bed.local, cur))} / night</small></div></li>`).join('');
  const list = (title, icon, items, cls) => (items?.length ? `<div class="stay__col ${cls}"><h3>${ICONS[icon]}${esc(title)}</h3><ul class="rich">${items.map((t) => `<li>${mdInline(t)}</li>`).join('')}</ul></div>` : '');
  const cols = list('Meeting people', 'people', b.social, 'stay__col--social') + list('Good to know', 'info', b.good_to_know, 'stay__col--know');
  return section(`${heading('The stay', 'Where you would sleep')}
<div class="stay">
  <div class="stay__head"><div class="stay__style">${ICONS.bed}<div><strong>${esc(STAY_STYLES[b.style] || titleCase(b.style))}</strong><span>${esc(titleCase(p.city))}${p.area ? ` · ${esc(p.area)}` : ''}</span></div></div>${rating}</div>
  <ul class="stay__beds" aria-label="Beds and prices per night">${beds}</ul>
  ${cols ? `<div class="stay__cols">${cols}</div>` : ''}
  <p class="stay__fine">Prices per person, per night${p.fx ? ` · 1 ${esc(cur)} = R$ ${esc(p.fx.rate)} (${esc(p.fx.date)})` : ''}. Hostel prices move with dates: check yours before booking.</p>
</div>`, { width: 'mid' });
}

/** "You asked": the traveler's questions from the game, answered on the page. */
export function faq(b) {
  const day = (d) => { const dt = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  return section(`${heading('You asked', b.title || null)}
<dl class="faq">${b.items.map((it) => `<div class="faq__item"><dt><span class="faq__q" aria-hidden="true">Q</span><span>${esc(it.q)}${it.correction ? ' <span class="tag tag--correction" title="This answer differs from what the game told you earlier">Correction</span>' : ''}</span>${it.asked ? `<small>asked ${esc(day(it.asked))}</small>` : ''}</dt><dd class="rich">${md(it.a)}</dd></div>`).join('')}</dl>`);
}

export function quote(b) {
  if (b.variant === 'vibe') return `<section class="block vibe"><p class="eyebrow">The vibe</p><p>${esc(b.text)}</p></section>`;
  return section(`<blockquote class="quote"><p>${esc(b.text)}</p>${b.attribution ? `<cite>${esc(b.attribution)}</cite>` : ''}</blockquote>`);
}

export function pairs_well(b, ctx) {
  const places = ctx.opts.places || {};
  const items = b.items.map((it) => {
    const other = places instanceof Map ? places.get(it.id) : places[it.id];
    if (!other) return `<div class="pair pair--missing"><div class="pair__img">?</div><div><p class="pair__cat">Coming soon</p><p class="pair__name">${esc(titleCase(it.id))}</p>${it.note ? `<p class="pair__note">${esc(it.note)}</p>` : ''}</div></div>`;
    const cover = other.cover || (other.blocks || []).find((x) => x?.type === 'hero')?.image;
    const oc = other._meta?.credits || other.credits || [];
    const thumb = cover && ctx.opts.placeMediaUrl ? img(cover, { credits: oc, url: (n, w) => ctx.opts.placeMediaUrl(other, n, w), sizes: '84px', alt: '', cls: 'pair__img' }) : `<div class="pair__img">${esc(other.name?.[0] || '·')}</div>`;
    const href = ctx.opts.placeUrl ? ctx.opts.placeUrl(other) : `../${other.id}/`;
    return `<a class="pair" data-cat="${esc(other.category)}" href="${esc(href)}">${thumb}<div><p class="pair__cat">${esc(catLabel(other.category))}</p><p class="pair__name">${esc(other.name)}</p>${it.note ? `<p class="pair__note">${esc(it.note)}</p>` : ''}</div></a>`;
  }).join('');
  return section(`${heading('Nearby', b.title || 'Pairs well with')}<div class="pairs">${items}</div>`, { width: 'mid' });
}

export function weather(b, ctx) {
  return section(`${heading('Winter reality', null)}
<div class="weather"><div><div class="weather__temp"><span class="lo">${esc(b.temp_low_c)}°</span> / ${esc(b.temp_high_c)}°<small>C</small></div><div class="weather__range">Typical ${tripMonths(ctx?.place, ctx?.opts?.trip)} low / high</div></div>
<div><p class="weather__cond">${esc(b.conditions)}</p><div class="weather__note rich">${md(b.note)}</div>${b.wear ? `<p class="weather__wear">${ICONS.thermo} Wear: ${esc(b.wear)}</p>` : ''}</div></div>`);
}

/** Sources footer: sources + photo credits for images used on the page. */
export function sources(b, ctx) {
  const p = ctx.place;
  const used = new Set();
  for (const x of p.blocks || []) {
    if (x?.type === 'hero' && x.image) used.add(x.image);
    if (x?.type === 'gallery') (x.images || []).forEach((i) => used.add(i.file));
  }
  if (p.cover) used.add(p.cover);
  const photos = ctx.credits.filter((c) => used.has(c.file));
  const conf = p.confidence || 'medium';
  return `<footer class="sources" id="sources"><div class="wrap"><div class="sources__grid">
<div><h2>Sources</h2><ol>${(p.sources || []).map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title)}</a><span class="meta">${esc(hostOf(s.url))} · checked ${esc(s.checked)}</span></li>`).join('')}</ol>
${b?.note ? `<div class="sources__note rich" style="margin-top:14px">${md(b.note)}</div>` : ''}</div>
<div><span class="conf conf--${esc(conf)}"><i></i>${esc(titleCase(conf))} confidence</span>${ctx.opts.review?.state === 'pass' ? `<span class="conf conf--checked" title="An independent reviewer opened the sources and checked the facts on this page">${ICONS.shield}Fact-checked ${esc(longDate(ctx.opts.review.reviewed))}</span>` : ''}${p.confidence_note ? `<p style="margin:0 0 12px">${esc(p.confidence_note)}</p>` : ''}
<p class="meta" style="margin:0 0 22px">Last updated ${esc(p.last_updated)}${p.fx ? ` · FX 1 ${esc(p.cost?.currency)} = R$ ${esc(p.fx.rate)} (${esc(p.fx.date)})` : ''}</p>
${photos.length ? `<h2>Photos</h2><ol>${photos.map((c) => `<li>${creditLine(c)}${c.title ? `<span class="meta">${esc(c.title.replace(/^File:/, ''))}</span>` : ''}</li>`).join('')}</ol>` : ''}</div>
</div></div></footer>`;
}

export const RENDERERS = { hero, quick_facts, highlights, prose, gallery, book_ahead, cost_breakdown, map, tips, menu, stay, faq, quote, pairs_well, weather, sources };
