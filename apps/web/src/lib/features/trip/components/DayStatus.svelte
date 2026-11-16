<!--
	What a day is (the old dayStatusHtml): work (with the night shift in the local clock and in São Paulo),
	vacation, day off, the Brazilian holiday and the day's note. Shared by the day sheet and Today.
-->
<script lang="ts">
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import StarIcon from '@lucide/svelte/icons/star';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { SHIFT, TZ_OFFSET, tzLabel } from '@atr/shared/trip';
	import TzText from './TzLine.svelte';
	import type { TripDay } from '../types.ts';
	import Chip from './Chip.svelte';
	import LinkedText from './LinkedText.svelte';

	interface Props {
		day: TripDay | null;
		/** The country you are in that day. */
		country: string | undefined;
		/** Offset to use when the country has none (offsetOn). */
		fallbackOffset: number | null;
	}

	let { day, country, fallbackOffset }: Props = $props();
	const countryOff = $derived(country !== undefined ? (TZ_OFFSET[country] ?? null) : null);
	const shift = $derived(country !== undefined ? SHIFT[country] : undefined);
	const sp = tzLabel(-3);
</script>

{#if day}
	<div class="flex flex-col gap-2 text-sm" data-testid="day-status">
		{#if day.status === 'work'}
			<div class="flex flex-wrap items-center gap-2">
				<Chip tone="strong"><LaptopIcon class="size-3.5" aria-hidden="true" /> Work</Chip>
				<span>
					{#if shift}
						Night shift <TzText text={shift} offset={countryOff} /> here, starting this evening. That
						is 09:00–18:00 <span class="text-xs font-medium text-muted-foreground">{sp}</span> in São
						Paulo.
					{:else}
						09:00–18:00 <span class="text-xs font-medium text-muted-foreground">{sp}</span> in São Paulo
					{/if}
				</span>
			</div>
		{/if}
		{#if day.status === 'vacation'}
			<div><Chip tone="ok"><SunIcon class="size-3.5" aria-hidden="true" /> Vacation</Chip></div>
		{/if}
		{#if day.status === 'off'}
			<div><Chip>Day off</Chip></div>
		{/if}
		{#if day.holiday}
			<div class="inline-flex items-center gap-1.5 font-semibold text-seal">
				<StarIcon class="size-4 fill-current" aria-hidden="true" />
				{day.holiday} <small class="font-medium text-ink-3">holiday in Brazil</small>
			</div>
		{/if}
		{#if day.note}
			<p class="wrap-anywhere whitespace-pre-line text-ink-2">
				<LinkedText text={day.note} offset={countryOff ?? fallbackOffset} />
			</p>
		{/if}
	</div>
{/if}
