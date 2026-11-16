<!--
	Days in a country (old .g-stepper): − / + with the count, and "plan N" when it differs from the trip config.
	The count slides in from the side it moved to. Disabled for the guest.
-->
<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { fly } from 'svelte/transition';
	import * as ButtonGroup from '#lib/components/ui/button-group/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { MAX_DAYS } from '../model.ts';

	interface Props {
		country: string;
		days: number;
		configDays: number;
		disabled: boolean;
		reduced: boolean;
		onstep: (step: 1 | -1) => void;
	}

	let { country, days, configDays, disabled, reduced, onstep }: Props = $props();
	let dir = $state(1);
</script>

<ButtonGroup.Root aria-label={`Days in ${country}`} data-days-stepper>
	<Button
		variant="outline"
		size="icon"
		aria-label="One day less"
		disabled={disabled || days <= 0}
		onclick={() => {
			dir = -1;
			onstep(-1);
		}}><Minus /></Button
	>
	<ButtonGroup.Text>
		<output
			class="flex min-w-20 items-baseline justify-center gap-1.5 leading-none"
			aria-live="polite"
		>
			<span class="overflow-hidden text-sm text-muted-foreground"
				>{#key days}<b
						class="inline-block font-serif text-lg font-semibold text-foreground"
						in:fly={{ y: dir * 8, duration: reduced ? 0 : 220 }}>{days}</b
					>{/key}
				day{days === 1 ? '' : 's'}</span
			>
			{#if days !== configDays}<small class="text-xs font-semibold text-warn"
					>plan {configDays}</small
				>{/if}
		</output>
	</ButtonGroup.Text>
	<Button
		variant="outline"
		size="icon"
		aria-label="One day more"
		disabled={disabled || days >= MAX_DAYS}
		onclick={() => {
			dir = 1;
			onstep(1);
		}}><Plus /></Button
	>
</ButtonGroup.Root>
