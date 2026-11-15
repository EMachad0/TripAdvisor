// Search-hint helper for `atr new` (kept separate so tests can import it).
export const titleCity = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** A clean Commons query: no punctuation, city added only if not already in the name. */
export function searchHint(name, city) {
  const clean = String(name).replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const cityName = titleCity(city);
  return new RegExp(`\\b${cityName.replace(/[-\s]+/g, '[-\\s]+')}\\b`, 'i').test(clean) ? clean : `${clean} ${cityName}`;
}
