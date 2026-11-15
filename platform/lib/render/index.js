// Public render API. All functions are pure: data in, HTML string out.
import { esc, md, mdInline } from './escape.js';
import { ICONS } from './icons.js';
import { RENDERERS, tipsGroup, flagChips } from './blocks.js';
import { isStay, hasPlaceholders } from '../kinds.js';
import { styles } from './assets.js';
import { fmtBRL, fmtLocal, img, catLabel, titleCase, countryName, bookBadgeText, LANG, themeBoot, themeToggle } from './util.js';
import { COUNTRIES, CATEGORIES, FAME_CHIP } from '../schema/enums.js';

export { esc, md, mdInline } from './escape.js';
export { styles, copyAssets } from './assets.js';
export { mapLinks, countsAgainstBudget, flagChips } from './blocks.js';
export { bookingLinks, bookingLevel, bookBadgeText, bookAheadList } from '../booking.js';
import { bookingLevel } from '../booking.js';

export { renderAreaPage, areaPlaces, areaMustDo } from './area.js';

export const pageHead = (o) => head(o);
function head({ title, description, assetBase, inlineCss, cat }) {
  const css = inlineCss ? `<style>${styles(assetBase)}</style>` : `<link rel="stylesheet" href="${esc(assetBase)}atr.css">`;
  return `<!doctype html>
<html lang="en"${cat ? ` data-cat="${esc(cat)}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="color-scheme" content="light dark">
${themeBoot}
${css}
</head>`;
}

const defaultUrl = (base) => (name, w) => `${base}${name}-${w}.webp`;

/**
 * Render a full place page.
 * opts: {
 *   credits?: media credits (default place._meta.credits),
 *   mediaBase?: URL prefix for this place's media (default 'media/'),
 *   mediaUrl?: (name, width) => url (overrides mediaBase),
 *   assetBase?: URL prefix for atr.css + fonts (default '../../assets/'),
 *   inlineCss?: boolean, homeUrl?: back-link URL (default '../../'),
 *   places?: {id: place} | Map for pairs_well, placeUrl?: (place) => url,
 *   placeMediaUrl?: (place, name, width) => url, budgetPerDay?: number (R$),
 *   cheapMealBrl?: number (R$ reference for food places),
 *   staticMap?: { url, width, height } (build-time OSM image for the map block),
 *   trip?: the trip config ({ countries: [{ id, from, to }] }) or the { from, to } window for this place's country.
 *          A dated page then says "Not on your route: you're in Hong Kong 19–22 Jan" (or the usable days),
 *   review?: { state, reviewed } from reviewStatus(place): state 'pass' shows "Fact-checked <date>" in the footer,
 *   fragment?: true → return only <body> inner HTML (no <html>/<head>)
 * }
 */
export function renderPlacePage(place, opts = {}) {
  const p = place;
  const credits = opts.credits || p._meta?.credits || [];
  const url = opts.mediaUrl || defaultUrl(opts.mediaBase ?? 'media/');
  const assetBase = opts.assetBase ?? '../../assets/';
  const homeUrl = opts.homeUrl ?? '../../';
  const lang = LANG[p.country] || 'und';
  const topbar = `<nav class="topbar"><a href="${esc(homeUrl)}" class="brand">${ICONS.back}<span class="lbl">All places</span></a>${themeToggle()}</nav>`;
  const ctx = { place: p, credits, url, opts, lang, topbar };

  const blocks = Array.isArray(p.blocks) ? p.blocks.filter((b) => b && RENDERERS[b.type]) : [];
  const heroB = blocks.find((b) => b.type === 'hero');
  const factsB = blocks.find((b) => b.type === 'quick_facts') || { type: 'quick_facts' };
  const rest = blocks.filter((b) => b.type !== 'hero' && b.type !== 'quick_facts');
  const parts = [];
  // data-block="<type>" on each block root lets `atr shot --section <type>` find it.
  const tag = (type, html) => String(html).replace(/^(\s*<(?:section|header|footer|div))/, `$1 data-block="${type}"`);
  parts.push(tag('hero', heroB ? RENDERERS.hero(heroB, ctx) : RENDERERS.hero({ type: 'hero' }, ctx)));
  parts.push(tag('quick_facts', RENDERERS.quick_facts(factsB, ctx)));
  parts.push(`<section class="wrap"><p class="col lede${/^\p{L}/u.test(String(p.why || '')) ? ' lede--cap' : ''}">${esc(p.why)}</p></section>`);
  let sourcesDone = false;
  for (let i = 0; i < rest.length; i++) {
    const b = rest[i];
    if (b.type === 'tips') {
      const group = [b];
      while (rest[i + 1]?.type === 'tips' && group.length < 3) group.push(rest[++i]);
      parts.push(tag('tips', tipsGroup(group)));
      continue;
    }
    if (b.type === 'sources') sourcesDone = true;
    try { parts.push(tag(b.type, RENDERERS[b.type](b, ctx))); } catch (e) { parts.push(`<!-- block ${esc(b.type)} failed: ${esc(e.message)} -->`); }
  }
  if (!sourcesDone) parts.push(tag('sources', RENDERERS.sources(null, ctx)));
  parts.push(`<p class="site-foot">Asia Trip Ranker · curated for a winter 2026–27 trip · <a href="#sources">sources &amp; photo credits</a></p>`);
  const body = `<body data-cat="${esc(p.category)}"><main class="page">\n${parts.join('\n')}\n</main></body>`;
  if (opts.fragment) return body;
  const title = `${p.name} — ${titleCase(p.city)}, ${countryName(p.country)} · Asia Trip Ranker`;
  return `${head({ title, description: p.why, assetBase, inlineCss: opts.inlineCss, cat: p.category })}\n${body}\n</html>\n`;
}

/**
 * Compact swipe card (≈ 360×560). Returns an <article> (or <a> with opts.href).
 * opts: { credits, mediaUrl | mediaBase, href, isNew, trip?: trip config or { from, to } (adds "Not on your route" to a dated card) }
 */
export function renderPlaceCard(place, opts = {}) {
  const p = place;
  const credits = opts.credits || p._meta?.credits || [];
  const url = opts.mediaUrl || defaultUrl(opts.mediaBase ?? 'media/');
  const cover = p.cover || (p.blocks || []).find((b) => b?.type === 'hero')?.image;
  const badge = bookBadgeText(p.book_ahead);
  const tag = opts.href ? 'a' : 'article';
  const cost = p.cost || {};
  const stay = isStay(p);
  const night = stay && cost.brl ? ' <small class="per">/ night</small>' : '';
  const flags = flagChips(p, 'span', { trip: opts.trip });
  return `<${tag} class="atr-card${stay ? ' atr-card--stay' : ''}" data-cat="${esc(p.category)}" data-id="${esc(p.id)}"${opts.href ? ` href="${esc(opts.href)}"` : ''}>
  <div class="atr-card__media${cover ? '' : ' atr-card__media--type'}">${cover ? img(cover, { credits, url, sizes: '(max-width: 420px) 100vw, 380px', alt: '' }) : `<span class="atr-card__type" aria-hidden="true"${p.name_local ? ` lang="${LANG[p.country] || 'und'}"` : ''}>${esc(p.name_local || p.name)}</span>`}
    <div class="atr-card__top"><span class="chip">${esc(CATEGORIES[p.category]?.icon ?? '')} ${esc(catLabel(p.category))}</span>${opts.isNew ? '<span class="atr-card__book atr-card__new">New</span>' : ''}${badge ? `<span class="atr-card__book${bookingLevel(p.book_ahead) === 'recommended' ? ' atr-card__book--rec' : ''}" title="${esc(p.book_ahead?.lead_time || '')}">📅 ${esc(badge)}</span>` : ''}</div>
    ${flags ? `<div class="atr-card__flags">${flags}</div>` : ''}<span class="atr-card__place">${esc(titleCase(p.city))}${p.area ? ` · ${esc(p.area)}` : ''}</span>
  </div>
  <div class="atr-card__body">
    <h3 class="atr-card__name">${esc(p.name)}</h3>
    ${p.name_local ? `<p class="atr-card__local" lang="${LANG[p.country] || 'und'}">${esc(p.name_local)}</p>` : ''}
    <p class="atr-card__why">${esc(p.why)}</p>
    <div class="atr-card__meta"><span class="atr-card__price">${esc(fmtBRL(cost.brl))}${night}</span>${cost.local ? `<span>${esc(fmtLocal(cost.local, cost.currency))}</span>` : ''}${p.time_needed ? `<span>${esc(p.time_needed)}</span>` : ''}<span>${esc(p.kind || '')}</span></div>
  </div>
</${tag}>`;
}

/** Area/city card for the broad round. opts: { credits, mediaUrl | mediaBase, href?: area page URL, number?: its number on the country overview map } */
export function renderAreaCard(area, opts = {}) {
  const a = area;
  const credits = opts.credits || a._meta?.credits || [];
  const url = opts.mediaUrl || defaultUrl(opts.mediaBase ?? 'media/');
  const d = a.days_suggested || {};
  const days = d.min === d.max ? `${d.min} day${d.min === 1 ? '' : 's'}` : `${d.min}–${d.max} days`;
  const cost = { low: '$ · cheap', medium: '$$ · average', high: '$$$ · pricey' }[a.cost_level] || a.cost_level;
  const name = `${esc(a.name)}${a.name_local ? `<span class="cjk" lang="${LANG[a.country] || 'und'}">${esc(a.name_local)}</span>` : ''}`;
  return `<article class="area-card${opts.href ? ' area-card--link' : ''}" id="area-${esc(a.id)}" data-id="${esc(a.id)}" data-cat="${esc(a.best_for?.[0] || '')}">
  <div class="area-card__media">${a.image ? img(a.image, { credits, url, sizes: '(max-width: 600px) 100vw, 420px', alt: a.name }) : ''}
    ${a.must_do || a.when || FAME_CHIP[a.fame] ? `<div class="area-card__flags">${flagChips({ must_do: a.must_do, when: a.when, fame: a.fame, country: a.country }, 'span', { trip: opts.trip })}</div>` : ''}
    ${opts.number ? `<span class="area-card__num" aria-label="Number ${esc(opts.number)} on the map">${esc(opts.number)}</span>` : ''}
    <div class="area-card__title"><h3>${opts.href ? `<a class="area-card__link" href="${esc(opts.href)}">${name}</a>` : name}</h3><p>${esc(COUNTRIES[a.country]?.flag || '')} ${esc(a.region)}</p></div>
  </div>
  <div class="area-card__body">
    <ul class="chips">${(a.best_for || []).map((c) => `<li class="chip" data-cat="${esc(c)}">${esc(CATEGORIES[c]?.icon || '')} ${esc(catLabel(c))}</li>`).join('')}</ul>
    <p class="area-card__why">${esc(a.why)}</p>
    ${a.highlights?.length ? `<p style="margin:0;font-size:14.5px;color:var(--ink-3)">${a.highlights.map(esc).join(' · ')}</p>` : ''}
    <div class="area-card__stats"><div class="area-card__stat"><span>Suggested</span><b>${esc(days)}</b></div><div class="area-card__stat"><span>Cost</span><b>${esc(cost)}</b></div></div>
    <div class="area-card__winter rich"><strong>Winter:</strong> ${mdInline(a.winter_note)}</div>
    ${opts.href ? `<p class="area-card__more">Open the ${esc(a.name)} page ${ICONS.arrow}</p>` : ''}
  </div>
</article>`;
}

/**
 * Index page: places grouped by country → city, as cards.
 * opts: { assetBase, inlineCss, placeUrl(p), cardMediaUrl(p, name, w), title, subtitle, areasUrl, fixtures }
 */
export function renderIndexPage(places, opts = {}) {
  const assetBase = opts.assetBase ?? 'assets/';
  const byCountry = {};
  for (const p of places) if (!hasPlaceholders(p)) ((byCountry[p.country] ||= {})[p.city] ||= []).push(p);
  const order = Object.keys(COUNTRIES);
  const countries = Object.keys(byCountry).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const sections = countries.map((c) => {
    const cities = byCountry[c];
    const n = Object.values(cities).flat().length;
    const info = opts.countries?.find((x) => x.id === c);
    const meta = [`${n} place${n === 1 ? '' : 's'}`, info?.days ? `${info.days} days` : '', info?.budget_brl_per_day ? `${fmtBRL(info.budget_brl_per_day)}/day` : '', info?.from && info?.to ? `${shortDate(info.from)} – ${shortDate(info.to)}` : ''].filter(Boolean).join(' · ');
    return `<section class="country" id="${esc(c)}"><div class="country__head"><h2>${esc(COUNTRIES[c]?.flag || '')} ${esc(countryName(c))}</h2><span>${esc(meta)}</span></div>
${Object.keys(cities).sort().map((city) => `<h3 class="city__name">${esc(titleCase(city))}</h3><div class="grid">${cities[city].sort((a, b) => a.name.localeCompare(b.name)).map((p) => renderPlaceCard(p, { trip: opts.countries ? { countries: opts.countries } : opts.trip, href: opts.placeUrl ? opts.placeUrl(p) : `places/${p.id}/`, mediaUrl: (n, w) => (opts.cardMediaUrl ? opts.cardMediaUrl(p, n, w) : `places/${p.id}/media/${n}-${w}.webp`) })).join('\n')}</div>`).join('\n')}
</section>`;
  }).join('\n');
  const body = `<body><nav class="topbar topbar--solid"><a class="brand" href="./">Asia Trip Ranker</a><span style="display:flex;gap:8px">${opts.areasUrl ? `<a href="${esc(opts.areasUrl)}">Areas</a>` : ''}${themeToggle()}</span></nav>
<main class="wrap"><header class="masthead"><h1>${esc(opts.title || 'The shortlist')}</h1><p>${esc(opts.subtitle || 'Every researched place for the winter 2026–27 trip, by country and city.')}</p>
<div class="nav-pills">${countries.map((c) => `<a class="chip" href="#${esc(c)}">${esc(countryName(c))}</a>`).join('')}</div></header>
${sections || '<p class="empty">No places yet. A curator adds them with <code>./atr new place</code>.</p>'}
</main><p class="site-foot">Asia Trip Ranker${opts.fixtures ? ' · <strong>fixture build</strong>' : ''}</p></body>`;
  return `${head({ title: `${opts.title || 'Places'} · Asia Trip Ranker`, assetBase, inlineCss: opts.inlineCss })}\n${body}\n</html>\n`;
}

const shortDate = (d) => { const t = new Date(String(d) + 'T00:00:00Z'); return isNaN(t) ? String(d) : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };

/**
 * Country overview map: one static map with a numbered pin per area.
 * map: { url, width, height, pins: [{ id, n, name, x, y }] } (x, y in % of the image; from lib/overview.js).
 */
export function renderCountryMap(map, { country } = {}) {
  if (!map?.pins?.length) return '';
  return `<figure class="omap" data-block="country_map"${country ? ` data-country="${esc(country)}"` : ''}><div class="omap__frame" style="aspect-ratio:${map.width} / ${map.height}"><img src="${esc(map.url)}" width="${map.width}" height="${map.height}" alt="Map of ${esc(countryName(country))} with ${map.pins.length} numbered areas" loading="lazy" decoding="async">
${map.pins.map((p) => `<a class="omap__pin" href="#area-${esc(p.id)}" style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%" title="${esc(p.name)}"><b>${esc(p.n)}</b><span>${esc(p.name)}</span></a>`).join('')}<span class="map__osm">© OpenStreetMap contributors</span></div>
<figcaption>${map.pins.map((p) => `<a href="#area-${esc(p.id)}"><b>${esc(p.n)}</b> ${esc(p.name)}</a>`).join('')}</figcaption></figure>`;
}

/**
 * Areas page: area cards grouped by country, with a country overview map when one is passed.
 * opts: { assetBase, inlineCss, areaMediaUrl(a, name, w), areaUrl?(a) → area page URL,
 *         countryMaps?: { [country]: { url, width, height, pins } } }
 */
export function renderAreasPage(areas, opts = {}) {
  const assetBase = opts.assetBase ?? 'assets/';
  const by = {};
  for (const a of areas) if (!hasPlaceholders(a)) (by[a.country] ||= []).push(a);
  const order = Object.keys(COUNTRIES);
  const sections = Object.keys(by).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((c) => {
    const map = opts.countryMaps?.[c];
    const num = Object.fromEntries((map?.pins || []).map((p) => [p.id, p.n]));
    return `<section class="country" id="${esc(c)}"><div class="country__head"><h2>${esc(COUNTRIES[c]?.flag || '')} ${esc(countryName(c))}</h2><span>${by[c].length} area${by[c].length === 1 ? '' : 's'}</span></div>${map ? renderCountryMap(map, { country: c }) : ''}<div class="grid" data-block="areas" data-country="${esc(c)}">${[...by[c]].sort((x, y) => (num[x.id] ?? 999) - (num[y.id] ?? 999)).map((a) => renderAreaCard(a, { trip: opts.trip, href: opts.areaUrl ? opts.areaUrl(a) : undefined, number: num[a.id], mediaUrl: (n, w) => (opts.areaMediaUrl ? opts.areaMediaUrl(a, n, w) : `areas/${a.country}/media/${n}-${w}.webp`) })).join('\n')}</div></section>`;
  }).join('\n');
  const body = `<body><nav class="topbar topbar--solid"><a class="brand" href="./">Asia Trip Ranker</a>${themeToggle()}</nav>
<main class="wrap"><header class="masthead"><h1>Where to go</h1><p>Region and city cards for the broad round: Must, Maybe or Skip.</p></header>
${sections || '<p class="empty">No area cards yet. A curator adds them with <code>./atr new area</code>.</p>'}</main><p class="site-foot">Asia Trip Ranker</p></body>`;
  return `${head({ title: 'Areas · Asia Trip Ranker', assetBase, inlineCss: opts.inlineCss })}\n${body}\n</html>\n`;
}
