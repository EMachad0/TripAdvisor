<!--
	Skip / Maybe / Must as one segmented control (old .g-seg): the place sheet bar, My calls rows and the pick-many
	holiday cards. Each button has aria-pressed; `disabled` for the guest.
-->
<script lang="ts">
	import { cn } from '#lib/utils.js';
	import { VERDICT_LABEL, VERDICT_ORDER, type Verdict } from './model.ts';

	interface Props {
		value: Verdict | undefined;
		onpick: (verdict: Verdict) => void;
		/** The group's accessible name ("Your call", "Your call on <name>"). */
		label?: string;
		disabled?: boolean;
		/** Stretch the buttons to the full width. */
		block?: boolean;
	}

	let { value, onpick, label = 'Your call', disabled = false, block = false }: Props = $props();
</script>

<div
	role="group"
	aria-label={label}
	class={cn(
		'inline-flex shrink-0 rounded-xl border border-border bg-muted p-0.5',
		block && 'flex w-full',
	)}
>
	{#each VERDICT_ORDER as k (k)}
		<button
			type="button"
			data-verdict-seg={k}
			aria-pressed={value === k}
			{disabled}
			onclick={() => {
				if (value !== k) onpick(k);
			}}
			class={cn(
				'rounded-lg px-3 py-2 text-sm leading-none font-semibold text-muted-foreground transition-colors enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
				block && 'flex-1',
				value === k && 'text-primary-foreground enabled:hover:text-primary-foreground',
				value === k && k === 'must' && 'bg-must',
				value === k && k === 'maybe' && 'bg-maybe',
				value === k && k === 'skip' && 'bg-skip',
			)}>{VERDICT_LABEL[k]}</button
		>
	{/each}
</div>
