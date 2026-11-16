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

<div class="flex flex-col gap-2.5">
	<div class="flex items-start gap-3">
		<span class="grid size-9 shrink-0 place-items-center rounded-xl bg-ok/12 text-ok">
			<MapPinIcon class="size-4.5" aria-hidden="true" />
		</span>
		<div class="min-w-0 flex-1 text-sm leading-snug wrap-anywhere">
			<Label>{label}</Label>
			{address}
		</div>
	</div>
	<div class="flex flex-wrap gap-1.5">
		<Button size="sm" href={uberTo(address)} target="_blank" rel="noopener noreferrer"
			>Uber here</Button
		>
		<Button variant="outline" size="sm" href={gmaps(address)} target="_blank" rel="noopener noreferrer"
			>Google Maps</Button
		>
		<Button variant="outline" size="sm" href={amaps(address)} target="_blank" rel="noopener noreferrer"
			>Apple Maps</Button
		>
		<Button
			variant="ghost"
			size="sm"
			onclick={() => {
				void copyText(address);
			}}>Copy address</Button
		>
	</div>
</div>
