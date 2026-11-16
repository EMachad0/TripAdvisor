<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import GalleryHorizontalEnd from '@lucide/svelte/icons/gallery-horizontal-end';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import RouteIcon from '@lucide/svelte/icons/route';
	import Sun from '@lucide/svelte/icons/sun';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { cn } from '#lib/utils.js';
	import ThemeToggle from './ThemeToggle.svelte';
	import { activeTab, TABS, type Tab, type TabBadges } from './tabs';

	interface Props {
		role: 'owner' | 'guest';
		username: string | null;
		badges?: TabBadges;
		children: Snippet;
	}

	let { role, username, badges = {}, children }: Props = $props();
	const ICONS: Record<Tab['path'], Component> = {
		'/': Sun,
		'/trip': RouteIcon,
		'/places': MapPin,
		'/decide': GalleryHorizontalEnd,
		'/money': CreditCard,
		'/prep': ListChecks,
	};
	const current = $derived(activeTab(page.url.pathname));
</script>

<div class="flex min-h-svh flex-col pb-16 md:pb-0">
	<!-- No backdrop-filter here: it would make the header the containing block of the fixed bottom nav. -->
	<header class="sticky top-0 z-10 border-b border-border bg-background">
		<div class="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
			<a href={resolve('/(app)')} class="font-serif text-lg font-semibold text-foreground"
				>Asia Trip</a
			>
			<nav
				aria-label="Sections"
				class="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-border bg-background md:static md:justify-start md:gap-1 md:border-0 md:bg-transparent"
			>
				{#each TABS as tab (tab.path)}
					{@const Icon = ICONS[tab.path]}
					{@const count = badges[tab.path] ?? 0}
					<a
						href={resolve(tab.route)}
						aria-current={current === tab.path ? 'page' : undefined}
						class={cn(
							'relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-xs font-medium text-muted-foreground md:flex-none md:flex-row md:gap-1.5 md:rounded-md md:px-3 md:py-2 md:text-sm',
							current === tab.path && 'text-cat md:bg-secondary md:text-foreground',
						)}
					>
						<Icon class="size-5 md:hidden" aria-hidden="true" />
						<span>{tab.label}</span>
						{#if count > 0}
							<Badge class="absolute top-0.5 left-1/2 ml-2 md:static md:ml-0"
								>{count > 99 ? '99+' : count}</Badge
							>
						{/if}
					</a>
				{/each}
			</nav>
			<div class="ml-auto flex items-center gap-2">
				{#if role === 'guest'}
					<Badge variant="secondary">Guest · read only</Badge>
				{/if}
				<span class="hidden text-sm text-muted-foreground sm:inline" data-testid="username">
					{username ?? ''}
				</span>
				<ThemeToggle />
				<form method="post" action={resolve('/logout')}>
					<Button type="submit" variant="ghost" size="sm">Sign out</Button>
				</form>
			</div>
		</div>
	</header>
	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
		{@render children()}
	</main>
</div>
<Toaster position="bottom-center" />
