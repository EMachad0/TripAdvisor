// Formatting + image helpers shared by page, card and site renderers.
import { esc } from './escape.js';
import { COUNTRIES, CATEGORIES, BOOK_METHODS } from '../schema/enums.js';

export const SYMBOLS = { CNY: '¥', JPY: '¥', KRW: '₩', HKD: 'HK$', THB: '฿', USD: 'US$', BRL: 'R$' };
export const LANG = { china: 'zh-Hans', 'hong-kong': 'zh-Hant', japan: 'ja', korea: 'ko', thailand: 'th', singapore: 'en-SG' };

export function fmtBRL(n) {
  if (typeof n !== 'number') return '';
  if (n === 0) return 'Free';
  const digits = n < 20 && !Number.isInteger(n) ? 2 : 0;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function fmtLocal(n, cur) {
  if (typeof n !== 'number') return '';
  if (n === 0) return 'Free';
  const digits = ['KRW', 'JPY'].includes(cur) || Number.isInteger(n) ? 0 : 2;
  return `${SYMBOLS[cur] ?? cur + ' '}${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
/** Short form for headings: short_name, else the part of name before a colon/dash ("Shanghai Museum: Ancient Americas" → "Shanghai Museum"). */
export const shortName = (p) => {
  if (p?.short_name) return p.short_name;
  const n = String(p?.name || '');
  const m = n.match(/^(.{3,}?)\s*[:：|]\s+\S/);
  return m ? m[1] : n;
};
export const titleCase = (slug) => String(slug ?? '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
export const countryName = (id) => COUNTRIES[id]?.name ?? titleCase(id);
export const catLabel = (id) => CATEGORIES[id]?.label ?? titleCase(id);
/** Label of a booking method. Pass book_ahead too so `platform` can name the site ("Book on Hostelworld"). */
export const methodLabel = (m, ba) => (m === 'platform' ? (bookingLinks(ba).find((l) => !isTel(l.url)) ? `Book on ${platformName(bookingLinks(ba).find((l) => !isTel(l.url)).url)}` : 'Booking platform') : { 'passport-registered': 'Passport real-name booking', app: 'Book in app', website: 'Official website', tour: 'Tour only', phone: 'Phone booking', 'walk-in': 'Walk-in' }[m] ?? m);
export const methodDesc = (m) => BOOK_METHODS[m] ?? '';

export { bookBadgeText, bookingLevel } from '../booking.js';
import { bookingLinks, platformName, isTel } from '../booking.js';

/** Build an <img> with srcset from a credit entry. */
export function img(name, { credits = [], url, sizes = '100vw', alt, eager = false, cls = '' } = {}) {
  if (!name) return '';
  const c = credits.find((x) => x.file === name);
  const widths = (c?.widths?.length ? c.widths : [1280]).slice().sort((a, b) => a - b);
  const pick = widths.find((w) => w >= 1280) ?? widths.at(-1);
  const srcset = widths.map((w) => `${esc(url(name, w))} ${w}w`).join(', ');
  const ratio = c?.width && c?.height ? c.height / c.width : null;
  const w = pick, h = ratio ? Math.round(pick * ratio) : null;
  const a = alt ?? c?.description ?? c?.title?.replace(/^File:/, '').replace(/\.[a-z]+$/i, '') ?? '';
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(url(name, pick))}" srcset="${srcset}" sizes="${esc(sizes)}" alt="${esc(String(a).slice(0, 200))}"${h ? ` width="${w}" height="${h}"` : ''} ${eager ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'}>`;
}

export function creditLine(c, { link = true } = {}) {
  if (!c) return '';
  const author = esc(c.author || 'Unknown');
  const lic = c.license_url && link ? `<a href="${esc(c.license_url)}" rel="noopener license" target="_blank">${esc(c.license)}</a>` : esc(c.license);
  const src = c.source_url && link ? `<a href="${esc(c.source_url)}" rel="noopener" target="_blank">${author}</a>` : author;
  return `Photo: ${src} · ${lic}`;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export const themeBoot = `<script>(function(){try{var t=localStorage.getItem('atr-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;
export const themeToggle = (cls = '') => `<button type="button" class="theme-toggle ${cls}" aria-label="Toggle light/dark theme" onclick="(function(){var r=document.documentElement,c=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),n=c==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('atr-theme',n);}catch(e){}})()"><svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg><span class="lbl">Theme</span></button>`;
