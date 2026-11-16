<!--
	A labelled native select for the Places filters: the small-caps label above, a pill-shaped field (44 px on a
	phone) with the chevron. A plain element, so it can be sized for the thumb; the options come as children.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		value: string;
		onchange: (value: string) => void;
		children: Snippet;
	}

	let { label, value, onchange, children }: Props = $props();
</script>

<label class="flex min-w-0 flex-col gap-1.5">
	<span class="px-1 eyebrow">{label}</span>
	<span class="relative block">
		<select
			aria-label={label}
			class="h-11 w-full min-w-0 cursor-pointer appearance-none truncate rounded-xl border border-border bg-card pr-9 pl-3.5 text-base font-medium text-foreground shadow-flat transition duration-200 outline-none hover:border-cat/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm xl:h-10"
			bind:value={() => value, onchange}
		>
			{@render children()}
		</select>
		<ChevronDown
			class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
			aria-hidden="true"
		/>
	</span>
</label>
