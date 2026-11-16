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

<li class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0" data-answer={answer.id}>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is built from resolve() by the parent -->
	<a {href} class="font-serif text-base leading-snug font-semibold hover:text-cat hover:underline"
		>{answer.question}</a
	>
	<p class="text-sm text-ink-2"><TzText text={plainMd(answer.tldr)} offset={answer.tz} /></p>
	<small class="text-xs text-ink-3">
		{askedLabel(answer)} ·
		{#if about.kind === 'trip'}
			Whole trip
		{:else if about.kind === 'country'}
			{about.name}
		{:else}
			{@const kind = about.kind}
			<button
				type="button"
				class="font-medium text-ink-2 underline underline-offset-2 hover:text-cat"
				onclick={() => {
					onopenabout(kind, about.id);
				}}>{about.name}</button
			>
		{/if}
	</small>
</li>
