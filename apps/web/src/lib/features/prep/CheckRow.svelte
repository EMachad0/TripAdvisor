<!--
	One row of the To do and Bag lists (old trip.js taskRow and the bag rows): the tick box, the title with its chips,
	the note, and ⋯ to edit. The box shows the stored state; a tap asks the parent to write the other one. The guest
	sees the box disabled and no ⋯.
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
		ontoggle,
		onedit,
	}: Props = $props();
	const boxId = $derived(`chk-${id}`);
</script>

<li
	class="flex items-start gap-3 px-3 py-3"
	data-testid="check-row"
	data-id={id}
	data-done={checked}
>
	<div class="flex h-6 items-center">
		<Checkbox
			id={boxId}
			aria-label={checkLabel}
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
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<span class={cn('font-medium', checked && 'text-ink-3 line-through decoration-line')}
				>{title}</span
			>
			{@render extra?.()}
		</div>
		{#if note}
			<RichText text={note} class={cn('text-sm text-muted-foreground', checked && 'text-ink-3')} />
		{/if}
	</div>
	{#if canEdit}
		<EditButton label={title} onclick={onedit} />
	{/if}
</li>
