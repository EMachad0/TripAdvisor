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
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { getAppData } from '#lib/content/app-data.svelte.js';
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
	<section class="page-wide" data-answers>
		<PageHeader
			eyebrow={`Places · ${plural(all.length, 'answer')}`}
			title="Answers"
			lede="Your questions about the trip and what Claude found, newest first. Open a card for the full answer and its sources."
		/>
		<!-- The country chips: a dock above the tab bar on a phone (thumb reach), a row under the head from md up. -->
		<div
			class="z-20 mb-5 max-md:fixed max-md:inset-x-2.5 max-md:bottom-dock max-md:mb-0 max-md:rounded-full max-md:p-1.5 max-md:shadow-big max-md:glass md:mb-7"
		>
			<div class="no-scrollbar overflow-x-auto max-md:rounded-full">
				<ToggleGroup.Root
					type="single"
					variant="pill"
					spacing={2}
					class="w-max"
					value={current}
					onValueChange={(v: string) => {
						if (v !== '') F.id = v;
					}}
					aria-label="Filter by country"
				>
					{#each filters as f (f.id)}
						<ToggleGroup.Item value={f.id} class="h-10 shrink-0 xl:h-9"
							>{f.label} <span class="text-xs nums opacity-60">{f.n}</span></ToggleGroup.Item
						>
					{/each}
				</ToggleGroup.Root>
			</div>
		</div>
		<div
			class="grid grid-cols-1 items-start gap-4 md:gap-5 xl:grid-cols-2 xl:gap-6 3xl:grid-cols-3"
			bind:this={list}
		>
			{#each shown as a (a.id)}
				<div
					class="min-w-0 rounded-2xl transition-shadow duration-300 data-target:ring-3 data-target:ring-cat/45 data-target:ring-offset-4 data-target:ring-offset-background"
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
		<!-- Room under the last card for the phone's dock. -->
		<div class="h-16 md:hidden" aria-hidden="true"></div>
	</section>
{/if}

<PlaceSheet
	target={sheet}
	onclose={() => {
		sheet = null;
	}}
/>
