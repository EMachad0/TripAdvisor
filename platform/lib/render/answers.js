// Answer cards (answers/*.md, platform/lib/answers.js) as HTML: the "Questions and answers" section of a place or
// area page and the cards of the site's Answers page. Everything goes through esc / md / mdInline.
import { esc, md, mdInline, safeUrl } from './escape.js';
import { hostOf } from './util.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "13 Nov 2026" from "2026-11-13" (a calendar date: no clock time, so no timezone). */
export const answerDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : esc(d));

/** The "About …" bit of a card: a link to the place or area page, the country, or the whole trip. */
function aboutHtml(t, hrefOf) {
  if (!t) return '';
  if (t.kind === 'trip') return '<span class="qa__about">About the whole trip</span>';
  if (t.kind === 'country') return `<span class="qa__about">About <b data-country="${esc(t.id)}">${esc(t.name)}</b></span>`;
  const href = hrefOf ? hrefOf(t) : `/${t.kind}/${encodeURIComponent(t.id)}`;
  return `<span class="qa__about">About <a href="${esc(href)}" data-open-kind="${esc(t.kind)}" data-open-id="${esc(t.id)}">${esc(t.name)}</a></span>`;
}

/**
 * One answer card. opts: { showAbout (default true), hrefOf(target) → url, open (details open) }.
 * The full answer and the sources fold away under the tldr.
 */
export function renderAnswerCard(a, opts = {}) {
  const { showAbout = true, hrefOf, open = false } = opts;
  const body = String(a.body || '').trim();
  const sources = a.sources || [];
  const more = body || sources.length
    ? `<details class="qa__more"${open ? ' open' : ''}><summary>${body ? `Full answer${sources.length ? ` and ${sources.length === 1 ? 'source' : 'sources'}` : ''}` : `${sources.length === 1 ? 'Source' : `Sources (${sources.length})`}`}</summary>
  ${body ? `<div class="qa__body rich">${md(body)}</div>` : ''}
  ${sources.length ? `<ul class="qa__src">${sources.map((s) => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>${hostOf(s.url) ? ` <small>${esc(hostOf(s.url))}</small>` : ''}</li>`).join('')}</ul>` : ''}
</details>`
    : '';
  const meta = [`<time datetime="${esc(a.asked)}">Asked ${answerDate(a.asked)}</time>`, a.updated ? `<span>Updated ${answerDate(a.updated)}</span>` : '', showAbout ? aboutHtml(a.target, hrefOf) : ''].filter(Boolean).join('<span aria-hidden="true"> · </span>');
  return `<article class="qa" id="answer-${esc(a.id)}" data-answer="${esc(a.id)}">
  <h3 class="qa__q"><span class="qa__mark" aria-hidden="true">Q</span><span>${esc(a.question)}</span></h3>
  <p class="qa__meta">${meta}</p>
  <p class="qa__tldr">${mdInline(a.tldr)}</p>
  ${more}
</article>`;
}

/**
 * The "Questions and answers" section for a place or area page, or '' when nothing is about it.
 * opts.card(answer) → html lets the game add its timezone marker to each card.
 */
export function renderAnswersSection(answers, item, opts = {}) {
  if (!answers?.length) return '';
  const card = opts.card || ((a) => renderAnswerCard(a, { showAbout: false }));
  const n = answers.length;
  return `<section class="block wrap qa-sec" id="answers" aria-label="Questions and answers"><div class="col">
  <p class="eyebrow">Questions and answers</p>
  <h2 class="h2">${n === 1 ? 'One answer' : `${n} answers`} about ${esc(item.short_name || item.name)}</h2>
  <div class="qa-list">${answers.map(card).join('\n')}</div>
</div></section>`;
}
