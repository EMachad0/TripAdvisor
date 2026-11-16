<!-- The ⋯ button that opens a row's edit sheet (old trip.js editBtn). The guest never sees it. -->
<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { Button } from '#lib/components/ui/button/index.js';

	interface Props {
		/** What is edited, for the accessible name ("Edit: Flights"). */
		label: string;
		onclick: () => void;
	}

	let { label, onclick }: Props = $props();
</script>

<Button type="button" variant="ghost" size="icon" aria-label={`Edit: ${label}`} {onclick}>
	<EllipsisIcon />
</Button>
