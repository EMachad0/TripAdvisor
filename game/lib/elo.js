// Elo ratings for the duels. Pure (runs in Node and in the browser).
// Seeds: a Must starts a little above a Maybe, so an unduelled Must ranks above an unduelled Maybe.
// K = 32 like the curator's taste summary (platform/lib/feedback).

export const START = 1500;
export const K = 32;
export const SEED = { must: 1550, maybe: 1450, skip: 1400 };

export const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));

/** New ratings after `winner` beats `loser`. Returns { winner, loser, delta }. */
export function update(rw, rl, k = K) {
  const delta = k * (1 - expected(rw, rl));
  return { winner: rw + delta, loser: rl - delta, delta };
}

/**
 * Ratings from verdicts and duel history (oldest first).
 * verdicts: { id: 'must'|'maybe'|'skip' }; duels: [{ winner, loser }]
 * Returns Map id → { rating, games, wins }.
 */
export function computeRatings(verdicts = {}, duels = [], k = K) {
  const r = new Map();
  const get = (id) => {
    if (!r.has(id)) r.set(id, { rating: SEED[verdicts[id]] ?? START, games: 0, wins: 0 });
    return r.get(id);
  };
  for (const id of Object.keys(verdicts)) get(id);
  for (const d of duels) {
    if (!d?.winner || !d?.loser || d.winner === d.loser) continue;
    const w = get(d.winner), l = get(d.loser);
    const u = update(w.rating, l.rating, k);
    w.rating = u.winner; l.rating = u.loser;
    w.games++; l.games++; w.wins++;
  }
  return r;
}

/** How settled a pool's ranking is, 0..1: mean of min(games, 4) / 4. */
export function confidence(ids, ratings, full = 4) {
  if (!ids.length) return 0;
  const sum = ids.reduce((s, id) => s + Math.min(ratings.get(id)?.games ?? 0, full) / full, 0);
  return sum / ids.length;
}
