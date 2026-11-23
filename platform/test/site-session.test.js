// Guest sessions on the hosted site (lib/site-session.js): where the login comes from, the sign-in, redirects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readGuestLogin, openSiteSession, htmlText, htmlTitle, answerPageProblem, SiteSessionError, GUEST_KEYCHAIN_SERVICE } from '../lib/site-session.js';

const SITE = { url: 'https://trip.example' };
const res = (status, body = '', headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n) => headers[n] ?? null, getSetCookie: () => headers.cookies || [] }, text: async () => body });

test('guest login: the environment first, then the keychain (account name = username), else none', () => {
  assert.deepEqual(readGuestLogin({ env: { ATR_GUEST_PASSWORD: 'pw' }, platform: 'linux' }), { username: 'guest', password: 'pw' });
  assert.deepEqual(readGuestLogin({ env: { ATR_GUEST_PASSWORD: 'pw', ATR_GUEST_USERNAME: ' Visitor ' }, platform: 'linux' }), { username: 'Visitor', password: 'pw' });
  assert.equal(readGuestLogin({ env: {}, platform: 'linux' }), null);
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, ...args]); return args.includes('-w') ? 'secret word\n' : 'keychain: "x"\n    "acct"<blob>="friend"\n    "svce"<blob>="atr-guest-login"\n'; };
  assert.deepEqual(readGuestLogin({ env: {}, platform: 'darwin', exec }), { username: 'friend', password: 'secret word' });
  assert.ok(calls.every((c) => c[0] === 'security' && c.includes(GUEST_KEYCHAIN_SERVICE)));
  assert.equal(readGuestLogin({ env: {}, platform: 'darwin', exec: () => { throw new Error('not found'); } }), null);
});

test('session: signs in, sends the cookie only to the site, follows site redirects, signs out', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    seen.push({ url, cookie: init.headers?.cookie ?? null, redirect: init.redirect });
    if (u.pathname === '/api/auth/sign-in/username') return res(200, '{}', { cookies: ['__Secure-better-auth.session_token=s1; Path=/; HttpOnly; Secure'] });
    if (u.pathname === '/old') return res(303, '', { location: '/place/x?embed=1', cookies: ['__Secure-better-auth.convex_jwt=j1; Path=/'] });
    if (u.pathname === '/away') return res(302, '', { location: 'https://elsewhere.example/x' });
    if (u.pathname === '/gone') return res(303, '', { location: '/login?redirectTo=%2Fgone' });
    if (u.pathname === '/api/auth/sign-out') return res(200, '{}');
    return res(200, '<title>X</title><p>hello</p>');
  };
  const s = await openSiteSession({ login: { username: 'guest', password: 'pw' }, site: SITE, fetchImpl });
  const page = await s.get('/old');
  assert.deepEqual([page.status, page.url, page.signedOut], [200, 'https://trip.example/place/x?embed=1', false]);
  assert.equal(seen.at(-1).cookie, '__Secure-better-auth.session_token=s1; __Secure-better-auth.convex_jwt=j1');
  const away = await s.get('/away');
  assert.equal(away.location, 'https://elsewhere.example/x');
  assert.equal((await s.get('/gone')).signedOut, true);
  await assert.rejects(s.get('https://elsewhere.example/'), SiteSessionError);
  await assert.rejects(s.get('//elsewhere.example/'), SiteSessionError);
  await s.close();
  assert.ok(seen.every((c) => c.url.startsWith('https://trip.example/') && c.redirect === 'manual'), 'no request leaves the site and no redirect is followed blindly');
  assert.equal(new URL(seen.at(-1).url).pathname, '/api/auth/sign-out');
});

test('session: a missing or refused login says what to do, without the password', async () => {
  await assert.rejects(openSiteSession({ login: null, site: SITE }), /no guest login: set ATR_GUEST_PASSWORD/);
  const refuse = (status) => openSiteSession({ login: { username: 'guest', password: 'hunter2' }, site: SITE, fetchImpl: async () => res(status) });
  await assert.rejects(refuse(401), (e) => e instanceof SiteSessionError && /refused the guest login/.test(e.message) && !e.message.includes('hunter2'));
  await assert.rejects(refuse(429), /try again in 10 minutes/);
  await assert.rejects(refuse(500), /sign-in failed \(HTTP 500\)/);
});

test('page text and the answer check', () => {
  const html = '<html><head><title>Yu Garden &amp; Bazaar</title><style>p{}</style></head><body><script>var a = "<p>no</p>";</script><h1>Yu&nbsp;Garden</h1><p>Open <b>9:00</b>&#8211;16:30</p><!-- note --></body></html>';
  assert.equal(htmlTitle(html), 'Yu Garden & Bazaar');
  assert.equal(htmlText(html), 'Yu Garden & Bazaar Yu Garden\nOpen 9:00 –16:30');
  assert.equal(answerPageProblem({ status: 200, html: '<article id="answer-a1">', signedOut: false }, 'a1'), null);
  assert.match(answerPageProblem({ status: 200, html: '<article id="answer-a2">', signedOut: false }, 'a1'), /card is not on it/);
  assert.equal(answerPageProblem({ status: 404, html: '', signedOut: false }, 'a1'), 'HTTP 404');
  assert.match(answerPageProblem({ status: 303, html: '', signedOut: true }, 'a1'), /sign-in page/);
});
