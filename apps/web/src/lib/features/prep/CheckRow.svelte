<!--
	One row of the To do and Bag lists (old trip.js taskRow and the bag rows): the tick box, the title with its chips,
	the note, and ⋯ to edit. The box shows the stored state; a tap asks the parent to write the other one. The title
	is the box's label too, so the whole line is a big tap target. The guest sees the box disabled and no ⋯.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { cn } from '#lib/utils.js';
	import EditButton from '../money/EditButton.svelte';
	import RichText from '../money/RichText.svelte';

	interface Props {
		id: string;
		title: string;
		note: string;
		checked: boolean;
		/** Half-ticked (a task in progress). */
		indeterminate?: boolean;
		/** The box's accessible name ("Mark done: Buy an eSIM"). */
		checkLabel: string;
		canEdit: boolean;
		busy?: boolean;
		/** Chips and the quantity after the title. */
		extra?: Snippet;
		/** Extra classes for the row (a card of its own in a masonry list). */
		class?: string;
		ontoggle: () => void;
		onedit: () => void;
	}

	let {
		id,
		title,
		note,
		checked,
		indeterminate = false,
		checkLabel,
		canEdit,
		busy = false,
		extra,
		class: className,
		ontoggle,
		onedit,
	}: Props = $props();
	const boxId = $derived(`chk-${id}`);
</script>

<li
	class={cn(
		'group/row flex items-start gap-3 px-4 py-3 transition-colors duration-200 md:px-5',
		busy && 'opacity-60',
		className,
	)}
	data-testid="check-row"
	data-id={id}
	data-done={checked}
>
	<div class="flex h-6 w-5 shrink-0 items-center justify-center">
		<Checkbox
			id={boxId}
			aria-label={checkLabel}
			class="size-5"
			disabled={!canEdit || busy}
			bind:checked={
				() => checked,
				() => {
					ontoggle();
				}
			}
			bind:indeterminate={
				() => indeterminate && !checked,
				() => {
					// The stored status decides; a tap only asks the parent to write.
				}
			}
		/>
	</div>
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<label
				for={boxId}
				class={cn(
					'leading-6 font-medium transition-colors duration-200',
					canEdit && !busy && 'cursor-pointer',
					checked && 'text-muted-foreground line-through decoration-ink-3/40',
				)}>{title}</label
			>
			{@render extra?.()}
		</div>
		{#if note}
			<RichText
				text={note}
				class={cn(
					'text-sm leading-relaxed text-muted-foreground',
					checked && 'text-ink-3 opacity-80',
				)}
			/>
		{/if}
	</div>
	{#if canEdit}
		<EditButton label={title} onclick={onedit} />
	{/if}
</li>
