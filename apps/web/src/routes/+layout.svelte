<script lang="ts">
	import './layout.css';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { onNavigate } from '$app/navigation';
	import { authClient } from '#lib/auth-client.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	createSvelteAuthClient({ authClient, getServerState: () => data.authState });

	// Route changes cross-fade where the browser supports view transitions (timing in layout.css). Only between
	// different pages: a change of query or hash on the same page stays instant.
	onNavigate((navigation) => {
		if (typeof document.startViewTransition !== 'function') return;
		if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise<void>((done) => {
			document.startViewTransition(async () => {
				done();
				await navigation.complete;
			});
		});
	});
</script>

{@render children()}
