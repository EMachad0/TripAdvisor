<!--
	One compact answer on Today (old trip.js answerRow): the question (opens it on the Answers page), the tldr as
	plain text with the UTC offset after its times, the asked date and what it is about. A place or area name opens
	its sheet, as the old bindAnswerLinks did.
-->
<script lang="ts">
	import TzText from '#lib/features/trip/components/TzLine.svelte';
	import type { Answer } from '#lib/content/types.js';
	import { askedLabel, plainMd } from './model.ts';

	interface Props {
		answer: Answer;
		/** /places/answers/<id>, built from resolve(). */
		href: string;
		onopenabout: (kind: 'place' | 'area', id: string) => void;
	}

	let { answer, href, onopenabout }: Props = $props();
	const about = $derived(answer.about);
</script>

<li class="flex flex-col gap-1.5 px-3 py-3.5" data-answer={answer.id}>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- href is built from resolve() by the parent -->
	<a
		{href}
		class="rounded-sm font-serif text-base leading-snug font-semibold text-balance transition-colors duration-200 hover:text-cat focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>{answer.question}</a
	>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	<p class="line-clamp-3 text-sm leading-relaxed text-ink-2">
		<TzText text={plainMd(answer.tldr)} offset={answer.tz} />
	</p>
	<small class="text-xs text-ink-3 nums">
		{askedLabel(answer)} ·
		{#if about.kind === 'trip'}
			Whole trip
		{:else if about.kind === 'country'}
			{about.name}
		{:else}
			{@const kind = about.kind}
			<button
				type="button"
				class="rounded-sm font-medium text-ink-2 underline decoration-ink-3/40 underline-offset-2 transition-colors hover:text-cat hover:decoration-cat focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				onclick={() => {
					onopenabout(kind, about.id);
				}}>{about.name}</button
			>
		{/if}
	</small>
</li>
