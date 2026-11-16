<!--
	The Money screen (old game/public/trip.js viewMoney): totals against the cap, the booking check, the daily budget
	of each country, the money tips, flights and fixed costs, and the spending log with R$ conversions (RATES from
	@atr/shared; the mutation computes amountBRL). The guest sees everything; every add and edit control is hidden.

	Layout: one column on a phone with the summary first; the summary and the booking check side by side on the Fold's
	inner screen; on a laptop or monitor they stay in a sticky column on the right while the lists scroll.
-->
<script lang="ts">
	import { localKey } from '@atr/shared/trip';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ReceiptIcon from '@lucide/svelte/icons/receipt';
	import PlaneIcon from '@lucide/svelte/icons/plane';
	import WalletIcon from '@lucide/svelte/icons/wallet';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import type { ContentCountry } from '#lib/content/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import BudgetCard from './BudgetCard.svelte';
	import Chip from './Chip.svelte';
	import EditButton from './EditButton.svelte';
	import MoneySummary from './MoneySummary.svelte';
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
	const now = $derived(cards.find((c) => c.row.id === current?.id) ?? null);
	const noBudget = $derived(rows.length === 0 && fixed.length === 0 && !m.cap);

	let editing: RecordTarget | null = $state(null);
	const edit = (col: RecordCol, id: string | null): void => {
		editing = { col, id };
	};
</script>

<svelte:head>
	<title>Money · Asia Trip Ranker</title>
</svelte:head>

<div class="page-wide">
	<PageHeader
		eyebrow="Trip budget"
		title="Money"
		lede="Daily budgets by country, a price check before you book, and what you have spent."
	>
		{#snippet actions()}
			{#if canEdit}
				<Button
					type="button"
					size="lg"
					class="max-md:w-full"
					onclick={() => {
						edit('spend', null);
					}}
				>
					<PlusIcon data-icon="inline-start" />Log expense
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if noBudget}
		<div class="panel">
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon"><WalletIcon /></Empty.Media>
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
		</div>
	{:else}
		<div class="grid gap-5 md:gap-6 xl:grid-cols-12 xl:items-start xl:gap-8 3xl:gap-10">
			<!-- The headline numbers: first on a phone, a sticky column beside the lists on wide screens. -->
			<div
				class="xl:sticky xl:top-9 xl:col-span-5 xl:col-start-8 xl:row-start-1 2xl:col-span-4 2xl:col-start-9 3xl:top-11 3xl:col-span-3 3xl:col-start-10"
			>
				<MoneySummary
					{m}
					{now}
					{canEdit}
					onedit={() => {
						edit('settings', 'main');
					}}
				/>
			</div>

			<div
				class="flex min-w-0 flex-col gap-9 xl:col-span-7 xl:row-start-1 xl:gap-11 2xl:col-span-8 3xl:col-span-9"
			>
				{#if rows.length > 0}
					<PriceCheck {rows} {current} />
					<section class="@container flex flex-col gap-4" aria-labelledby="money-perday">
						<h2
							id="money-perday"
							class="flex flex-wrap items-baseline gap-x-2.5 font-serif text-2xl font-semibold tracking-tight"
						>
							Per day, by country
							<small class="font-sans text-sm font-normal text-muted-foreground nums"
								>{fmtR(m.groundT)} over {m.days} days</small
							>
						</h2>
						<div class="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
							{#each cards as card (card.row.id)}
								<BudgetCard
									{card}
									{canEdit}
									current={card.row.id === current?.id}
									onedit={(id: string) => {
										edit('budget', id);
									}}
								/>
							{/each}
						</div>
					</section>
				{/if}

				<div class="grid gap-9 3xl:grid-cols-2 3xl:items-start 3xl:gap-8">
					<div class="flex min-w-0 flex-col gap-9">
						{#if settings.tips}
							<section
								class="relative flex gap-4 overflow-hidden rounded-2xl bg-amber/10 px-5 py-4 ring-1 ring-amber/20 md:px-6 md:py-5"
								aria-labelledby="money-tips"
							>
								<span
									class="hidden size-9 shrink-0 place-items-center rounded-full bg-amber/15 text-amber md:grid"
									aria-hidden="true"><LightbulbIcon class="size-4.5" /></span
								>
								<div class="flex min-w-0 flex-col gap-2">
									<h2 id="money-tips" class="eyebrow text-amber">How money works on this trip</h2>
									<RichText
										text={settings.tips}
										class="max-w-prose text-sm leading-relaxed text-ink-2"
									/>
								</div>
							</section>
						{/if}

						<section class="flex flex-col gap-4" aria-labelledby="money-fixed">
							<div class="flex items-end justify-between gap-3">
								<h2
									id="money-fixed"
									class="flex flex-wrap items-baseline gap-x-2.5 font-serif text-2xl font-semibold tracking-tight"
								>
									Flights and fixed costs
									<small class="font-sans text-sm font-normal text-muted-foreground nums"
										>{fmtR(m.fixedT)}</small
									>
								</h2>
								{#if canEdit}
									<Button
										type="button"
										variant="outline"
										class="max-md:h-11"
										onclick={() => {
											edit('fixed', null);
										}}
									>
										<PlusIcon data-icon="inline-start" />Add cost
									</Button>
								{/if}
							</div>
							{#if fixed.length > 0}
								<ul class="flex flex-col divide-y divide-border/70 overflow-hidden panel">
									{#each fixed as x (x.id)}
										<li class="flex items-start gap-3 px-4 py-3.5 md:px-5" data-testid="fixed-row">
											<span
												class="mt-0.5 hidden size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground md:grid"
												aria-hidden="true"
												>{#if /flight/i.test(x.title)}<PlaneIcon
														class="size-4"
													/>{:else}<ReceiptIcon class="size-4" />{/if}</span
											>
											<div class="flex min-w-0 flex-1 flex-col gap-1">
												<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
													<span class="font-medium">{x.title}</span>
													<Chip tone={FIXED_STATUS[x.status].tone}
														>{FIXED_STATUS[x.status].label}</Chip
													>
												</div>
												{#if x.note}<RichText
														text={x.note}
														class="text-sm leading-relaxed text-muted-foreground"
													/>{/if}
											</div>
											<span class="pt-0.5 font-semibold whitespace-nowrap nums"
												>{fmtR(x.amount)}</span
											>
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
								<div class="panel">
									<Empty.Root>
										<Empty.Header>
											<Empty.Media variant="icon"><PlaneIcon /></Empty.Media>
											<Empty.Title>No fixed costs</Empty.Title>
											<Empty.Description>Add flights, insurance or the eSIM here.</Empty.Description
											>
										</Empty.Header>
									</Empty.Root>
								</div>
							{/if}
						</section>
					</div>

					<section class="flex flex-col gap-4" aria-labelledby="money-spend">
						<h2
							id="money-spend"
							class="flex flex-wrap items-baseline gap-x-2.5 font-serif text-2xl font-semibold tracking-tight"
						>
							Spending log
							{#if spend.length > 0}
								<small class="font-sans text-sm font-normal text-muted-foreground nums">
									{CATEGORIES.map(
										(k) => `${CAT_LABEL[k]} ${fmtR(spentIn(spend, (x) => x.category === k))}`,
									).join(' · ')}
								</small>
							{/if}
						</h2>
						{#if spend.length === 0}
							<div class="panel">
								<Empty.Root>
									<Empty.Header>
										<Empty.Media variant="icon"><ReceiptIcon /></Empty.Media>
										<Empty.Title>Nothing logged yet</Empty.Title>
										<Empty.Description>
											Tap Log expense when you pay for a bed, a meal or a ticket. Amounts in local
											money are converted to reais.
										</Empty.Description>
									</Empty.Header>
								</Empty.Root>
							</div>
						{:else}
							{#each groups as g, gi (`${g.date}-${String(gi)}`)}
								<div class="flex flex-col gap-2" data-testid="spend-day">
									<div class="flex justify-between gap-2 px-1">
										<span class="eyebrow">{g.label}</span><span class="eyebrow nums"
											>{fmtR(g.total)}</span
										>
									</div>
									<ul class="flex flex-col divide-y divide-border/70 overflow-hidden panel">
										{#each g.items as x (x.id)}
											<li class="flex items-center gap-3 px-4 py-3 md:px-5" data-testid="spend-row">
												<div class="flex min-w-0 flex-1 flex-col gap-1">
													<span class="truncate font-medium">{x.label}</span>
													<span
														class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
													>
														<Chip tone={x.category}>{CAT_LABEL[x.category]}</Chip>
														{#if x.country}{countryName(countries, x.country)}{/if}
													</span>
												</div>
												<span class="flex flex-col items-end font-semibold whitespace-nowrap nums">
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
			</div>
		</div>
	{/if}
</div>

{#if canEdit}
	<RecordDialog
		target={editing}
		{trip}
		{countries}
		spendDefaults={{ today, country: current?.country ?? '', currency: current?.currency ?? 'BRL' }}
		onclose={() => (editing = null)}
	/>
{/if}
