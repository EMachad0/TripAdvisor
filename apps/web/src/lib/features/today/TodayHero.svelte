<!--
	The head of Today: the date (eyebrow), the trip day and where you sleep (the page's h1), the lede, a slim bar of
	how far into the trip you are, the clocks of where you are and São Paulo, and the date box that opens another
	day (/today/<date>) with "Back to today" when one is open. Same typography as the shell's PageHeader; its own
	markup because the e2e specs read the eyebrow and the lede by test id.
-->
<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import TimeTz from '#lib/components/shell/TimeTz.svelte';
	import { fmtShort } from '#lib/features/trip/format.js';
	import { cn } from '#lib/utils.js';
	import type { Clock, Head } from './model.ts';

	interface Props {
		head: Head;
		/** A picked day (not the real today). */
		pinned: boolean;
		/** The day shown, YYYY-MM-DD. */
		day: string;
		/** "Mon 21 Dec: " or "Today: ", read before the title by screen readers. */
		srPrefix: string;
		zones: readonly Clock[];
		/** Day n of the trip, during it. */
		progress: { n: number; days: number; first: string; last: string } | null;
		/** The real today's page, built from resolve(). */
		todayHref: string;
		onpick: (value: string) => void;
	}

	let { head: h, pinned, day, srPrefix, zones, progress, todayHref, onpick }: Props = $props();
</script>

<header class="flex flex-col gap-5 md:gap-6 xl:flex-row xl:items-end xl:justify-between xl:gap-10">
	<div class="flex min-w-0 flex-col gap-2 xl:max-w-2xl 3xl:max-w-3xl">
		<p class="flex items-center gap-2 eyebrow nums" data-testid="eyebrow">
			{h.eyebrow}
		</p>
		<h1
			class="font-serif text-3xl leading-none font-semibold tracking-tight text-balance md:text-4xl 3xl:text-5xl"
		>
			<span class="sr-only">{srPrefix}</span>{#if h.titleStay}{`${h.title} · `}<em
					class="font-normal text-cat">{h.titleStay}</em
				>{:else}{h.title}{/if}
		</h1>
		{#if h.lede}
			<p class="max-w-prose text-sm text-muted-foreground md:text-base" data-testid="lede">
				{h.lede}
			</p>
		{/if}
		{#if progress}
			<div class="mt-2 flex max-w-md flex-col gap-1.5">
				<Progress
					value={progress.n}
					max={progress.days}
					aria-label={`Day ${String(progress.n)} of ${String(progress.days)}`}
				/>
				<div class="flex justify-between text-2xs text-ink-3 nums" aria-hidden="true">
					<span>{fmtShort(progress.first)}</span>
					<span>{Math.round((100 * progress.n) / progress.days)}% of the trip</span>
					<span>{fmtShort(progress.last)}</span>
				</div>
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between xl:justify-end">
		<p class="grid grid-cols-2 gap-2 md:flex" data-testid="clocks" aria-label="Local times">
			{#each zones as c, i (c.country)}
				<span
					class={cn(
						'flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-2 md:min-w-36 md:px-3.5 md:py-2.5',
						i === 0 ? 'bg-cat/10 ring-1 ring-cat/20' : 'bg-muted/60 ring-1 ring-border/60',
					)}
					data-clock={c.country}
				>
					<span class="truncate eyebrow">{c.name}</span>&#32;
					<b
						class="text-lg leading-tight font-semibold tracking-tight whitespace-nowrap text-foreground nums"
						><span class="font-sans text-xs font-medium text-ink-3">{c.weekday}</span>&#32;<TimeTz
							time={c.time}
							offset={c.offset}
						/></b
					>
				</span>
			{/each}
		</p>
		<div class="flex items-end gap-2">
			<label class="flex min-w-0 flex-1 flex-col gap-1 md:flex-none">
				<span class="eyebrow">{pinned ? 'Looking at' : 'Look at another day'}</span>
				<Input
					type="date"
					class="h-10 md:w-44"
					value={day}
					onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
						onpick(e.currentTarget.value);
					}}
				/>
			</label>
			{#if pinned}
				<Button variant="outline" size="lg" href={todayHref}>Back to today</Button>
			{/if}
		</div>
	</div>
</header>
