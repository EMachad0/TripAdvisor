<script lang="ts">
	import AppShell from '#lib/components/shell/AppShell.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<AppShell role={data.me.role} username={data.me.username}>
	{@render children()}
</AppShell>
