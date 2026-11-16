<!--
	The Decide section's pages (old #subtabs row for Decide): Overview, Areas, Swipe, Duels, Board, Holidays and My
	calls, with the old badges (areas and places left to swipe, holidays still open). Scrolls sideways on a phone and
	keeps the current page in view.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SubNav from '#lib/components/shell/SubNav.svelte';

	interface Props {
		areasLeft: number;
		placesLeft: number;
		holidayOpen: number;
	}

	let { areasLeft, placesLeft, holidayOpen }: Props = $props();
	const path = $derived(page.url.pathname.replace(/\/$/, ''));
	const links = $derived(
		[
			{ href: resolve('/(app)/decide'), path: '/decide', label: 'Overview', badge: 0 },
			{
				href: resolve('/(app)/decide/areas'),
				path: '/decide/areas',
				label: 'Areas',
				badge: areasLeft,
			},
			{
				href: resolve('/(app)/decide/swipe'),
				path: '/decide/swipe',
				label: 'Swipe',
				badge: placesLeft,
			},
			{ href: resolve('/(app)/decide/duels'), path: '/decide/duels', label: 'Duels', badge: 0 },
			{ href: resolve('/(app)/decide/board'), path: '/decide/board', label: 'Board', badge: 0 },
			{
				href: resolve('/(app)/decide/holidays'),
				path: '/decide/holidays',
				label: 'Holidays',
				badge: holidayOpen,
			},
			{ href: resolve('/(app)/decide/calls'), path: '/decide/calls', label: 'My calls', badge: 0 },
		].map((l) => ({ href: l.href, label: l.label, badge: l.badge, on: path === l.path })),
	);
</script>

<SubNav label="Decide pages" {links} full={path === '/decide/board'} />
