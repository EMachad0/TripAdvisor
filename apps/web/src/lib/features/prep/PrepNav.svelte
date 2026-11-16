<!--
	The Prep section's pages (old #subtabs row for Prep): To do with the open-task badge, and Bag. `/prep` itself
	shows To do, as the old Prep tab opened #/todo.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SubNav from '#lib/components/shell/SubNav.svelte';

	interface Props {
		openTasks: number;
	}

	let { openTasks }: Props = $props();
	const path = $derived(page.url.pathname);
	const onBag = $derived(path === '/prep/bag' || path.startsWith('/prep/bag/'));
	const links = $derived([
		{ href: resolve('/(app)/prep/todo'), label: 'To do', on: !onBag, badge: openTasks },
		{ href: resolve('/(app)/prep/bag'), label: 'Bag', on: onBag, badge: 0 },
	]);
</script>

<SubNav label="Prep pages" {links} />
