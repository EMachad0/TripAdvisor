// FX rates to BRL from free ECB-based APIs, cached in .cache/fx.json.
import fs from 'node:fs';
import path from 'node:path';
import { dataRoots, localDate } from './paths.js';

const UA = { 'User-Agent': 'AsiaTripRankerBot/0.1 (personal travel-research tool)' };

function cacheFile(opts) { return path.join(dataRoots(opts).cache, 'fx.json'); }
function readCache(opts) { try { return JSON.parse(fs.readFileSync(cacheFile(opts), 'utf8')); } catch { return {}; } }
function writeCache(opts, c) { fs.mkdirSync(path.dirname(cacheFile(opts)), { recursive: true }); fs.writeFileSync(cacheFile(opts), JSON.stringify(c, null, 2)); }

/**
 * Rate for 1 <cur> in BRL. opts: { date: 'YYYY-MM-DD', noCache }
 * Returns { currency, rate, date, source, cached }
 */
export async function getRate(cur, opts = {}) {
  cur = String(cur).toUpperCase();
  if (cur === 'BRL') return { currency: 'BRL', rate: 1, date: localDate(), source: 'identity', cached: false };
  const today = localDate();
  const key = `${cur}:${opts.date || today}`;
  const cache = readCache(opts);
  if (!opts.noCache && cache[key]) return { ...cache[key], cached: true };
  let result, lastErr;
  try {
    const url = `https://api.frankfurter.dev/v1/${opts.date || 'latest'}?base=${cur}&symbols=BRL`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
    const j = await res.json();
    if (!j.rates?.BRL) throw new Error('frankfurter: no BRL rate');
    result = { currency: cur, rate: j.rates.BRL, date: j.date, source: 'frankfurter.dev (ECB reference rate)' };
  } catch (e) { lastErr = e; }
  if (!result && !opts.date) {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${cur}`, { headers: UA });
      const j = await res.json();
      if (j.result !== 'success' || !j.rates?.BRL) throw new Error('open.er-api: no BRL rate');
      result = { currency: cur, rate: j.rates.BRL, date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), source: 'open.er-api.com' };
    } catch (e) { lastErr = e; }
  }
  if (!result) throw new Error(`Could not get ${cur}→BRL rate: ${lastErr?.message}`);
  result.rate = Number(result.rate.toPrecision(4));
  cache[key] = result;
  writeCache(opts, cache);
  return { ...result, cached: false };
}

/** Round a BRL amount sensibly for content. */
export const toBRL = (local, rate) => Math.round(local * rate * 100) / 100;
