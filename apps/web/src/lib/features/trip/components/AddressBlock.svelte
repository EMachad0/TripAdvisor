<!-- An address with the ways to get there (the old placeBlock): Google Maps, Apple Maps, Uber here, Copy address. -->
<script lang="ts">
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import { Button } from '#lib/components/ui/button/index.js';
	import { copyText } from '../actions.ts';
	import { amaps, gmaps, uberTo } from '../format.ts';
	import Label from './Label.svelte';

	interface Props {
		address: string;
		label?: string;
	}

	let { address, label = 'Address' }: Props = $props();
</script>

<div class="mt-3 flex flex-col gap-2">
	<div class="flex items-center gap-3">
		<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-ok/15 text-ok">
			<MapPinIcon class="size-5" aria-hidden="true" />
		</span>
		<div class="min-w-0 flex-1 text-sm wrap-anywhere">
			<Label>{label}</Label>
			{address}
		</div>
	</div>
	<div class="flex flex-wrap gap-1.5">
		<Button
			variant="outline"
			size="sm"
			href={gmaps(address)}
			target="_blank"
			rel="noopener noreferrer">Google Maps</Button
		>
		<Button
			variant="outline"
			size="sm"
			href={amaps(address)}
			target="_blank"
			rel="noopener noreferrer">Apple Maps</Button
		>
		<Button size="sm" href={uberTo(address)} target="_blank" rel="noopener noreferrer"
			>Uber here</Button
		>
		<Button
			variant="outline"
			size="sm"
			onclick={() => {
				void copyText(address);
			}}>Copy address</Button
		>
	</div>
</div>
