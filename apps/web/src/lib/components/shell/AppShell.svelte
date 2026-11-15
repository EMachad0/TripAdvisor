<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
	import ThemeToggle from './ThemeToggle.svelte';
	import { activeTab, TABS } from './tabs';

	interface Props {
		role: 'owner' | 'guest';
		username: string | null;
		children: Snippet;
	}

	let { role, username, children }: Props = $props();
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
					<a
						href={resolve(tab.route)}
						aria-current={current === tab.path ? 'page' : undefined}
						class={cn(
							'px-3 py-3 text-sm font-medium text-muted-foreground md:rounded-md md:py-2',
							current === tab.path && 'text-cat md:bg-secondary md:text-foreground',
						)}
					>
						{tab.label}
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
