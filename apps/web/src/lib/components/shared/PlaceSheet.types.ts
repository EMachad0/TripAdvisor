// The PlaceSheet's target type, in a plain module so TypeScript tooling outside Svelte files (type-aware lint) sees
// it. PlaceSheet.svelte re-exports it from its module script (the frozen import path).

/** What the sheet shows: a place or an area, and an optional fragment (#answer-<id>). */
export interface SheetTarget {
	kind: 'place' | 'area';
	id: string;
	hash?: string;
}
