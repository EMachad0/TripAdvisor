// Login for the hosted site: two accounts, an owner (full access) and an optional read-only guest.
// Off when no owner password is configured (the local game). Passwords come from the environment
// (ATR_OWNER_PASSWORD, ATR_GUEST_PASSWORD); they are never stored in the repo.
// The session cookie is "<role>.<HMAC>", the HMAC keyed by that account's password over its role and
// username: nothing to store on the server, it survives restarts and deploys, a guest cookie can never
// pass as the owner's, and changing a password signs that account out on every device.
import crypto from 'node:crypto';

export const COOKIE = 'atr_session';
const MAX_AGE_S = 400 * 24 * 3600; // the browser cap; re-issued on every page load, so it never runs out mid-trip
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 10;

const hmac = (password, role, user) => crypto.createHmac('sha256', password).update(`atr-session-v2|${role}|${user}`).digest('hex');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// Compare digests so the timing does not depend on the guess's length.
const sameDigest = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const normUser = (u) => String(u ?? '').trim().toLowerCase();

/** The two accounts from the environment. Usernames default to "eliton" and "guest". */
export function accountsFromEnv(env = process.env) {
  return {
    owner: { user: env.ATR_OWNER_USER || 'eliton', password: env.ATR_OWNER_PASSWORD },
    guest: { user: env.ATR_GUEST_USER || 'guest', password: env.ATR_GUEST_PASSWORD },
  };
}

function cookieOf(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return '';
}

const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https' || !!req.socket?.encrypted;

/**
 * accounts: { owner: { user, password }, guest?: { user, password } }. Auth is on when the owner has a password;
 * the guest account exists only when it has a password too (and a username different from the owner's).
 */
export function createAuth(accounts = {}, { now = () => Date.now() } = {}) {
  const hasPw = (a) => typeof a?.password === 'string' && a.password.length > 0;
  const enabled = hasPw(accounts.owner);
  const list = [];
  if (enabled) {
    list.push({ role: 'owner', user: normUser(accounts.owner.user || 'eliton'), password: accounts.owner.password });
    const g = accounts.guest;
    if (hasPw(g) && normUser(g.user || 'guest') && normUser(g.user || 'guest') !== list[0].user) list.push({ role: 'guest', user: normUser(g.user || 'guest'), password: g.password });
  }
  for (const a of list) a.token = `${a.role}.${hmac(a.password, a.role, a.user)}`;
  const byRole = new Map(list.map((a) => [a.role, a]));
  let fails = []; // times of recent wrong guesses, all clients together: two people, so a global brake is enough

  const cookieFor = (req, a) => `${COOKIE}=${a.token}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`;
  /** The signed-in account for a request, or null. */
  const account = (req) => {
    const c = cookieOf(req);
    const a = byRole.get(c.slice(0, c.indexOf('.')));
    return a && same(c, a.token) ? a : null;
  };

  return {
    enabled,
    guestEnabled: byRole.has('guest'),
    /** { role, user } of the signed-in account; null when signed out or when auth is off. */
    who: (req) => { const a = enabled ? account(req) : null; return a ? { role: a.role, user: a.user } : null; },
    ok: (req) => !enabled || !!account(req),
    /** The same cookie again with a fresh Max-Age (sliding session), or null. */
    refreshCookie: (req) => { const a = enabled ? account(req) : null; return a ? cookieFor(req, a) : null; },
    /** Check a username and password. Returns { ok, cookie, role, user } | { ok: false, status, error }. */
    login(req, user, guess) {
      const t = now();
      fails = fails.filter((x) => t - x < WINDOW_MS);
      if (fails.length >= MAX_FAILS) return { ok: false, status: 429, error: 'Too many wrong tries. Wait ten minutes.' };
      // Check every account, username and password both, with no early exit: a wrong username costs the same as a wrong password.
      let hit = null;
      const u = normUser(user), g = typeof guess === 'string' ? guess : '';
      for (const a of list) {
        const userOk = sameDigest(u, a.user), pwOk = sameDigest(g, a.password);
        if (userOk && pwOk && !hit) hit = a;
      }
      if (!hit) { fails.push(t); return { ok: false, status: 401, error: 'Wrong username or password.' }; }
      return { ok: true, cookie: cookieFor(req, hit), role: hit.role, user: hit.user };
    },
    logoutCookie: `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  };
}

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A plain form that posts to /login (no script), so phone password managers offer to save it. */
export const loginPage = (themeBoot = '', { error = '', user = '' } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Asia Trip</title>
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
${themeBoot}
<link rel="stylesheet" href="/assets/atr.css">
<style>
  .login { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
  .login form { width: min(100%, 340px); display: grid; gap: 14px; }
  .login h1 { margin: 0; font: 600 28px/1.1 Fraunces, Georgia, serif; }
  .login input, .login button { font: inherit; padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); background: transparent; color: inherit; }
  .login button { cursor: pointer; font-weight: 600; background: #9b3d2a; border-color: #9b3d2a; color: #fff; }
  .login p { margin: 0; min-height: 1.4em; font-size: 14px; color: #b3402b; }
</style>
</head>
<body>
<main class="login">
  <form method="post" action="/login" autocomplete="on">
    <h1>Asia Trip</h1>
    <input type="text" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Username" aria-label="Username" value="${escHtml(user)}" required${user ? '' : ' autofocus'}>
    <input type="password" name="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required${user ? ' autofocus' : ''}>
    <button type="submit">Open</button>
    <p role="alert">${escHtml(error)}</p>
  </form>
</main>
</body>
</html>`;

