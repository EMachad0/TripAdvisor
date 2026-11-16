// Cards and calls shared by the decide screens and the place sheet (slice E). Keep this surface small and stable:
// slices A, C, D and F import from here.
export { default as AreaCard } from './AreaCard.svelte';
export { default as CardFlags } from './CardFlags.svelte';
export { default as NoteEditor } from './NoteEditor.svelte';
export { default as NoteSnip } from './NoteSnip.svelte';
export { default as PlaceCard } from './PlaceCard.svelte';
export { default as VerdictSeg } from './VerdictSeg.svelte';
export {
	canUndo,
	setCall,
	undoLast,
	undoStack,
	verdictsOf,
	type SetCallOptions,
} from './calls.svelte.ts';
export { haptic } from './haptic.ts';
export { langOf } from './lang.ts';
export { NOTE_MAX, NOTE_PAUSE_MS, saveNote } from './notes.ts';
export {
	VERDICTS,
	VERDICT_LABEL,
	VERDICT_ORDER,
	isVerdict,
	type Round,
	type Verdict,
	type VerdictInfo,
	type VerdictMap,
} from './verdicts.ts';
