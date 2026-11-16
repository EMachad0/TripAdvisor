<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head>
	<title>Sign in · Asia Trip Ranker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="flex min-h-svh items-center justify-center p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title><h1 class="font-serif text-2xl">Asia Trip Ranker</h1></Card.Title>
			<Card.Description>Sign in to plan the trip.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="post"
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
							autocomplete="current-password"
							required
							aria-invalid={form?.message !== undefined}
						/>
						{#if form?.message}
							<Field.FieldError>{form.message}</Field.FieldError>
						{/if}
					</Field.Field>
					<Button type="submit" disabled={pending}>
						{#if pending}<Spinner data-icon="inline-start" />{/if}
						Sign in
					</Button>
				</Field.FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>
</main>
