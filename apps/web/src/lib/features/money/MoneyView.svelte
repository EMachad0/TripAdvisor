<!--
	The Money screen (old game/public/trip.js viewMoney): totals against the cap, the booking check, the daily budget
	of each country, the money tips, flights and fixed costs, and the spending log with R$ conversions (RATES from
	@atr/shared; the mutation computes amountBRL). The guest sees everything; every add and edit control is hidden.
-->
<script lang="ts">
	import { localKey } from '@atr/shared/trip';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import type { ContentCountry } from '#lib/content/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import Bar from './Bar.svelte';
	import BudgetCard from './BudgetCard.svelte';
	import Chip from './Chip.svelte';
	import EditButton from './EditButton.svelte';
	import PageHead from './PageHead.svelte';
	import PriceCheck from './PriceCheck.svelte';
	import RecordDialog from './record/RecordDialog.svelte';
	import type { RecordCol, RecordTarget } from './record/schema.ts';
	import RichText from './RichText.svelte';
	import {
		CAT_LABEL,
		CATEGORIES,
		FIXED_STATUS,
		budgetRows,
		countryCards,
		countryName,
		currentBudget,
		fixedRows,
		fmtLocal,
		fmtR,
		settingsOf,
		spendGroups,
		spendRows,
		spentIn,
		summary,
	} from './model.ts';
	import type { TripData } from './trip-docs.ts';

	interface Props {
		trip: TripData;
		countries: readonly ContentCountry[];
		canEdit: boolean;
	}

	let { trip, countries, canEdit }: Props = $props();

	const today = localKey();
	const rows = $derived(budgetRows(trip, countries));
	const fixed = $derived(fixedRows(trip));
	const spend = $derived(spendRows(trip));
	const groups = $derived(spendGroups(spend));
	const settings = $derived(settingsOf(trip));
	const m = $derived(summary(trip, rows, fixed, spend));
	const current = $derived(currentBudget(trip, rows, today));
	const cards = $derived(countryCards(rows, spend));
	const noBudget = $derived(rows.length === 0 && fixed.length === 0 && !m.cap);

	let editing: RecordTarget | null = $state(null);
	const edit = (col: RecordCol, id: string | null): void => {
		editing = { col, id };
	};
</script>

<PageHead
	eyebrow={`${fmtR(m.planT)} planned · cap ${fmtR(m.cap)}`}
	title="Money"
	lede="What to spend per day in each country and how to pay there. Check a price before you book, and log what you spend."
>
	{#snippet actions()}
		{#if canEdit}
			<Button
				type="button"
				onclick={() => {
					edit('spend', null);
				}}
			>
				<PlusIcon data-icon="inline-start" />Log expense
			</Button>
		{/if}
	{/snippet}
</PageHead>

{#if noBudget}
	<Empty.Root>
		<Empty.Header>
			<Empty.Title>No budget yet</Empty.Title>
			<Empty.Description>Set a cap and the daily budgets to start.</Empty.Description>
		</Empty.Header>
		{#if canEdit}
			<Empty.Content>
				<Button
					type="button"
					variant="outline"
					onclick={() => {
						edit('settings', 'main');
					}}
				>
					Set the cap
				</Button>
			</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<div class="flex flex-col gap-8">
		<Card.Root size="sm" data-testid="money-summary">
			<Card.Header>
				<Card.Title>
					<p class="font-serif text-3xl font-semibold whitespace-nowrap" data-testid="plan-total">
						{fmtR(m.planT)}
					</p>
				</Card.Title>
				<Card.Description>planned of your {fmtR(m.cap)} cap</Card.Description>
				<Card.Action>
					<div class="flex items-center gap-1">
						{#if m.cap}
							<Chip tone={m.spare >= 0 ? 'booked' : 'planned'}>
								{m.spare >= 0 ? `${fmtR(m.spare)} to spare` : `${fmtR(-m.spare)} over`}
							</Chip>
						{/if}
						{#if canEdit}
							<EditButton
								label="trip budget"
								onclick={() => {
									edit('settings', 'main');
								}}
							/>
						{/if}
					</div>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-col gap-3">
					<Bar
						size="lg"
						segments={[
							{ key: 'fixed', pct: m.fixedPct, fill: 'fill-ink-3' },
							{ key: 'ground', pct: m.groundPct, fill: 'fill-ok' },
						]}
					/>
					<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1.5">
							<i class="size-2 rounded-full bg-ink-3"></i>Flights and fixed
							<b class="text-foreground">{fmtR(m.fixedT)}</b>
						</span>
						<span class="inline-flex items-center gap-1.5">
							<i class="size-2 rounded-full bg-ok"></i>Days on the ground
							<b class="text-foreground">{fmtR(m.groundT)}</b>
						</span>
						<span class="inline-flex items-center gap-1.5">
							<i class="size-2 rounded-full bg-line"></i>Spare
							<b class="text-foreground">{fmtR(Math.max(0, m.spare))}</b>
						</span>
						<span>Logged so far <b class="text-foreground">{fmtR(m.spentT)}</b></span>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		{#if rows.length > 0}
			<PriceCheck {rows} {current} />

			<section class="flex flex-col gap-3" aria-labelledby="money-perday">
				<h2
					id="money-perday"
					class="flex flex-wrap items-baseline gap-x-2 font-serif text-xl font-semibold"
				>
					Per day, by country
					<small class="font-sans text-sm font-normal text-muted-foreground"
						>{fmtR(m.groundT)} over {m.days} days</small
					>
				</h2>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each cards as card (card.row.id)}
						<BudgetCard
							{card}
							{canEdit}
							onedit={(id: string) => {
								edit('budget', id);
							}}
						/>
					{/each}
				</div>
			</section>
		{/if}

		{#if settings.tips}
			<section
				class="flex flex-col gap-1.5 rounded-xl bg-amber/15 px-4 py-3.5 text-sm"
				aria-labelledby="money-tips"
			>
				<h2 id="money-tips" class="text-xs font-bold tracking-widest text-amber uppercase">
					How money works on this trip
				</h2>
				<RichText text={settings.tips} class="leading-relaxed" />
			</section>
		{/if}

		<section class="flex flex-col gap-3" aria-labelledby="money-fixed">
			<h2
				id="money-fixed"
				class="flex flex-wrap items-baseline gap-x-2 font-serif text-xl font-semibold"
			>
				Flights and fixed costs
				<small class="font-sans text-sm font-normal text-muted-foreground">{fmtR(m.fixedT)}</small>
			</h2>
			{#if fixed.length > 0}
				<ul class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
					{#each fixed as x (x.id)}
						<li class="flex items-start gap-3 px-3 py-2.5" data-testid="fixed-row">
							<Chip tone={FIXED_STATUS[x.status].tone}>{FIXED_STATUS[x.status].label}</Chip>
							<div class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="font-medium">{x.title}</span>
								{#if x.note}<RichText text={x.note} class="text-sm text-muted-foreground" />{/if}
							</div>
							<span class="font-semibold whitespace-nowrap tabular-nums">{fmtR(x.amount)}</span>
							{#if canEdit}<EditButton
									label={x.title}
									onclick={() => {
										edit('fixed', x.id);
									}}
								/>{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No fixed costs</Empty.Title>
						<Empty.Description>Add flights, insurance or the eSIM here.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
			{#if canEdit}
				<div>
					<Button
						type="button"
						variant="outline"
						onclick={() => {
							edit('fixed', null);
						}}
					>
						<PlusIcon data-icon="inline-start" />Add cost
					</Button>
				</div>
			{/if}
		</section>

		<section class="flex flex-col gap-3" aria-labelledby="money-spend">
			<h2
				id="money-spend"
				class="flex flex-wrap items-baseline gap-x-2 font-serif text-xl font-semibold"
			>
				Spending log
				{#if spend.length > 0}
					<small class="font-sans text-sm font-normal text-muted-foreground">
						{CATEGORIES.map(
							(k) => `${CAT_LABEL[k]} ${fmtR(spentIn(spend, (x) => x.category === k))}`,
						).join(' · ')}
					</small>
				{/if}
			</h2>
			{#if spend.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>Nothing logged yet</Empty.Title>
						<Empty.Description>
							Tap Log expense when you pay for a bed, a meal or a ticket. Amounts in local money are
							converted to reais.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				{#each groups as g, gi (`${g.date}-${String(gi)}`)}
					<div class="flex flex-col gap-2" data-testid="spend-day">
						<div
							class="flex justify-between gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
						>
							<span>{g.label}</span><span>{fmtR(g.total)}</span>
						</div>
						<ul
							class="flex flex-col divide-y divide-border rounded-xl border border-border bg-card"
						>
							{#each g.items as x (x.id)}
								<li class="flex items-start gap-3 px-3 py-2.5" data-testid="spend-row">
									<Chip tone={x.category}>{CAT_LABEL[x.category]}</Chip>
									<div class="flex min-w-0 flex-1 flex-col gap-0.5">
										<span class="font-medium">{x.label}</span>
										{#if x.country}
											<span class="text-sm text-muted-foreground"
												>{countryName(countries, x.country)}</span
											>
										{/if}
									</div>
									<span
										class="flex flex-col items-end font-semibold whitespace-nowrap tabular-nums"
									>
										{fmtR(x.amountBRL)}
										{#if x.currency && x.currency !== 'BRL'}
											<small class="text-xs font-normal text-muted-foreground"
												>{fmtLocal(x.amount)} {x.currency}</small
											>
										{/if}
									</span>
									{#if canEdit}
										<EditButton
											label={x.label}
											onclick={() => {
												edit('spend', x.id);
											}}
										/>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		</section>
	</div>
{/if}

{#if canEdit}
	<RecordDialog
		target={editing}
		{trip}
		{countries}
		spendDefaults={{ today, country: current?.country ?? '', currency: current?.currency ?? 'BRL' }}
		onclose={() => (editing = null)}
	/>
{/if}
