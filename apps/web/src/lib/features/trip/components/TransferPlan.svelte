<!--
	The plan of a transfer (the old openDetail): "Leave by" and the route, the steps with their times (a "!" step in
	red), "Good to know", pickup and drop-off with Copy, and Route & traffic / Open in Uber.
-->
<script lang="ts">
	import { legOffsets, timeOf } from '@atr/shared/trip';
	import TimeTz from '#lib/components/shell/TimeTz.svelte';
	import TzText from './TzLine.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import { copyText } from '../actions.ts';
	import { gdirections, parsePlan, uberTo } from '../format.ts';
	import type { TripLeg } from '../types.ts';
	import Label from './Label.svelte';
	import LinkedText from './LinkedText.svelte';

	interface Props {
		leg: TripLeg;
		legs: readonly TripLeg[];
	}

	let { leg: l, legs }: Props = $props();
	const off = $derived(legOffsets(l, legs).start);
	const steps = $derived(parsePlan(l.plan));
	const o = $derived(l.fromPlace ?? '');
	const d = $derived(l.toPlace ?? '');
</script>

<div class="flex flex-col gap-4" data-testid="transfer-plan">
	<div class="flex items-center gap-3.5">
		{#if timeOf(l.start) !== ''}
			<div class="shrink-0 rounded-xl bg-seal/10 px-3 py-2 text-center">
				<Label tone="seal">Leave by</Label>
				<b class="font-serif text-2xl leading-none font-semibold text-seal tabular-nums"
					><TimeTz time={l.start ?? ''} offset={off} /></b
				>
			</div>
		{/if}
		<div class="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
			{[l.fromName, l.toName].filter((x) => x !== undefined && x !== '').join(' → ')}
			{#if (l.mode ?? '') !== '' || (l.duration ?? '') !== ''}
				<small class="mt-0.5 block font-normal text-ink-3"
					>{[l.mode, l.duration].filter((x) => x !== undefined && x !== '').join(' · ')}</small
				>
			{/if}
		</div>
	</div>

	{#if steps.length > 0}
		<ol class="flex flex-col">
			{#each steps as s, i (i)}
				<li class={cn('flex items-start gap-2.5 pb-3.5 text-sm', s.key && 'font-bold text-seal')}>
					<span
						class={cn(
							'w-18 shrink-0 text-right whitespace-nowrap tabular-nums',
							s.key ? 'text-seal' : 'text-ink-2',
						)}
						>{#if s.t !== ''}<TzText text={s.t} offset={off} />{/if}</span
					>
					<i
						class={cn(
							'mt-1 size-2.5 shrink-0 rounded-full border-2',
							s.key ? 'border-seal bg-seal' : 'border-ok bg-card',
						)}
						aria-hidden="true"
					></i>
					<span class="min-w-0 flex-1 wrap-anywhere"><LinkedText text={s.text} offset={off} /></span
					>
				</li>
			{/each}
		</ol>
	{/if}

	{#if l.note}
		<div class="rounded-xl bg-surface-2 px-3.5 py-3 text-sm wrap-anywhere whitespace-pre-line">
			<Label>Good to know</Label>
			<LinkedText text={l.note} offset={off} />
		</div>
	{/if}

	{#each [{ addr: o, lab: 'Pickup' }, { addr: d, lab: 'Drop-off' }] as { addr, lab } (lab)}
		{#if addr}
			<div class="flex items-center justify-between gap-3 text-sm">
				<span class="min-w-0 wrap-anywhere"><Label>{lab}</Label>{addr}</span>
				<Button
					variant="outline"
					size="xs"
					onclick={() => {
						void copyText(addr);
					}}>Copy</Button
				>
			</div>
		{/if}
	{/each}

	{#if (o && d) || (d && /uber/i.test(l.mode ?? ''))}
		<div class="flex flex-wrap gap-1.5">
			{#if o && d}
				<Button
					variant="outline"
					size="sm"
					href={gdirections(o, d)}
					target="_blank"
					rel="noopener noreferrer">Route &amp; traffic</Button
				>
			{/if}
			{#if d && /uber/i.test(l.mode ?? '')}
				<Button size="sm" href={uberTo(d, o)} target="_blank" rel="noopener noreferrer"
					>Open in Uber</Button
				>
			{/if}
		</div>
	{/if}
</div>
