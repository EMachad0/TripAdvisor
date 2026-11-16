<!--
	Answers (old game.js viewAnswers): every answer card, newest first, with a country filter (All, the trip's
	countries in order, others, Whole trip; each with its count). /places/answers/<id> or #answer-<id> opens that
	card's full answer, marks it and scrolls to it, switching the filter to All when the card is filtered out. The
	About link opens the place or area sheet on that answer. Read only for everyone, so the guest sees the same page.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AnswerCard from '#lib/components/shared/AnswerCard.svelte';
	import PlaceSheet from '#lib/components/shared/PlaceSheet.svelte';
	import type { SheetTarget } from '#lib/components/shared/PlaceSheet.types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import PageHead from '#lib/features/money/PageHead.svelte';
	import { answersFilter as F } from './filters.svelte.ts';
	import { answerFilters, answerIdFromHash, filterAnswers, plural } from './model.ts';

	interface Props {
		/** The `[id]` of /places/answers/<id>. */
		id?: string | undefined;
	}

	let { id }: Props = $props();
	const app = getAppData();
	const all = $derived(app.content.answers);
	const filters = $derived(answerFilters(all, app.content.countries));
	const hashId = $derived(answerIdFromHash(page.url.hash));
	const target = $derived(id ?? hashId);
	const targetKnown = $derived(target !== null && all.some((a) => a.id === target));
	// A filter that no longer has answers falls back to All; so does one that hides the opened card.
	const current = $derived.by(() => {
		if (!filters.some((f) => f.id === F.id)) return 'all';
		if (targetKnown && !filterAnswers(all, F.id).some((a) => a.id === target)) return 'all';
		return F.id;
	});
	const shown = $derived(filterAnswers(all, current));

	let list: HTMLElement | undefined = $state();
	let scrolledTo: string | null = null;
	$effect(() => {
		const t = target;
		if (t === null || !targetKnown || t === scrolledTo || list === undefined) return;
		scrolledTo = t;
		if (F.id !== current) F.id = current;
		void tick().then(() => {
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			document
				.getElementById(`answer-${t}`)
				?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
		});
	});

	let sheet: SheetTarget | null = $state(null);
</script>

{#if all.length === 0}
	<Empty.Root data-answers-empty>
		<Empty.Header>
			<Empty.Media><span class="text-5xl" aria-hidden="true">💬</span></Empty.Media>
			<Empty.Title><h1>No answers yet</h1></Empty.Title>
			<Empty.Description>
				When Claude Code answers a question about the trip on the laptop, the answer is published
				here as a card.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href={resolve('/(app)/places')}>Back to the places →</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	<section class="mx-auto flex max-w-3xl flex-col" data-answers>
		<PageHead
			eyebrow={`Places · ${plural(all.length, 'answer')}`}
			title="Answers"
			lede="Your questions about the trip and what Claude found, newest first. Open a card for the full answer and its sources."
		/>
		<div class="-mx-4 mb-3 overflow-x-auto px-4 pb-1">
			<ToggleGroup.Root
				type="single"
				variant="outline"
				spacing={2}
				value={current}
				onValueChange={(v: string) => {
					if (v !== '') F.id = v;
				}}
				aria-label="Filter by country"
			>
				{#each filters as f (f.id)}
					<ToggleGroup.Item value={f.id} class="shrink-0"
						>{f.label} <span class="text-muted-foreground">{f.n}</span></ToggleGroup.Item
					>
				{/each}
			</ToggleGroup.Root>
		</div>
		<div class="flex flex-col gap-3.5" bind:this={list}>
			{#each shown as a (a.id)}
				<div
					class="rounded-2xl data-target:ring-3 data-target:ring-cat/40"
					data-target={a.id === target ? '' : undefined}
				>
					<AnswerCard
						answer={a}
						open={a.id === target}
						onopenabout={(kind: 'place' | 'area', aboutId: string) => {
							sheet = { kind, id: aboutId, hash: `#answer-${a.id}` };
						}}
					/>
				</div>
			{/each}
		</div>
	</section>
{/if}

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
