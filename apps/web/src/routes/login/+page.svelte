<!--
	The sign-in page, the first thing anyone sees: a calm cover (the trip's title, its dates and route) beside the
	form. One column on a phone with the form within thumb reach; two halves from the Fold's inner screen up.
	The form posts without JavaScript too (+page.server.ts), so password managers keep working.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { cn } from '#lib/utils.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let pending = $state(false);

	/** The route in trip order, each stop in its country colour. */
	const ROUTE = [
		{ name: 'China', dot: 'bg-k2' },
		{ name: 'Thailand', dot: 'bg-k6' },
		{ name: 'Singapore', dot: 'bg-k7' },
		{ name: 'Korea', dot: 'bg-k3' },
		{ name: 'Japan', dot: 'bg-k5' },
		{ name: 'Hong Kong', dot: 'bg-k4' },
	] as const;
</script>

<svelte:head>
	<title>Sign in · Asia Trip Ranker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="relative isolate grid min-h-svh overflow-hidden md:grid-cols-2">
	<!-- A large, faint "journey" glyph behind the cover. -->
	<span
		lang="zh"
		aria-hidden="true"
		class="pointer-events-none absolute -top-6 -right-4 -z-10 font-serif text-9xl leading-none text-cat/7 select-none md:top-auto md:right-auto md:bottom-10 md:left-1/4 md:scale-300 xl:scale-400"
		>旅</span
	>

	<section
		class="flex flex-col justify-between gap-8 px-6 pt-7 pb-2 md:gap-10 md:border-r md:border-border/60 md:px-10 md:py-12 xl:px-16 xl:py-16 3xl:px-24 3xl:py-20"
	>
		<div class="flex items-center gap-2.5">
			<span
				class="grid size-9 place-items-center rounded-lg font-serif text-lg leading-none font-semibold bg-accent-fill shadow-flat"
				aria-hidden="true">A</span
			>
			<span class="font-serif text-lg font-semibold tracking-tight">Asia Trip</span>
		</div>

		<div
			class="flex max-w-xl flex-col gap-4 motion-safe:animate-in motion-safe:duration-500 motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 md:gap-7"
		>
			<p class="eyebrow">Solo, with one bag · Dec 2026 to Feb 2027</p>
			<h1
				class="font-serif text-4xl leading-none font-semibold tracking-tight md:text-6xl xl:text-7xl 3xl:text-8xl"
			>
				Six stops, <em class="font-normal text-cat">one winter.</em>
			</h1>
			<p class="max-w-md text-sm text-muted-foreground md:text-lg">
				The plan for two months on the road: where to sleep, what to eat, what it costs, and what is
				left to pack.
			</p>
			<ol
				class="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs md:gap-y-2 md:text-sm"
				aria-label="Route"
			>
				{#each ROUTE as stop, i (stop.name)}
					<li class="flex items-center gap-1">
						{#if i > 0}<span class="text-muted-foreground/70" aria-hidden="true">→</span>{/if}
						<span
							class="inline-flex h-6 items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-2 font-medium shadow-flat md:h-7 md:px-2.5"
						>
							<i class={cn('size-2 rounded-full', stop.dot)}></i>{stop.name}
						</span>
					</li>
				{/each}
			</ol>
		</div>

		<p class="hidden text-xs text-muted-foreground md:block">
			A private planner. Guests can look at everything and change nothing.
		</p>
	</section>

	<section
		class="flex items-start justify-center px-4 pt-4 pb-10 md:items-center md:px-10 md:py-12"
	>
		<div
			class="w-full max-w-sm rounded-3xl border border-border/70 bg-card p-6 shadow-soft motion-safe:animate-in motion-safe:duration-500 motion-safe:fade-in-0 motion-safe:zoom-in-98 md:p-8"
		>
			<h2 class="font-serif text-2xl font-semibold tracking-tight">Welcome back</h2>
			<p class="mt-1 text-sm text-muted-foreground">Sign in to plan the trip.</p>
			<form
				method="post"
				class="mt-6"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update();
						pending = false;
					};
				}}
			>
				<Field.FieldGroup>
					<Field.Field data-invalid={form?.message !== undefined}>
						<Field.FieldLabel for="username">Username</Field.FieldLabel>
						<Input
							id="username"
							name="username"
							class="h-11"
							autocomplete="username"
							autocapitalize="none"
							spellcheck={false}
							required
							value={form?.username ?? ''}
						/>
					</Field.Field>
					<Field.Field data-invalid={form?.message !== undefined}>
						<Field.FieldLabel for="password">Password</Field.FieldLabel>
						<Input
							id="password"
							name="password"
							type="password"
							class="h-11"
							autocomplete="current-password"
							required
							aria-invalid={form?.message !== undefined}
						/>
						{#if form?.message}
							<Field.FieldError>{form.message}</Field.FieldError>
						{/if}
					</Field.Field>
					<Button type="submit" size="lg" class="mt-1 h-11 w-full" disabled={pending}>
						{#if pending}<Spinner data-icon="inline-start" />{/if}
						Sign in
					</Button>
				</Field.FieldGroup>
			</form>
		</div>
	</section>
</main>
