<!--
	The one note editor (old game.js noteEditor + bindNotes), used in the place / area sheet, the deck's note panel
	and My calls. Autosaves 1200 ms after typing stops and on blur; saves for one card run in order; Escape or
	Ctrl/Cmd+Enter finish editing. Shows "Saving…", "Saved" or "Not saved". Other editors of the same card follow
	a save unless they are being typed in. Background refreshes are held while it is in use. Owner only: the
	parent shows the note as text to a guest.
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import { untrack } from 'svelte';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import { cn } from '#lib/utils.js';
	import type { Round } from './model.ts';
	import { NOTE_MAX, NOTE_PAUSE_MS, saveNote, type NoteSaveResult } from './notes.ts';

	interface Props {
		round: Round;
		id: string;
		/** The card's name, for the label. */
		name: string;
		variant?: 'sheet' | 'deck' | 'row';
		placeholder?: string;
		/** Focus on mount, caret at the end. */
		autofocus?: boolean;
		/** Escape or Ctrl/Cmd+Enter was pressed (after the blur). */
		ondone?: () => void;
		/** Focus left the editor and every save finished; `empty`: no text and no saved note. */
		onleave?: (empty: boolean) => void;
	}

	let {
		round: roundProp,
		id: idProp,
		name: nameProp,
		variant = 'sheet',
		placeholder = 'Add a note: why this call?',
		autofocus = false,
		ondone,
		onleave,
	}: Props = $props();

	const app = getAppData();
	// One editor is one card for its whole life (callers key it per card). Read once, so the save on unmount still
	// knows the card after the parent has moved on (a closing sheet).
	const round = untrack(() => roundProp);
	const id = untrack(() => idProp);
	const name = untrack(() => nameProp);
	const saved = (): string => app.feedback?.notes[round][id] ?? '';

	let value = $state(untrack(saved));
	let focused = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = $state(null);
	let saving = $state(0);
	let status: '' | 'saving' | 'saved' | 'error' = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;
	let ta: HTMLTextAreaElement | undefined = $state();

	const hasNote = $derived(saved() !== '');

	// Another editor (or a background update) changed the note: follow it unless this one is in use.
	$effect(() => {
		const server = saved();
		if (!untrack(() => focused) && untrack(() => timer) === null) value = server;
	});

	// Hold background refreshes while typing or saving (old noteBusy).
	$effect(() => {
		if (focused || timer !== null || saving > 0) return holdRefresh();
		return undefined;
	});

	function show(next: typeof status): void {
		clearTimeout(statusTimer);
		status = next;
		if (next === 'saved') {
			statusTimer = setTimeout(() => {
				status = '';
			}, 1800);
		}
	}

	function clearTimer(): void {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	}

	async function saveNow(): Promise<NoteSaveResult> {
		clearTimer();
		const text = value;
		if (text.trim() === saved()) return 'unchanged';
		saving++;
		show('saving');
		const result = await saveNote(round, id, text, saved);
		saving--;
		show(result === 'saved' ? 'saved' : result === 'error' ? 'error' : '');
		return result;
	}

	function oninput(): void {
		show('');
		clearTimer();
		timer = setTimeout(() => {
			timer = null;
			void saveNow();
		}, NOTE_PAUSE_MS);
	}

	async function onblur(): Promise<void> {
		focused = false;
		await saveNow();
		if (onleave !== undefined && document.activeElement !== ta)
			onleave(value.trim() === '' && saved() === '');
	}

	function onkeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
			e.preventDefault();
			e.stopPropagation();
			ta?.blur();
			ondone?.();
		}
	}

	function onfocus(): void {
		focused = true;
		// On a phone, keep the field in view above the on-screen keyboard.
		if (matchMedia('(max-width: 720px)').matches) {
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			setTimeout(() => {
				ta?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
			}, 280);
		}
	}

	// Leaving the screen (sheet closed, panel closed, row folded) saves what was typed.
	$effect(() => () => {
		untrack(() => {
			if (timer !== null || value.trim() !== saved()) void saveNow();
		});
	});

	$effect(() => {
		if (!autofocus || ta === undefined) return;
		ta.focus({ preventScroll: true });
		ta.setSelectionRange(ta.value.length, ta.value.length);
	});
</script>

<div
	class={cn('relative', variant === 'deck' && 'h-full')}
	data-note={round}
	data-note-id={id}
	data-has-note={hasNote ? '' : undefined}
>
	<span
		class={cn(
			'pointer-events-none absolute top-3 left-3 text-muted-foreground',
			(hasNote || focused) && 'text-note',
		)}
		aria-hidden="true"
	>
		<PenLine class="size-4" />
	</span>
	<textarea
		bind:this={ta}
		bind:value
		{oninput}
		{onblur}
		{onfocus}
		{onkeydown}
		rows="1"
		maxlength={NOTE_MAX}
		spellcheck="true"
		aria-label={`Your note on ${name}`}
		{placeholder}
		class={cn(
			'block w-full resize-none rounded-xl border border-border bg-card py-2.5 pr-20 pl-9 text-base leading-snug text-foreground transition-colors outline-none placeholder:text-muted-foreground hover:border-note/40 focus:border-note focus:ring-3 focus:ring-note/20 md:text-sm',
			variant === 'deck' ? 'h-full' : 'field-sizing-content max-h-42 min-h-11',
			hasNote && !focused && 'border-note/30 bg-note/5',
		)}></textarea>
	<span
		class={cn(
			'pointer-events-none absolute top-3 right-3 text-xs font-medium text-muted-foreground',
			status === 'saved' && 'text-ok',
			status === 'error' && 'text-destructive',
		)}
		aria-live="polite"
		data-note-state={status}
		>{status === 'saving'
			? 'Saving…'
			: status === 'saved'
				? 'Saved'
				: status === 'error'
					? 'Not saved'
					: ''}</span
	>
</div>
