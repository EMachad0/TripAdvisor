<!--
	The area / city card of the Areas round (platform renderAreaCard, built from structured data): photo with flag
	chips, name, local name, flag and region; best-for chips, why, highlights, suggested days and cost, the winter
	note. `fill`: take the parent's height (the swipe deck), photo beside the text from md up; on a phone the
	highlights and winter note are left out, as the old deck did.
-->
<script lang="ts">
	import PenLine from '@lucide/svelte/icons/pen-line';
	import TzText from '#lib/components/shell/TzText.svelte';
	import type { ContentArea } from '#lib/content/types.js';
	import { cn } from '#lib/utils.js';
	import CardFlags from './CardFlags.svelte';
	import CardImage from './CardImage.svelte';
	import { langOf } from './lang.ts';

	interface Props {
		area: ContentArea;
		categories: Readonly<Record<string, { label: string; icon: string }>>;
		noted?: boolean;
		fill?: boolean;
	}

	let { area, categories, noted = false, fill = false }: Props = $props();
	const lang = $derived(langOf(area.country));
</script>

<article
	data-cat={area.best_for[0] ?? ''}
	data-area-card={area.id}
	class={cn(
		'flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground',
		fill && 'h-full md:flex-row',
	)}
>
	<div
		class={cn(
			'relative shrink-0 overflow-hidden bg-muted',
			fill ? 'h-2/5 md:h-auto md:w-5/12' : 'aspect-video',
		)}
	>
		<CardImage image={area.image} sizes="(max-width: 600px) 100vw, 420px" alt={area.name}>
			{#snippet fallback()}
				<span
					aria-hidden="true"
					class="absolute inset-0 flex items-center justify-center text-6xl opacity-60"
					>{area.flag || '🗺️'}</span
				>
			{/snippet}
		</CardImage>
		<div class="absolute inset-x-3 top-3 flex flex-wrap items-center gap-1.5">
			{#if area.isNew}
				<span
					class="rounded-full bg-cat px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm"
					>New</span
				>
			{/if}
			<CardFlags flags={area.flags} />
		</div>
		<div
			class="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-background via-background/80 to-transparent px-4 pt-10 pb-3"
		>
			<h3 class="font-serif text-2xl leading-tight font-semibold">
				{area.name}
				{#if area.name_local !== null}
					<span {lang} class="ml-1 text-lg font-normal text-muted-foreground"
						>{area.name_local}</span
					>
				{/if}
			</h3>
			<p class="text-sm text-ink-2">{area.flag} {area.region ?? ''}</p>
		</div>
	</div>
	<div class={cn('flex min-h-0 flex-1 flex-col gap-2.5 p-4', fill && 'md:gap-3 md:p-6')}>
		<ul class="flex flex-wrap gap-1.5" aria-label="Best for">
			{#each area.best_for as c (c)}
				<li
					data-cat={c}
					class="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-cat uppercase"
				>
					{categories[c]?.icon ?? ''}
					{categories[c]?.label ?? c}
				</li>
			{/each}
			{#if noted}
				<li
					class="inline-flex items-center gap-1 rounded-full bg-note/10 px-2.5 py-1 text-xs font-semibold text-note"
					title="You wrote a note"
				>
					<PenLine class="size-3" aria-hidden="true" />Note
				</li>
			{/if}
		</ul>
		{#if area.why !== null}
			<p
				class={cn(
					'min-h-0 leading-relaxed text-ink-2',
					fill ? 'line-clamp-4 text-sm sm:line-clamp-5 md:line-clamp-6 md:text-base' : 'text-sm',
				)}
			>
				<TzText text={area.why} offset={area.tz} />
			</p>
		{/if}
		{#if area.highlights.length > 0}
			<p class={cn('line-clamp-2 text-sm text-muted-foreground', fill && 'hidden md:block')}>
				{area.highlights.join(' · ')}
			</p>
		{/if}
		<div class="mt-auto grid grid-cols-2 gap-2">
			<div class="flex flex-col rounded-lg bg-muted px-3 py-2">
				<span class="text-xs text-muted-foreground">Suggested</span>
				<b class="text-sm">{area.daysLabel}</b>
			</div>
			<div class="flex flex-col rounded-lg bg-muted px-3 py-2">
				<span class="text-xs text-muted-foreground">Cost</span>
				<b class="text-sm">{area.costLabel}</b>
			</div>
		</div>
		{#if area.winterHtml !== ''}
			<p class={cn('line-clamp-3 text-sm text-ink-2', fill && 'hidden md:block')}>
				<strong>Winter:</strong>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- platform mdInline output: every text is escaped -->
				{@html area.winterHtml}
			</p>
		{/if}
	</div>
</article>
