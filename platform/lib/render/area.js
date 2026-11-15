// Area page renderer (pure: data in, HTML string out). The page a traveler opens from an area card:
// hero, facts strip, the curator's blocks, winter note, must-dos in this area, researched places, map, sources.
import { esc, md } from './escape.js';
import { ICONS } from './icons.js';
import { RENDERERS, flagChips, titleStyle } from './blocks.js';
import { img, catLabel, titleCase, countryName, creditLine, LANG, themeToggle } from './util.js';
import { factSpans } from './layout.js';
import { COUNTRIES, CATEGORIES } from '../schema/enums.js';
import { AREA_BLOCK_TYPES } from '../schema/blocks.js';
import { isStay, focusPos, hasPlaceholders } from '../kinds.js';
import { tripMonths } from '../when.js';
import { renderPlaceCard, pageHead } from './index.js';

const COST = { low: ['$', 'Cheap', "well under the country's daily budget"], medium: ['$$', 'Average', 'about the daily budget'], high: ['$$$', 'Pricey', 'above the daily budget'] };
export const daysLabel = (d = {}) => (d.min === undefined ? '' : d.min === d.max ? `${d.min} day${d.min === 1 ? '' : 's'}` : `${d.min}–${d.max} days`);

/**
 * Places that belong to an area: same country and a city in `cities` (or the area id). Attractions first, then stays.
 * Unfinished pages (scaffold TODOs still in them) are left out: they would show as broken cards.
 */
export function areaPlaces(area, places = []) {
  const cities = new Set([...(area.cities || []), area.id]);
  const mine = (Array.isArray(places) ? places : Object.values(places)).filter((p) => p.country === area.country && cities.has(p.city) && !hasPlaceholders(p));
  const by = (a, b) => String(a.name).localeCompare(String(b.name));
  return [...mine.filter((p) => !isStay(p)).sort(by), ...mine.filter(isStay).sort(by)];
}

/** Must-do items located in this area: `city` is one of its cities, or the area itself claims the key. */
export function areaMustDo(area, mustDo = []) {
  const cities = new Set([...(area.cities || []), area.id]);
  return mustDo.filter((m) => (m.country === area.country && m.city && cities.has(m.city)) || (area.must_do && m.key === area.must_do));
}

const section = (inner, { width = 'col', cls = '' } = {}) => `<section class="block wrap ${cls}"><div class="${width === 'col' ? 'col' : width === 'mid' ? 'col mid' : ''}"${width === 'mid' ? ' style="max-width:980px"' : ''}>${inner}</div></section>`;
const heading = (eyebrow, title) => `${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}${title ? `<h2 class="h2">${esc(title)}</h2>` : ''}`;

/**
 * Render a full area page.
 * opts: {
 *   credits?: area media credits (default area._meta.credits),
 *   mediaBase? | mediaUrl?: (name, width) => url for the area's media,
 *   assetBase? (default '../../assets/'), inlineCss?, homeUrl? (back link, default '../../areas.html'),
 *   places?: every loaded place (array or {id: place}); the page picks the ones in this area,
 *   placeUrl?: (place) => url, placeMediaUrl?: (place, name, width) => url,
 *   mustDo?: mustDoStatus(taste, places, areas) — for "On your list here",
 *   staticMap?: { url, width, height } (city-scale OSM image; the pin is an overlay),
 *   number?: the area's number on the country overview map,
 *   trip?: trip config or the { from, to } window for this country (dated pages say when they are off the route),
 *   fragment?: true → only the <body>
 * }
 */
export function renderAreaPage(area, opts = {}) {
  const a = area;
  const credits = opts.credits || a._meta?.credits || [];
  const url = opts.mediaUrl || ((name, w) => `${opts.mediaBase ?? 'media/'}${name}-${w}.webp`);
  const assetBase = opts.assetBase ?? '../../assets/';
  const homeUrl = opts.homeUrl ?? '../../areas.html';
  const lang = LANG[a.country] || 'und';
  const blocks = Array.isArray(a.blocks) ? a.blocks.filter((b) => b && AREA_BLOCK_TYPES.includes(b.type) && RENDERERS[b.type]) : [];
  const heroB = blocks.find((b) => b.type === 'hero') || {};
  const rest = blocks.filter((b) => b.type !== 'hero');
  const shim = { ...a, cover: a.image, blocks: [...blocks, { type: 'hero', image: heroB.image || a.image }] }; // lets the place block renderers (sources, gallery) work on an area
  const ctx = { place: shim, credits, url, opts, lang };
  const tag = (type, html) => String(html).replace(/^(\s*<(?:section|header|footer|div))/, `$1 data-block="${type}"`);
  const parts = [];

  // Hero: the photo, the name, where it is.
  const heroImg = heroB.image || a.image;
  const credit = credits.find((c) => c.file === heroImg);
  const image = credit ? `<picture class="hero__img">${img(heroImg, { credits, url, eager: true, sizes: '100vw', alt: heroB.hook || a.name })}</picture>` : '';
  const chips = [
    `<li class="chip chip--cat">${esc(COUNTRIES[a.country]?.flag || '')} ${esc(countryName(a.country))}</li>`,
    flagChips(a, 'li', { trip: opts.trip }),
    `<li class="chip">${esc(a.region || '')}</li>`,
    a.scope === 'region' ? '<li class="chip chip--tag">Region</li>' : '',
  ].join('');
  parts.push(tag('hero', `<header class="hero hero--area${image ? '' : ' hero--type'}" style="--focus:${esc(focusPos(heroB.focus))}">
  ${image}${image ? '' : `<div class="hero__type" aria-hidden="true"${a.name_local ? ` lang="${lang}"` : ''}>${esc(a.name_local || a.name)}</div>`}<div class="hero__shade"></div>
  <nav class="topbar"><a href="${esc(homeUrl)}" class="brand">${ICONS.back}<span class="lbl">All areas</span></a>${themeToggle()}</nav>
  <div class="hero__content">
    <ul class="chips" aria-label="Where">${chips}</ul>
    <h1 class="hero__title"${titleStyle(a.name)}>${opts.number ? `<span class="hero__num" aria-label="Number ${esc(opts.number)} on the map">${esc(opts.number)}</span>` : ''}${esc(a.name)}</h1>
    ${a.name_local ? `<p class="hero__local"><span lang="${lang}">${esc(a.name_local)}</span></p>` : ''}
    ${heroB.hook ? `<p class="hero__hook">${esc(heroB.hook)}</p>` : ''}
    ${a.must_do && a.must_do_note ? `<p class="hero__note">${ICONS.star}<span><b>On your list:</b> ${esc(a.must_do_note)}</span></p>` : ''}
    <div class="hero__badges"><span class="badge badge--free">${ICONS.calendar} ${esc(daysLabel(a.days_suggested))} suggested</span><span class="badge badge--free">${ICONS.wallet} ${esc(COST[a.cost_level]?.[0] || '')} ${esc(COST[a.cost_level]?.[1] || a.cost_level || '')}</span></div>
  </div>
  ${heroB.caption || (heroB.credit_inline && credit) ? `<p class="hero__credit">${ICONS.camera}<span>${heroB.caption ? esc(heroB.caption) : ''}${heroB.caption && heroB.credit_inline && credit ? ' · ' : ''}${heroB.credit_inline && credit ? creditLine(credit) : ''}</span></p>` : ''}
</header>`));

  // Facts strip
  const facts = [
    { icon: 'calendar', label: 'Suggested stay', value: daysLabel(a.days_suggested) },
    { cls: 'fact--money', icon: 'wallet', label: 'Cost level', value: COST[a.cost_level]?.[1] || a.cost_level, sub: COST[a.cost_level]?.[2] },
    a.getting_there && { icon: 'train', label: 'Getting there', value: a.getting_there },
    a.getting_around && { icon: 'pin', label: 'Getting around', value: a.getting_around },
  ].filter(Boolean);
  const spans = factSpans(facts.length);
  const size = (v) => { const n = String(v ?? '').length; return n > 60 ? ' fact__value--note' : n > 34 ? ' fact__value--xs' : n > 22 ? ' fact__value--sm' : ''; };
  parts.push(tag('facts', `<section class="facts" aria-label="Quick facts"><div class="facts__card">
${facts.map((f, i) => `<div class="fact ${f.cls || ''}" style="--d:${spans[i].dSpan};--m:${String(f.value).length > 34 ? 2 : spans[i].mSpan}"><p class="fact__label">${ICONS[f.icon]}${esc(f.label)}</p><p class="fact__value${size(f.value)}">${esc(f.value)}</p>${f.sub ? `<p class="fact__sub">${esc(f.sub)}</p>` : ''}</div>`).join('\n')}
<div class="hours bestfor"><b>Best for</b><ul class="chips">${(a.best_for || []).map((c) => `<li class="chip" data-cat="${esc(c)}">${esc(CATEGORIES[c]?.icon || '')} ${esc(catLabel(c))}</li>`).join('')}</ul>${a.highlights?.length ? `<span class="bestfor__hl">${a.highlights.map(esc).join(' · ')}</span>` : ''}</div>
</div></section>`));
  parts.push(`<section class="wrap"><p class="col lede${/^\p{L}/u.test(String(a.why || '')) ? ' lede--cap' : ''}">${esc(a.why)}</p></section>`);

  // The curator's blocks
  let sourcesB = null;
  for (const b of rest) {
    if (b.type === 'sources') { sourcesB = b; continue; }
    try { parts.push(tag(b.type, RENDERERS[b.type](b, ctx))); } catch (e) { parts.push(`<!-- block ${esc(b.type)} failed: ${esc(e.message)} -->`); }
  }

  // Winter note (unless a weather block already says it)
  if (a.winter_note && !rest.some((b) => b.type === 'weather')) parts.push(tag('winter', section(`${heading('Winter reality', null)}<div class="weather weather--note"><div class="weather__ico">${ICONS.thermo}</div><div><p class="weather__cond">${tripMonths(a, opts.trip)} in ${esc(a.name)}</p><div class="weather__note rich">${md(a.winter_note)}</div></div></div>`)));

  // On your list here
  const list = areaMustDo(a, opts.mustDo || []);
  const pUrl = opts.placeUrl || ((p) => `../../places/${p.id}/`);
  if (list.length) parts.push(tag('must_do', section(`${heading('On your list here', null)}<ul class="onlist">${list.map((m) => `<li class="onlist__item${m.covered ? ' onlist__item--done' : ''}"><span class="onlist__mark" aria-hidden="true">${m.covered ? '✔' : ICONS.star}</span><div><p class="onlist__said">“${esc(m.said)}”</p><p class="onlist__status">${m.covered ? `Covered by ${m.claims.map((c) => (c.type === 'area' ? (c.id === a.id ? 'this area' : esc(titleCase(c.id))) : `<a href="${esc(pUrl({ id: c.id }))}">${esc(titleCase(c.id))}</a>`)).join(', ')}` : `Not researched yet${m.want > 1 ? ` (${m.have} of ${m.want})` : ''}`}</p></div></li>`).join('')}</ul>`)));

  // Researched so far
  const mine = areaPlaces(a, opts.places || []);
  const pMedia = opts.placeMediaUrl || ((p, n, w) => `../../places/${p.id}/media/${n}-${w}.webp`);
  const stays = mine.filter(isStay).length;
  parts.push(tag('places', `<section class="block wrap">${heading('Researched so far', mine.length ? `${mine.length - stays} place${mine.length - stays === 1 ? '' : 's'}${stays ? ` and ${stays} stay${stays === 1 ? '' : 's'}` : ''} in ${a.name}` : null)}
${mine.length ? `<div class="grid">${mine.map((p) => renderPlaceCard(p, { href: pUrl(p), mediaUrl: (n, w) => pMedia(p, n, w), trip: opts.trip })).join('\n')}</div>` : `<p class="empty">Nothing researched in ${esc(a.name)} yet. Places appear here as the curator adds them.</p>`}</section>`));

  // Map
  const sm = opts.staticMap;
  if (typeof a.lat === 'number' && typeof a.lng === 'number') {
    const osm = `https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=11/${a.lat}/${a.lng}`;
    parts.push(tag('map', `<section class="block wrap">${heading('Location', `Where ${a.short_name || a.name} is`)}
<div class="map map--area">${sm
    ? `<a class="map__frame map__frame--static" href="${esc(osm)}" target="_blank" rel="noopener" aria-label="Open ${esc(a.name)} on OpenStreetMap"><img src="${esc(sm.url)}" width="${sm.width}" height="${sm.height}" alt="Map of ${esc(a.name)}" loading="lazy" decoding="async"><span class="map__pin" aria-hidden="true"><svg viewBox="0 0 32 44" width="34" height="46"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg></span>${a.approximate ? '<span class="map__approx">Approximate location</span>' : ''}<span class="map__osm">© OpenStreetMap contributors</span></a>`
    : `<a class="map__frame" href="${esc(osm)}" target="_blank" rel="noopener"><div class="map__ph" aria-hidden="true">${ICONS.pin}<span>Open map</span></div><span class="map__coords">${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}</span></a>`}</div></section>`));
  }

  parts.push(tag('sources', RENDERERS.sources(sourcesB, ctx)));
  parts.push('<p class="site-foot">Asia Trip Ranker · curated for a winter 2026–27 trip · <a href="#sources">sources &amp; photo credits</a></p>');
  const body = `<body data-cat="${esc(a.best_for?.[0] || '')}"><main class="page page--area">\n${parts.join('\n')}\n</main></body>`;
  if (opts.fragment) return body;
  return `${pageHead({ title: `${a.name} — ${countryName(a.country)} · Asia Trip Ranker`, description: a.why, assetBase, inlineCss: opts.inlineCss, cat: a.best_for?.[0] })}\n${body}\n</html>\n`;
}
