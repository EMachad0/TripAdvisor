<script lang="ts">
	import './layout.css';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '#lib/auth-client.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	createSvelteAuthClient({ authClient, getServerState: () => data.authState });
</script>

{@render children()}
