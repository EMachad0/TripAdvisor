<!--
	One answer card (answers/*.md) (FROZEN props), as the platform's renderAnswerCard: the Q mark and the question,
	"Asked … · Updated … · About …", the tldr on its tinted panel, and the full answer and its sources folded away.
	The card's frame comes from the structured answer (question, dates, about, sources); only the two Markdown
	texts are the platform's own escaped md / mdInline HTML (tldrHtml, bodyHtml), shown inside a scoped wrapper so
	the Markdown rules stay the platform's. Every clock time in them gets the UTC offset of the answer's country.
	The About link opens the place or area sheet (with #answer-<id>) when the parent passes `onopenabout` and the
	card exists; otherwise, or with a modifier key, it is a plain link to the full page.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { getAppData } from '#lib/content/app-data.svelte.js';
	import type { Answer } from '#lib/content/types.js';
	import { answerDate, hostOf, moreLabel, safeUrl, tzMarkup } from '#lib/features/places/model.js';

	interface Props {
		answer: Answer;
		/** Show the "About …" line (off inside a place or area page). */
		showAbout?: boolean;
		/** Start with the full answer open (#answer-<id>). */
		open?: boolean;
		/** Opens the place or area sheet from the About line; leave out to show the name as plain text. */
		onopenabout?: (kind: 'place' | 'area', id: string) => void;
	}

	let { answer, showAbout = true, open = false, onopenabout }: Props = $props();
	const app = getAppData();
	const tldr = $derived(tzMarkup(answer.tldrHtml, answer.tz));
	const body = $derived(tzMarkup(answer.bodyHtml, answer.tz));
	const about = $derived(answer.about);
	const aboutHref = $derived(
		about.kind === 'place'
			? resolve('/place/[id]', { id: about.id })
			: about.kind === 'area'
				? resolve('/area/[id]', { id: about.id })
				: '',
	);
	const aboutKnown = $derived(
		about.kind === 'place'
			? app.content.places.some((p) => p.id === about.id)
			: about.kind === 'area' && app.content.areas.some((a) => a.id === about.id),
	);
	const hasMore = $derived(answer.bodyHtml !== '' || answer.sources.length > 0);

	function openAbout(e: MouseEvent): void {
		if (onopenabout === undefined || !aboutKnown || e.metaKey || e.ctrlKey || e.shiftKey) return;
		if (about.kind !== 'place' && about.kind !== 'area') return;
		e.preventDefault();
		onopenabout(about.kind, about.id);
	}
</script>

<article
	id={`answer-${answer.id}`}
	data-answer={answer.id}
	class="min-w-0 scroll-mt-24 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm"
>
	<h3 class="flex items-baseline gap-3 font-serif text-lg leading-snug font-semibold wrap-anywhere">
		<span
			class="grid size-7 shrink-0 -translate-y-0.5 place-items-center rounded-full bg-cat/15 font-sans text-xs font-bold text-cat"
			aria-hidden="true">Q</span
		><span>{answer.question}</span>
	</h3>
	<p class="mt-1.5 mb-3 pl-10 text-xs leading-normal font-medium text-ink-3" data-answer-meta>
		<time datetime={answer.asked}>Asked {answerDate(answer.asked)}</time>
		{#if answer.updated !== null}
			<span aria-hidden="true"> · </span><span>Updated {answerDate(answer.updated)}</span>
		{/if}
		{#if showAbout}
			<span aria-hidden="true"> · </span>
			<span data-answer-about>
				{#if about.kind === 'trip'}
					About the whole trip
				{:else if about.kind === 'country'}
					About <b class="font-semibold text-ink-2">{about.name}</b>
				{:else if onopenabout === undefined}
					About <b class="font-semibold text-ink-2">{about.name}</b>
				{:else}
					About
					<!-- eslint-disable svelte/no-navigation-without-resolve -- aboutHref is built with resolve() above -->
					<a
						class="font-semibold text-cat no-underline hover:underline"
						href={aboutHref}
						data-open-kind={about.kind}
						data-open-id={about.id}
						onclick={openAbout}>{about.name}</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			</span>
		{/if}
	</p>
	<p class="answer-md rounded-lg bg-cat/10 px-3.5 py-3 text-base leading-normal wrap-anywhere">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- platform mdInline output: every text is escaped -->
		{@html tldr}
	</p>
	{#if hasMore}
		<details class="group mt-2.5" {open}>
			<summary
				class="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 px-0.5 text-sm font-semibold text-cat"
			>
				<span
					class="size-2 -rotate-45 border-r-2 border-b-2 border-current transition-transform group-open:rotate-45"
					aria-hidden="true"
				></span>
				{moreLabel(answer.bodyHtml !== '', answer.sources.length)}
			</summary>
			{#if answer.bodyHtml !== ''}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- platform md output: every text is escaped -->
				<div class="answer-md answer-body mt-1.5 wrap-anywhere">{@html body}</div>
			{/if}
			{#if answer.sources.length > 0}
				<ul
					class="mt-3 flex flex-col gap-1.5 border-t border-border pt-2.5 text-sm"
					data-answer-sources
				>
					{#each answer.sources as s, i (i)}
						<li>
							<!-- eslint-disable svelte/no-navigation-without-resolve -- external source URL, not an app route -->
							<a
								class="wrap-anywhere text-ink-2 underline decoration-cat/40"
								href={safeUrl(s.url)}
								target="_blank"
								rel="noopener noreferrer">{s.title}</a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{#if hostOf(s.url) !== ''}
								<small class="text-ink-3">{hostOf(s.url)}</small>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</details>
	{/if}
</article>

<style>
	/* The scoped wrapper for the platform's Markdown HTML (paragraphs, lists, links, emphasis, code): the old .rich
	   and .qa__tldr / .qa__body rules, with theme tokens. Nothing here reaches outside an answer card. */
	.answer-md :global(a) {
		color: var(--color-cat);
		text-decoration: underline;
	}
	.answer-md :global(strong) {
		font-weight: 600;
	}
	.answer-md :global(code) {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}
	.answer-body :global(p) {
		margin: 0 0 1.1em;
		color: var(--color-ink-2);
	}
	.answer-body :global(ul),
	.answer-body :global(ol) {
		margin: 0 0 1.1em;
		padding-left: 1.2em;
		color: var(--color-ink-2);
	}
	.answer-body :global(ul) {
		list-style: disc;
	}
	.answer-body :global(ol) {
		list-style: decimal;
	}
	.answer-body :global(li) {
		margin: 0.35em 0;
	}
	.answer-body :global(li::marker) {
		color: var(--color-cat);
	}
	.answer-body > :global(:last-child) {
		margin-bottom: 0;
	}
	summary::-webkit-details-marker {
		display: none;
	}
</style>
