// Small place-type helpers shared by validator, renderer, gaps and the game.

/** A place to sleep (social hostel, capsule hotel), not an attraction that competes for a trip day. */
export function isStay(place) {
  return place?.category === 'stay' || place?.kind === 'Stay';
}

/** Everything that is not a stay. */
export const isAttraction = (place) => !isStay(place);

/**
 * Does this cost come out of the "everything else" daily budget?
 * Explicit `counts_against_budget` wins; food places and stays default to false.
 */
export function countsAgainstBudget(p) {
  if (typeof p?.counts_against_budget === 'boolean') return p.counts_against_budget;
  return !(p?.category === 'food' || p?.kind === 'Eat' || isStay(p));
}

const PCT = /^(100|\d{1,2})(\.\d+)?% (100|\d{1,2})(\.\d+)?%$/;
export const FOCUS_KEYWORDS = ['center', 'top', 'bottom', 'left', 'right'];
export const FOCUS_RE = new RegExp(`^(${FOCUS_KEYWORDS.join('|')}|(100|\\d{1,2})(\\.\\d+)?% (100|\\d{1,2})(\\.\\d+)?%)$`);

/** CSS object-position for a `focus` value: a keyword or a focal point "x% y%". */
export function focusPos(f) {
  if (typeof f === 'string' && PCT.test(f.trim())) return f.trim();
  return { top: 'center 20%', bottom: 'center 80%', left: '20% center', right: '80% center' }[f] || 'center';
}

/** Still holds scaffold placeholders ("TODO" anywhere in its values): another curator's unfinished page. */
export function hasPlaceholders(data) {
  if (typeof data === 'string') return /\bTODO\b/.test(data);
  if (Array.isArray(data)) return data.some(hasPlaceholders);
  if (data && typeof data === 'object') return Object.entries(data).some(([k, v]) => k !== '_meta' && hasPlaceholders(v));
  return false;
}
