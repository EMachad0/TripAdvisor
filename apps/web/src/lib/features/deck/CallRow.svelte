<!--
	One row of My calls (old callRow + bindCallNote): thumb, name and meta (opens the sheet), the Skip / Maybe / Must
	call, and the note: the editor when there is one, else "+ Add a note", which opens the editor and folds back if
	it is left empty. The guest sees the call and the note as text.
-->
<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import TzText from '#lib/components/shell/TzText.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import NoteEditor from '#lib/features/cards/NoteEditor.svelte';
	import VerdictSeg from '#lib/features/cards/VerdictSeg.svelte';
	import type { Verdict } from '#lib/features/cards/model.js';
	import type { CallItem } from './deck.ts';

	interface Props {
		row: CallItem;
		/** Country flag and name. */
		flag: string;
		countryName: string;
		category: { label: string; icon: string } | undefined;
		readonly: boolean;
		onopen: () => void;
		onpick: (verdict: Verdict) => void;
	}

	let { row, flag, countryName, category, readonly, onopen, onpick }: Props = $props();
	let adding = $state(false);
	let thumbFailed = $state(false);
	const editing = $derived(row.note !== '' || adding);
	const thumb = $derived(row.place?.thumb ?? null);
	const tz = $derived(row.place?.tz ?? row.area?.tz ?? null);
	const meta = $derived(
		row.round === 'area'
			? `${flag} ${countryName} · area`
			: `${flag} ${row.place?.cityName ?? ''} · ${category?.label ?? ''}`,
	);
</script>

<article
	class="flex flex-col gap-2.5 panel p-3 md:p-3.5"
	data-call={`${row.round}:${row.id}`}
	data-v={row.verdict ?? 'none'}
	data-cat={row.place?.category}
	data-has-note={row.note !== '' ? '' : undefined}
>
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2.5">
		<button
			type="button"
			class="-m-1 flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-muted/60"
			aria-label={`Open ${row.name}`}
			onclick={onopen}
		>
			<span
				class="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-2xl md:size-13"
			>
				{#if thumb !== null && !thumbFailed}
					<img
						src={thumb}
						alt=""
						loading="lazy"
						class="absolute inset-0 size-full object-cover"
						onerror={() => {
							thumbFailed = true;
						}}
						{@attach (el: HTMLImageElement) => {
							if (el.complete && el.naturalWidth === 0) thumbFailed = true;
						}}
					/>
				{:else}
					<span aria-hidden="true"
						>{row.round === 'area' ? flag || '🗺️' : (category?.icon ?? '')}</span
					>
				{/if}
			</span>
			<span class="flex min-w-0 flex-col gap-0.5">
				<b class="truncate font-serif text-base leading-tight font-semibold">{row.name}</b>
				<small class="truncate text-xs text-muted-foreground">{meta}</small>
			</span>
		</button>
		<div class="ml-auto">
			<VerdictSeg
				value={row.verdict}
				label={`Your call on ${row.name}`}
				disabled={readonly}
				{onpick}
			/>
		</div>
	</div>
	{#if readonly}
		{#if row.note !== ''}
			<p
				class="rounded-xl bg-note/8 px-3 py-2 text-sm leading-relaxed text-note"
				data-note-readonly
			>
				<TzText text={row.note} offset={tz} />
			</p>
		{/if}
	{:else if editing}
		<NoteEditor
			round={row.round}
			id={row.id}
			name={row.name}
			variant="row"
			placeholder="Why this call?"
			autofocus={adding && row.note === ''}
			onleave={(empty) => {
				if (empty) adding = false;
			}}
		/>
	{:else}
		<div class="-my-1 -ml-1.5">
			<Button
				variant="ghost"
				size="sm"
				data-addnote
				onclick={() => {
					adding = true;
				}}
			>
				<Plus data-icon="inline-start" />Add a note
			</Button>
		</div>
	{/if}
</article>
