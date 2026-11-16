<!-- One country's daily budget (old viewMoney "Per day, by country" card): split bar, spend so far, how to pay. -->
<script lang="ts">
	import { TZ_OFFSET } from '@atr/shared/trip';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import Bar from './Bar.svelte';
	import EditButton from './EditButton.svelte';
	import { cn } from '#lib/utils.js';
	import RichText from './RichText.svelte';
	import { CAT_LABEL, CATEGORIES, fmtR, plural, type CountryCard } from './model.ts';

	interface Props {
		card: CountryCard;
		canEdit: boolean;
		/** Where you are today, or go next. */
		current?: boolean;
		onedit: (id: string) => void;
	}

	let { card, canEdit, current = false, onedit }: Props = $props();
	const row = $derived(card.row);
	const FILL = { bed: 'fill-k3', food: 'fill-k4', other: 'fill-k5' } as const;
	const DOT = { bed: 'bg-k3', food: 'bg-k4', other: 'bg-k5' } as const;
</script>

<article
	class={cn(
		'flex flex-col panel',
		current && 'ring-2 ring-cat/35 ring-offset-2 ring-offset-background',
	)}
	data-testid="budget-card"
	data-country={row.country}
>
	<div class="flex flex-col gap-4 p-4 md:p-5">
		<header class="flex items-center gap-3">
			<span
				class="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/70 text-2xl leading-none"
				aria-hidden="true">{row.flag}</span
			>
			<div class="min-w-0 flex-1">
				<h3 class="truncate font-serif text-lg leading-tight font-semibold">{row.name}</h3>
				{#if current}<p class="text-2xs font-semibold tracking-wide text-cat uppercase">
						Current or next stop
					</p>{/if}
			</div>
			{#if canEdit}
				<EditButton
					label={`${row.name} budget`}
					onclick={() => {
						onedit(row.id);
					}}
				/>
			{/if}
		</header>

		<p class="text-sm text-muted-foreground nums">
			<b class="font-serif text-2xl font-semibold text-foreground">{fmtR(card.daily)}</b> / day · {plural(
				row.days,
				'day',
			)} · {fmtR(card.planned)}
		</p>

		<div class="flex flex-col gap-2">
			<Bar
				segments={CATEGORIES.map((k) => ({ key: k, pct: card.split[k], fill: FILL[k] }))}
				size="md"
			/>
			<div class="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
				{#each CATEGORIES as k (k)}
					<span class="flex flex-col">
						<span class="inline-flex items-center gap-1.5">
							<i class={cn('size-2 rounded-full', DOT[k])}></i>{CAT_LABEL[k]}
						</span>
						<b class="text-sm font-semibold text-foreground nums">{fmtR(row[k])}</b>
					</span>
				{/each}
			</div>
		</div>

		{#if card.spent}
			<div class="flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5">
				<p class={cn('text-xs nums', card.over ? 'text-seal' : 'text-muted-foreground')}>
					Spent {fmtR(card.spent)} of {fmtR(card.planned)}
				</p>
				<Bar
					segments={[
						{ key: 'spent', pct: card.spentPct, fill: card.over ? 'fill-seal' : 'fill-ok' },
					]}
					size="sm"
				/>
			</div>
		{/if}
	</div>

	{#if row.pay}
		<div class="mt-auto border-t border-border/70">
			<Collapsible.Root>
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="group flex min-h-11 w-full items-center justify-between gap-2 rounded-b-2xl px-4 text-left text-sm font-semibold text-cat transition-colors outline-none hover:bg-cat/5 focus-visible:ring-3 focus-visible:ring-ring/50 md:px-5"
						>
							How to pay in {row.name}
							<ChevronDownIcon
								class="size-4 transition-transform duration-200 ease-soft group-data-[state=open]:rotate-180"
							/>
						</button>
					{/snippet}
				</Collapsible.Trigger>
				<Collapsible.Content>
					<RichText
						class="px-4 pb-4 text-sm leading-relaxed text-ink-2 md:px-5 md:pb-5"
						text={row.pay}
						offset={Object.hasOwn(TZ_OFFSET, row.country) ? TZ_OFFSET[row.country] : null}
					/>
				</Collapsible.Content>
			</Collapsible.Root>
		</div>
	{/if}
</article>
