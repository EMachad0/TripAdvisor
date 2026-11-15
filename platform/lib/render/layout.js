// Balanced grid layouts (no orphan tiles) shared by the renderer and the validator.

/** Split m items into balanced rows of at most `max` (4 → 2+2, 5 → 3+2, 7 → 4+3). */
export function balancedRows(m, max = 4) {
  if (m <= 0) return [];
  if (m <= Math.min(3, max)) return [m];
  const rows = Math.ceil(m / max);
  const base = Math.floor(m / rows), extra = m % rows;
  const nRows = rows === 1 && m > 3 ? 2 : rows; // prefer 2+2 over a row of 4 for exactly 4
  if (nRows !== rows) return [Math.ceil(m / 2), Math.floor(m / 2)];
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Gallery slots. Returns per image: { row, d: desktop row size, dSpan (of 12), mSpan (of 2), aspect, wide, minWidth }.
 */
export function gallerySlots(n, { feature = true, portraits = [] } = {}) {
  const rows = n === 1 ? [1] : feature && n % 2 === 1 ? [1, ...balancedRows(n - 1)] : balancedRows(n);
  const slots = [];
  rows.forEach((size, r) => { for (let i = 0; i < size; i++) slots.push({ row: r, d: size }); });
  // A row made only of portrait photos gets tall tiles instead of cropping them.
  const portraitRow = rows.map((size, r) => size > 1 && slots.every((s, i) => s.row !== r || portraits[i]));
  return slots.map((s, i) => {
    const phoneFull = n === 1 || (n % 2 === 1 && (feature ? i === 0 : i === n - 1));
    const tall = portraitRow[s.row];
    const aspect = s.d === 1 ? (n === 1 ? '16 / 9' : '2 / 1') : tall ? '4 / 5' : s.d === 4 ? '1 / 1' : '4 / 3';
    return { ...s, dSpan: 12 / s.d, mSpan: phoneFull ? 2 : 1, aspect, phoneAspect: tall && !phoneFull ? '4 / 5' : '4 / 3', tall, wide: s.d === 1, minWidth: s.d === 1 ? 1280 : s.d === 2 ? (tall ? 700 : 900) : 640 };
  });
}

/** Quick-facts cells: spans on a 60-column desktop grid, 2-column phone grid. */
export function factSpans(n) {
  const rows = n <= 5 ? [n] : balancedRows(n, 4);
  const out = [];
  rows.forEach((size) => { for (let i = 0; i < size; i++) out.push({ dSpan: 60 / size, mSpan: 1 }); });
  if (n % 2 === 1) out[n - 1].mSpan = 2;
  return out;
}
