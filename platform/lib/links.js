// Link checker: open every URL a place or area carries and classify the answer.
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { dataRoots } from './paths.js';
import { sleep, httpsGet } from './net.js';
import { readYaml } from './yamlio.js';
import { joinPath } from './schema/dsl.js';
import { bookingLinks } from './booking.js';

// A normal browser User-Agent: nothing that identifies this project or its user.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
/** Hosts that answer bots with a wall: never fetched, always `blocked`. */
export const BOT_WALLED = ['trip.com', 'klook.com', 'getyourguide.com', 'viator.com', 'tripadvisor.com'];
export const LINK_TTL_MS = 24 * 3600 * 1000;
const BOT_TITLE = /just a moment|attention required|access denied|verify (that )?you are (a )?human|security check|are you a robot|captcha|pardon our interruption|request blocked/i;
const DEAD_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_NONAME', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_SSL_WRONG_VERSION_NUMBER', 'EPROTO']);
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_NONAME', 'EAI_AGAIN', 'EAI_FAIL', 'ESERVFAIL', 'ENODATA']);
/** Why a request failed: dns | tcp | tls | timeout | other. */
export function failureKind(code) {
  if (DNS_CODES.has(code)) return 'dns';
  if (/^(ERR_TLS|CERT_|ERR_SSL|UNABLE_TO_VERIFY|DEPTH_ZERO|SELF_SIGNED|EPROTO)/.test(code)) return 'tls';
  if (/^(ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|UND_ERR_SOCKET)$/.test(code)) return 'tcp';
  if (/TIMEOUT|ETIMEDOUT/i.test(code)) return 'timeout';
  return 'other';
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const isRoot = (u) => /^\/?(index\.[a-z]+|home|en|en-us|zh|ja|ko)?\/?$/i.test(u.pathname) && !u.search;

const MD_LINK = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
/** Every URL of a place or area: [{ url, pathArr, what }] (first occurrence of each URL). */
export function collectLinks(data) {
  const out = [], seen = new Set();
  const add = (url, pathArr, what) => { if (typeof url === 'string' && /^https?:\/\//.test(url) && !seen.has(url)) { seen.add(url); out.push({ url, pathArr, what }); } };
  (Array.isArray(data?.sources) ? data.sources : []).forEach((s, i) => add(s?.url, ['sources', i, 'url'], 'source'));
  const ba = data?.book_ahead;
  if (ba?.link) add(ba.link, ['book_ahead', 'link'], 'booking link');
  (Array.isArray(ba?.links) ? ba.links : []).forEach((l, i) => add(l?.url, ['book_ahead', 'links', i, 'url'], 'booking link'));
  const walk = (v, p) => {
    if (typeof v === 'string') for (const m of v.matchAll(MD_LINK)) add(m[1], p, 'link in text');
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...p, i]));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'sources') walk(x, [...p, k]);
  };
  walk(data, []);
  return out;
}

/**
 * Open one URL. Returns { status: 'ok' | 'dead' | 'moved' | 'blocked' | 'timeout', http?, finalUrl?, detail }.
 * opts: { timeoutMs = 15000, fetch }
 */
async function plainCheck(url, opts = {}) {
  const host = hostOf(url);
  if (BOT_WALLED.some((h) => host === h || host.endsWith('.' + h))) return { status: 'blocked', reason: 'walled', detail: `${host} blocks automated checks` };
  let u;
  try { u = new URL(url); } catch { return { status: 'dead', detail: 'not a valid URL' }; }
  const f = opts.fetch || fetch;
  let res;
  try {
    res = await f(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 15000) });
  } catch (e) {
    const code = e?.cause?.code || e?.code || '';
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /TIMEOUT/i.test(code)) {
      // Some hosts (several mainland-China sites) are slow or unreachable from abroad: try once more, with twice the time.
      const first = opts.timeoutMs ?? 15000;
      if (!opts._retry) {
        const again = await plainCheck(url, { ...opts, _retry: true, timeoutMs: opts.retryTimeoutMs ?? first * 2 });
        return again.status === 'timeout' ? { ...again, detail: `couldn't connect from this machine (tried ${Math.round(first / 1000)} s, then ${Math.round((opts.retryTimeoutMs ?? first * 2) / 1000)} s)` } : again;
      }
      return { status: 'timeout', reason: 'timeout', detail: `no answer within ${Math.round(first / 1000)} s` };
    }
    const kind = failureKind(code);
    if (DEAD_CODES.has(code) || /^(ERR_TLS|CERT_|ERR_SSL)/.test(code) || kind === 'dns') return { status: 'dead', reason: kind, code, detail: kind === 'dns' ? 'the domain does not exist (DNS)' : code === 'ECONNREFUSED' ? 'connection refused' : `TLS/connection failure (${code})` };
    return { status: 'timeout', reason: kind === 'other' ? 'tcp' : kind, code, detail: `couldn't connect from this machine (${code || e?.message || 'network error'})` };
  }
  const http = res.status;
  let finalUrl = url;
  try { if (res.url) finalUrl = res.url; } catch { /* keep */ }
  let head = '';
  try {
    if (http < 300 && /html/i.test(res.headers.get('content-type') || '')) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (head.length < 16000) { const { done, value } = await reader.read(); if (done) break; head += dec.decode(value, { stream: true }); }
      reader.cancel().catch(() => {});
    } else res.body?.cancel?.().catch(() => {});
  } catch { /* body not needed */ }
  if (http === 404 || http === 410) return { status: 'dead', reason: 'http', http, finalUrl, detail: `HTTP ${http}: the page is gone` };
  // Some gateways refuse Node's fetch but not a plain request (Hostelworld's availability/reviews JSON: 403 on about
  // every other fetch, 200 from curl and node:https). Ask once more that way before calling the link blocked.
  const rawGet = opts.rawGet ?? (opts.fetch ? null : httpsGet);
  if ((http === 401 || http === 403) && rawGet && !opts._raw) {
    try {
      const r2 = await rawGet(url, { headers: { ...HEADERS, Accept: 'application/json, text/html;q=0.9, */*;q=0.8' }, timeoutMs: opts.timeoutMs ?? 15000, maxBytes: 16000 });
      if (r2.status >= 200 && r2.status < 300) return { status: 'ok', http: r2.status, finalUrl: r2.url || finalUrl, detail: `HTTP ${r2.status} (a second, plain request; the first got ${http})` };
    } catch { /* keep the first answer */ }
  }
  if (http === 401 || http === 403 || http === 429 || http >= 500) return { status: 'blocked', reason: 'http', http, finalUrl, detail: `HTTP ${http}${http === 429 ? ' (rate limit or bot block)' : http === 403 ? ' (refused: often a bot block)' : ''}` };
  if (http >= 400) return { status: 'blocked', reason: 'http', http, finalUrl, detail: `HTTP ${http}` };
  if (http >= 300) return { status: 'moved', reason: 'http', http, finalUrl, detail: `HTTP ${http} redirect that leads nowhere` };
  let fu;
  try { fu = new URL(finalUrl); } catch { fu = u; }
  if (!isRoot(u) && isRoot(fu)) return { status: 'moved', http, finalUrl, detail: `redirects to the ${hostOf(finalUrl) === host ? "site's home page" : `home page of ${hostOf(finalUrl)}`}: the specific page is probably gone` };
  const title = head.match(/<title[^>]*>([^<]{0,200})/i)?.[1] || '';
  if (BOT_TITLE.test(title)) return { status: 'blocked', reason: 'bot', http, finalUrl, detail: `bot-check page ("${title.trim().slice(0, 60)}")` };
  return { status: 'ok', http, finalUrl, detail: `HTTP ${http}` };
}

async function resolves(lookup, host) {
  try { const r = await Promise.race([lookup(host), sleep(8000).then(() => { throw new Error('lookup timeout'); })]); return r?.address || (Array.isArray(r) ? r[0]?.address : 'yes'); } catch { return null; }
}
const NEEDS_BROWSER = (r) => (r.status === 'timeout' || (r.status === 'dead' && r.reason !== 'http') || (r.status === 'blocked' && r.reason !== 'walled')) && r.reason !== 'dns-unavailable';

/**
 * Open one URL. Returns { status: 'ok' | 'dead' | 'moved' | 'blocked' | 'timeout', reason?, http?, finalUrl?, via?, detail }.
 * reason says why it is not ok: dns | tcp | tls | timeout | http | bot | walled | dns-flaky | dns-unavailable.
 * Before a link is called dead or blocked: a DNS or connection failure is retried once; a DNS failure is checked
 * against the system resolver (dns.lookup, what curl uses) and against a known host (DNS down = nothing judged);
 * then, when opts.browserCheck is given, the page is opened in Chrome, and if Chrome shows it, it is ok.
 * opts: { timeoutMs = 15000, retryTimeoutMs, retryDelayMs = 1500, fetch, lookup, browserCheck }
 */
export async function checkUrl(url, opts = {}) {
  let r = await plainCheck(url, opts);
  if (r.reason === 'dns' || (r.reason === 'tcp' && r.status === 'dead')) {
    await sleep(opts.retryDelayMs ?? 1500);
    const again = await plainCheck(url, { ...opts, _retry: true });
    if (again.status === 'ok' || again.reason !== r.reason) return again.status === 'ok' ? { ...again, detail: `${again.detail} (second try; the first failed: ${r.detail})` } : again;
    r = again;
  }
  if (r.reason === 'dns') {
    const lookup = opts.lookup ?? (opts.fetch ? null : dns.promises.lookup);
    if (lookup) {
      const own = await resolves(lookup, new URL(url).hostname);
      if (own) r = { ...r, status: 'timeout', reason: 'dns-flaky', detail: `the name resolves on this machine (${own}) but the request failed with ${r.code || 'a DNS error'}: a resolver/proxy problem here, not proof the site is gone` };
      else if (!(await resolves(lookup, 'en.wikipedia.org'))) r = { status: 'timeout', reason: 'dns-unavailable', detail: "DNS unavailable on this machine (even en.wikipedia.org doesn't resolve): nothing was judged; re-run later or outside the sandbox" };
    }
  }
  if (opts.browserCheck && NEEDS_BROWSER(r)) {
    let b;
    try { b = await opts.browserCheck(url); } catch (e) { b = { error: e.message.split('\n')[0] }; }
    if (b.ok) return { status: 'ok', reason: r.reason, via: 'browser', http: b.status ?? undefined, finalUrl: b.finalUrl || url, detail: `opens in a browser${b.status ? ` (HTTP ${b.status})` : ''}; a plain request got: ${r.detail}` };
    if (b.blocked) return { ...r, status: 'blocked', reason: 'bot', via: 'browser', detail: `${r.detail}; a browser got a bot check (${b.why || 'challenge page'})` };
    r = { ...r, detail: `${r.detail}; a browser could not open it either (${b.error || `HTTP ${b.status}`})` };
  }
  return r;
}

const cacheFile = (opts) => opts.cacheFile || path.join(dataRoots(opts).cache, 'links.json');
export function readLinkCache(opts = {}) { try { return JSON.parse(fs.readFileSync(cacheFile(opts), 'utf8')); } catch { return {}; } }
function writeLinkCache(opts, c) { fs.mkdirSync(path.dirname(cacheFile(opts)), { recursive: true }); fs.writeFileSync(cacheFile(opts), JSON.stringify(c, null, 1)); }
/** Network failures (DNS, connection, TLS, timeouts) may be this machine's fault: re-checked after an hour, not a day. */
export const FAILURE_TTL_MS = 3600 * 1000;
const NETWORK_REASONS = new Set(['dns', 'tcp', 'tls', 'timeout', 'dns-flaky', 'other']);
const reasonOf = (e) => e.reason || (e.status === 'timeout' ? 'timeout' : e.status === 'dead' && !e.http ? 'dns' : e.http ? 'http' : undefined);
const ttlOf = (e) => (NETWORK_REASONS.has(reasonOf(e)) ? FAILURE_TTL_MS : LINK_TTL_MS);
const fresh = (e, now) => e && e.reason !== 'dns-unavailable' && now - Date.parse(e.checked) < ttlOf(e);

/**
 * Check many URLs: at most `concurrency` hosts at once, one request per host at a time. Cached for 24 h.
 * opts: { fresh, concurrency = 4, timeoutMs, fetch, cacheFile, now }
 * Returns { [url]: { status, http?, finalUrl?, detail, checked, cached } }
 */
export async function checkLinks(urls, opts = {}) {
  const now = opts.now ?? Date.now();
  const cache = readLinkCache(opts);
  const out = {};
  const queues = new Map();
  for (const url of [...new Set(urls)]) {
    if (!opts.fresh && fresh(cache[url], now)) { out[url] = { ...cache[url], cached: true }; continue; }
    const h = hostOf(url);
    queues.set(h, [...(queues.get(h) || []), url]);
  }
  const hosts = [...queues.values()];
  const useBrowser = !opts.browserCheck && opts.browser !== false && !opts.fetch && process.env.ATR_LINKS_BROWSER !== '0' && hosts.length;
  let probe;
  const browserCheck = opts.browserCheck || (useBrowser ? async (u) => {
    if (!probe) { const { openBrowserProbe } = await import('./pageview.js'); probe = openBrowserProbe(); }
    opts.onBrowser?.(u);
    return probe.check(u);
  } : undefined);
  const fresh1 = [];
  const worker = async () => { for (let q; (q = hosts.shift());) for (const url of q) { const r = await checkUrl(url, { ...opts, browserCheck }); fresh1.push(url); cache[url] = { ...r, checked: new Date(now).toISOString() }; out[url] = { ...cache[url], cached: false }; } };
  try { await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, hosts.length) }, worker)); } finally { await probe?.close(); }
  // Every host failing DNS means this machine has no DNS, not that every site is gone.
  const freshHosts = new Set(fresh1.map(hostOf));
  if (freshHosts.size >= 2 && fresh1.every((u) => out[u].reason === 'dns' || out[u].reason === 'dns-unavailable')) {
    for (const u of fresh1) { out[u] = { status: 'timeout', reason: 'dns-unavailable', detail: `DNS unavailable on this machine (none of the ${freshHosts.size} hosts resolved): nothing was judged; re-run later or outside the sandbox`, checked: out[u].checked, cached: false }; cache[u] = { ...out[u] }; delete cache[u].cached; }
  }
  for (const u of fresh1) if (cache[u].reason === 'dns-unavailable') delete cache[u]; // never remembered
  if (fresh1.length || Object.values(out).some((r) => !r.cached)) writeLinkCache(opts, cache);
  return out;
}

const LEVEL = { dead: 'error', moved: 'warning', timeout: 'warning', blocked: 'info' };
const ADVICE = {
  dead: "find the page's new URL or replace the source; never keep a source you can't open",
  moved: 'the specific page is probably gone: find its new URL or replace it',
  timeout: "couldn't connect from this machine; if a web fetch opens it, keep the source and say so in `confidence_note`",
  blocked: "can't be checked automatically; say how you found it in `confidence_note`",
};
/** Fix-it issue for one checked link (null when ok). */
export function linkIssue(link, r) {
  if (!r || r.status === 'ok') return null;
  return {
    level: LEVEL[r.status], path: joinPath(link.pathArr), pathArr: link.pathArr, status: r.status, url: link.url,
    ...(r.reason ? { reason: r.reason } : {}), ...(r.cached ? { cached: true, checked: r.checked } : {}),
    message: `${link.what} ${r.status}: ${link.url} — ${r.detail}${r.finalUrl && r.finalUrl !== link.url && r.status === 'moved' ? ` (ended at ${r.finalUrl})` : ''}${r.cached && r.checked ? ` [cached result from ${String(r.checked).slice(0, 16).replace('T', ' ')} UTC; --fresh re-checks]` : ''}`,
    expected: r.status === 'blocked' ? undefined : 'a URL that opens the page the facts came from', hint: ADVICE[r.status],
  };
}

/**
 * Check the links of place / area files. files: [{ file, id, kind }].
 * Returns { offline?, results: [{ file, id, kind, links: n, issues }], counts: { ok, dead, moved, blocked, timeout }, errors, warnings }
 */
export async function linkReport(files, opts = {}) {
  const offline = opts.offline ?? (process.env.ATR_OFFLINE === '1');
  if (offline) return { offline: true, results: [], counts: {}, errors: 0, warnings: 0 };
  const docs = files.map((f) => { const y = readYaml(f.file); return { ...f, links: y.data ? collectLinks(y.data) : [], lineOf: y.lineOf }; });
  const checked = await checkLinks(docs.flatMap((d) => d.links.map((l) => l.url)), opts);
  const counts = { ok: 0, dead: 0, moved: 0, blocked: 0, timeout: 0 };
  const results = docs.map((d) => {
    const issues = [];
    for (const l of d.links) {
      const r = checked[l.url];
      counts[r.status]++;
      const i = linkIssue(l, r);
      if (i) issues.push({ ...i, line: d.lineOf(l.pathArr) });
    }
    return { file: d.file, id: d.id, kind: d.kind, links: d.links.length, issues };
  });
  const n = (lvl) => results.reduce((s, r) => s + r.issues.filter((i) => i.level === lvl).length, 0);
  const urls = [...new Set(docs.flatMap((d) => d.links.map((l) => l.url)))];
  const viaBrowser = urls.filter((u) => checked[u].status === 'ok' && checked[u].via === 'browser');
  const cached = urls.filter((u) => checked[u].cached).length;
  return { results, counts, errors: n('error'), warnings: n('warning'), viaBrowser, cached };
}

/** From the cache only (no network): dead / moved links of one place or area. [{ url, status, detail, checked }] */
export function cachedLinkProblems(data, cache) {
  return collectLinks(data).map((l) => ({ ...l, ...(cache[l.url] || {}) })).filter((l) => l.status === 'dead' || l.status === 'moved');
}
