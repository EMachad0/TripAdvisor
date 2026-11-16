<!--
	The app frame, one DOM for three shapes (docs/DESIGN.md):
	  phone (Fold cover)      slim top bar, floating glass tab bar at the bottom
	  md (Fold inner screen)  icon rail on the left: the screen is nearly square, so height is not spent on bars
	  xl (laptop, monitor)    full sidebar with labels, the account at its foot
-->
<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import GalleryHorizontalEnd from '@lucide/svelte/icons/gallery-horizontal-end';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import LogOut from '@lucide/svelte/icons/log-out';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import RouteIcon from '@lucide/svelte/icons/route';
	import Sun from '@lucide/svelte/icons/sun';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
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

<div class="flex min-h-svh flex-col md:pl-21 xl:pl-64">
	<!--
		No backdrop-filter on the header itself: on a phone it would become the containing block of the fixed tab bar
		inside it. The tab bar carries its own blur.
	-->
	<header
		class="sticky top-0 z-30 flex h-13 items-center gap-3 border-b border-border/70 bg-background px-4 pt-safe md:fixed md:inset-y-0 md:left-0 md:h-auto md:w-21 md:flex-col md:gap-5 md:border-r md:border-b-0 md:bg-card/60 md:px-2 md:py-5 xl:w-64 xl:items-stretch xl:px-4 xl:py-6"
	>
		<a
			href={resolve('/(app)')}
			class="flex items-center gap-2.5 rounded-xl text-foreground xl:px-2"
			aria-label="Asia Trip"
		>
			<span
				class="grid size-8 shrink-0 place-items-center rounded-lg font-serif text-lg leading-none font-semibold bg-accent-fill shadow-flat md:size-10 md:text-xl xl:size-9 xl:text-lg"
				aria-hidden="true">A</span
			>
			<span class="flex flex-col md:hidden xl:flex">
				<span class="font-serif text-lg leading-tight font-semibold tracking-tight">Asia Trip</span>
				<span class="hidden text-2xs leading-tight text-muted-foreground xl:block"
					>Dec 2026 to Feb 2027</span
				>
			</span>
		</a>

		<nav
			aria-label="Sections"
			class="fixed inset-x-2.5 bottom-safe z-30 flex justify-around rounded-3xl p-1.5 shadow-big glass md:static md:w-full md:flex-1 md:flex-col md:justify-start md:gap-1 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-filter-none"
		>
			{#each TABS as tab (tab.path)}
				{@const Icon = ICONS[tab.path]}
				{@const count = badges[tab.path] ?? 0}
				{@const on = current === tab.path}
				<a
					href={resolve(tab.route)}
					aria-current={on ? 'page' : undefined}
					class={cn(
						'group relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-2xs leading-tight font-medium text-muted-foreground transition-colors duration-200 md:flex-none md:rounded-2xl md:py-2.5 xl:flex-row xl:gap-3 xl:rounded-xl xl:px-3 xl:py-2.5 xl:text-sm',
						on
							? 'bg-cat/12 font-semibold text-cat xl:bg-card xl:text-foreground xl:shadow-flat xl:ring-1 xl:ring-border'
							: 'hover:bg-muted/70 hover:text-foreground',
					)}
				>
					<Icon
						class={cn(
							'size-5.5 transition-transform duration-200 group-active:scale-90 md:size-6 xl:size-4.5',
							on && 'xl:text-cat',
						)}
						strokeWidth={on ? 2.2 : 1.8}
						aria-hidden="true"
					/>
					<span class="truncate">{tab.label}</span>
					{#if count > 0}
						<span
							class="absolute top-0.5 left-1/2 ml-1.5 count ring-2 ring-background md:top-1.5 md:ml-2 xl:static xl:ml-auto xl:ring-0"
							>{count > 99 ? '99+' : count}</span
						>
					{/if}
				</a>
			{/each}
		</nav>

		<div
			class="ml-auto flex items-center gap-1 md:ml-0 md:flex-col xl:flex-row xl:rounded-2xl xl:border xl:border-border/70 xl:bg-card xl:p-1.5 xl:pl-3 xl:shadow-flat"
		>
			<span class="hidden min-w-0 flex-1 flex-col xl:flex">
				<span class="truncate text-sm font-medium text-foreground" data-testid="username"
					>{username ?? ''}</span
				>
				{#if role === 'owner'}
					<span class="text-2xs leading-tight text-muted-foreground">Traveler</span>
				{/if}
			</span>
			{#if role === 'guest'}
				<span
					class="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground md:max-xl:rounded-lg md:max-xl:px-1 md:max-xl:text-center md:max-xl:text-3xs"
					>Guest · read only</span
				>
			{/if}
			<ThemeToggle />
			<form method="post" action={resolve('/logout')}>
				<Button type="submit" variant="ghost" size="icon" aria-label="Sign out" title="Sign out">
					<LogOut />
				</Button>
			</form>
		</div>
	</header>
	<main
		class="w-full flex-1 px-4 pt-4 pb-28 md:px-6 md:pt-7 md:pb-10 xl:px-10 xl:pt-9 3xl:px-14 3xl:pt-11"
	>
		{@render children()}
	</main>
</div>
<Toaster position="bottom-center" />
