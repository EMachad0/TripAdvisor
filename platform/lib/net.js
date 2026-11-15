// Network plumbing shared by the network tools (media, links, render, geo, pdf):
// proxy support, cross-process slots and a shared "not before" cooldown under .cache/.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { dataRoots } from './paths.js';

/** .cache/ (ATR_CACHE_DIR overrides it, for tests). */
export const cacheDir = () => (process.env.ATR_CACHE_DIR ? path.resolve(process.env.ATR_CACHE_DIR) : dataRoots().cache);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The proxy the environment asks for (sandboxed sessions get HTTPS_PROXY/HTTP_PROXY), or null. */
export function envProxy(env = process.env) {
  const p = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy;
  if (!p) return null;
  return { server: p, bypass: env.NO_PROXY || env.no_proxy || '' };
}

let proxied = false;
/**
 * Make Node's fetch honour HTTP(S)_PROXY / NO_PROXY, as curl does. Inside a sandbox direct connections and DNS
 * are blocked and only the proxy gets out, which is why links/media failed with "domain does not exist" or
 * "connection refused" while curl worked. No-op when no proxy is set.
 */
export function useEnvProxy(env = process.env) {
  if (proxied || !envProxy(env)) return false;
  try { if (typeof http.setGlobalProxyFromEnv === 'function') { http.setGlobalProxyFromEnv(env); proxied = true; } } catch { /* older Node: direct */ }
  return proxied;
}

/** Chrome launch option for the same proxy (Chrome ignores the environment variables). */
export function chromeProxy(env = process.env) {
  const p = envProxy(env);
  if (!p) return undefined;
  const bypass = p.bypass.split(',').map((s) => s.trim()).filter(Boolean).join(',');
  return { server: p.server, ...(bypass ? { bypass } : {}) };
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/**
 * One of `slots` places for a job, shared by every process on this machine (files `<dir>/<name>-<i>.lock`).
 * A slot whose process is gone, or older than staleMs, is taken over. Returns release().
 * onWait(seconds waited, holders) is called about every 10 s while waiting.
 */
export async function acquireSlot(dir, name, { slots = 1, staleMs = 10 * 60_000, pollMs = 500, maxWaitMs = Infinity, onWait } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const start = Date.now();
  let told = 0;
  for (;;) {
    for (let i = 0; i < slots; i++) {
      const f = path.join(dir, `${name}-${i}.lock`);
      try {
        fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' });
        let done = false;
        return () => { if (done) return; done = true; try { const h = readJson(f); if (!h || h.pid === process.pid) fs.rmSync(f, { force: true }); } catch { /* gone */ } };
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        const h = readJson(f);
        if (!h || !alive(h.pid) || Date.now() - (h.at || 0) > staleMs) { try { fs.rmSync(f, { force: true }); } catch { /* raced */ } i--; continue; }
      }
    }
    const waited = Date.now() - start;
    if (waited > maxWaitMs) throw new Error(`waited ${Math.round(waited / 1000)} s for a free ${name} slot`);
    if (onWait && waited - told >= 10_000) { told = waited; onWait(Math.round(waited / 1000), slots); }
    await sleep(pollMs);
  }
}

/** Shared cooldown state for a host, in one JSON file: { notBefore, strikes, reason, at }. */
export function readCooldown(file) { return readJson(file) || { notBefore: 0, strikes: 0 }; }
export function writeCooldown(file, state) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, file); } catch { /* best effort */ }
}

/** Retry-After header → milliseconds (seconds or an HTTP date), or null. */
export function retryAfterMs(value, now = Date.now()) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n * 1000;
  const d = Date.parse(value);
  return Number.isFinite(d) ? Math.max(0, d - now) : null;
}

/** "3 min 20 s" / "45 s". */
export function fmtWait(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`;
}

/**
 * GET with node:http(s): a fresh connection per request, redirects followed (up to 5). Hostelworld's API gateway
 * (prod.apigee.hostelworld.com) answers about every other request from Node's fetch with 403, but answers
 * node:https and curl every time. Resolves { status, headers, body (Buffer, at most maxBytes), url }; rejects on a
 * network error or after timeoutMs.
 */
export async function httpsGet(url, { headers = {}, timeoutMs = 15000, maxBytes = 5_000_000, redirects = 5 } = {}) {
  const https = await import('node:https');
  for (let hop = 0; ; hop++) {
    const mod = url.startsWith('http:') ? http : https;
    const r = await new Promise((resolve, reject) => {
      const req = mod.get(url, { headers }, (res) => {
        const chunks = [];
        let n = 0;
        res.on('data', (d) => { if (n < maxBytes) { chunks.push(d); n += d.length; } });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).subarray(0, maxBytes), url }));
        res.on('error', reject);
      });
      req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error(`no answer within ${Math.round(timeoutMs / 1000)} s`), { code: 'ETIMEDOUT' })));
      req.on('error', reject);
    });
    if (r.status >= 300 && r.status < 400 && r.headers.location && hop < redirects) { url = new URL(r.headers.location, url).href; continue; }
    return r;
  }
}

/** Progress line on stderr (never on stdout, which some callers parse). Silenced by ATR_QUIET. */
export function progress(msg) { if (!process.env.ATR_QUIET) process.stderr.write(`  ${msg}\n`); }
