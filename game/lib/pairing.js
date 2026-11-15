// Smart duel pairing. Pure (Node + browser).
// Prefers: same country (most of the time), uncertain items (few games), close ratings,
// pairs that have not met, and items not shown in the last couple of duels.

/** Pair key independent of order. */
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * pool: [{ id, country }]; ratings: Map id → { rating, games };
 * history: [{ winner, loser }] oldest first (or [a, b] arrays).
 * opts: { rng = Math.random, country (force one), sameCountryBias = 0.85, recent = 2 }
 * Returns [a, b] (pool items, random left/right) or null.
 */
export function pickPair(pool, ratings, history = [], opts = {}) {
  const rng = opts.rng || Math.random;
  const bias = opts.sameCountryBias ?? 0.85;
  let items = pool.filter((p) => p && p.id);
  if (opts.country) items = items.filter((p) => p.country === opts.country);
  if (items.length < 2) return null;

  const met = new Map();
  const norm = history.map((h) => (Array.isArray(h) ? h : [h.winner, h.loser]));
  for (const [a, b] of norm) met.set(pairKey(a, b), (met.get(pairKey(a, b)) || 0) + 1);
  const recent = new Set(norm.slice(-(opts.recent ?? 2)).flat());

  const byCountry = {};
  for (const p of items) (byCountry[p.country] ||= []).push(p);
  const multi = Object.values(byCountry).filter((g) => g.length >= 2);
  const sameOnly = !opts.country && multi.length > 0 && rng() < bias;

  const r = (id) => ratings.get(id) || { rating: 1500, games: 0 };
  let best = null, bestCost = Infinity;
  const consider = (a, b) => {
    const ra = r(a.id), rb = r(b.id);
    const closeness = Math.abs(ra.rating - rb.rating) / 100;
    const uncertainty = 1 / (1 + ra.games) + 1 / (1 + rb.games);
    const repeats = met.get(pairKey(a.id, b.id)) || 0;
    const fresh = (recent.has(a.id) ? 1 : 0) + (recent.has(b.id) ? 1 : 0);
    const cost = closeness - 1.5 * uncertainty + 2.5 * repeats + 1.2 * fresh + rng() * 0.4;
    if (cost < bestCost) { bestCost = cost; best = [a, b]; }
  };
  const groups = sameOnly ? multi : [items];
  for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) consider(g[i], g[j]);
  if (!best) return null;
  return rng() < 0.5 ? best : [best[1], best[0]];
}
