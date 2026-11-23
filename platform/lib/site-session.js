// Open pages of the hosted site as the read-only guest (docs/DEPLOY.md), so an agent can see what the site serves.
// Everything but /healthz and /login redirects to the sign-in page without a session, and the guest account sees
// what the owner sees while every change is refused, so it is the right account for a check.
// Rules:
// - the login comes from ATR_GUEST_USERNAME / ATR_GUEST_PASSWORD or the macOS keychain (service "atr-guest-login",
//   the account name is the username); it is never an argument, never printed and never written anywhere;
// - the session cookie stays in memory, is only ever sent to the site's own origin, and the session is signed out
//   when the work is done (sessions last 400 days otherwise).
import { execFileSync } from 'node:child_process';
import { SITE } from './site.js';

export const GUEST_KEYCHAIN_SERVICE = 'atr-guest-login';
export const GUEST_SETUP = `set ATR_GUEST_PASSWORD (and ATR_GUEST_USERNAME when it is not "guest"), or store the login once in the keychain with \`security add-generic-password -s ${GUEST_KEYCHAIN_SERVICE} -a <guest username> -w\` (it prompts for the password)`;

export class SiteSessionError extends Error {}

/** The guest login: the environment, else the macOS keychain. → { username, password } or null when there is none. */
export function readGuestLogin({ env = process.env, platform = process.platform, exec = execFileSync } = {}) {
  if (env.ATR_GUEST_PASSWORD) return { username: (env.ATR_GUEST_USERNAME || 'guest').trim(), password: env.ATR_GUEST_PASSWORD };
  if (platform !== 'darwin') return null;
  const security = (extra) => exec('security', ['find-generic-password', '-s', GUEST_KEYCHAIN_SERVICE, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const password = security(['-w']).replace(/\r?\n$/, '');
    if (!password) return null;
    const account = /"acct"<blob>="((?:[^"\\]|\\.)*)"/.exec(security([]))?.[1];
    return { username: (env.ATR_GUEST_USERNAME || account || 'guest').trim(), password };
  } catch { return null; }
}

/** name=value pairs of a response's Set-Cookie headers, merged into `jar` (an emptied cookie is dropped). */
function keepCookies(jar, response) {
  const lines = typeof response.headers?.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = line.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq < 1) continue;
    const name = pair.slice(0, eq).trim(), value = pair.slice(eq + 1).trim();
    if (value === '' || /;\s*max-age=0\b/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = (jar) => [...jar].map(([n, v]) => `${n}=${v}`).join('; ');

/**
 * Sign in to the site. → a session { get(path), close() }. Throws SiteSessionError (never with the password in it).
 * `get` follows redirects inside the site only and answers { status, url, html, signedOut }.
 */
export async function openSiteSession({ login, site = SITE, fetchImpl = fetch } = {}) {
  if (!login) throw new SiteSessionError(`no guest login: ${GUEST_SETUP}`);
  const origin = new URL(site.url).origin;
  const jar = new Map();
  const call = async (pathname, init = {}) => {
    const r = await fetchImpl(`${origin}${pathname}`, { redirect: 'manual', signal: AbortSignal.timeout(20e3), ...init, headers: { origin, ...(jar.size ? { cookie: cookieHeader(jar) } : {}), ...init.headers } });
    keepCookies(jar, r);
    return r;
  };
  let r;
  try {
    r = await call('/api/auth/sign-in/username', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: login.username, password: login.password, rememberMe: true }) });
  } catch (e) { throw new SiteSessionError(`the site did not answer the sign-in (${e.cause?.code || e.message})`); }
  if (r.status === 429) throw new SiteSessionError('the site refuses sign-ins for now (too many failed attempts): try again in 10 minutes');
  if (r.status === 401 || r.status === 403) throw new SiteSessionError(`the site refused the guest login (HTTP ${r.status}): the stored username or password is wrong. To replace it: ${GUEST_SETUP.replace('add-generic-password', 'add-generic-password -U')}`);
  if (!r.ok || !jar.size) throw new SiteSessionError(`the guest sign-in failed (HTTP ${r.status}${r.ok ? ', no session cookie' : ''})`);

  return {
    /** GET a site path (must start with "/"). */
    async get(pathname) {
      if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) throw new SiteSessionError(`not a site path: ${pathname} (give a path such as /place/yu-garden)`);
      let at = pathname;
      for (let hop = 0; hop < 5; hop++) {
        let res;
        try { res = await call(at, { headers: { accept: 'text/html,*/*' } }); } catch (e) { throw new SiteSessionError(`the site did not answer ${at} (${e.cause?.code || e.message})`); }
        const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
        if (!next) return { status: res.status, url: `${origin}${at}`, html: await res.text(), signedOut: false };
        const to = new URL(next, `${origin}${at}`);
        if (to.origin !== origin) return { status: res.status, url: `${origin}${at}`, html: '', signedOut: false, location: to.href };
        if (to.pathname === '/login') return { status: res.status, url: `${origin}${at}`, html: '', signedOut: true };
        at = `${to.pathname}${to.search}`;
      }
      throw new SiteSessionError(`${pathname} keeps redirecting`);
    },
    /** Sign the session out (best effort). */
    async close() {
      try { await call('/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } catch { /* the session just expires later */ }
      jar.clear();
    },
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m));

/** The readable text of an HTML page: no scripts, styles or tags, one block per line. */
export function htmlText(html) {
  return decode(String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|svg|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer|\/summary|\/details)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

export const htmlTitle = (html) => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html)); return m ? decode(m[1]).trim() : null; };

/** What is wrong with a fetched page that should show answer card `id` (null when it is there). */
export function answerPageProblem(page, id) {
  if (page.signedOut) return 'the site sent the guest back to the sign-in page';
  if (page.status !== 200) return `HTTP ${page.status}`;
  if (!page.html.includes(`id="answer-${id}"`)) return 'the page opens but the card is not on it';
  return null;
}
