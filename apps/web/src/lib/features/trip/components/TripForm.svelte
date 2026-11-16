<!--
	The edit form of any trip collection in a trip sheet (the old openEdit / submitEdit): legs, days, fixed costs,
	settings, and the Money and Prep collections, from one schema. A leg shows only the fields of its kind. Delete
	asks twice ("Tap Delete again to remove it."). Mount it to open it; it calls `onclose` when done.
	Writes are pessimistic: the sheet stays open until the server answers, and stays open on a refusal so nothing
	typed is lost.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { localKey } from '@atr/shared/trip';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import type { ContentCountry } from '#lib/content/types.js';
	import { write } from '#lib/sync/write.js';
	import { cn } from '#lib/utils.js';
	import {
		fieldShown,
		formTitle,
		initialValues,
		submitArgs,
		tripSchema,
		type FormTarget,
		type FormValues,
	} from '../forms.ts';
	import type { TripDoc } from '../types.ts';
	import TripSheet from './TripSheet.svelte';

	interface Props {
		target: FormTarget;
		/** The documents of target.col (to find the one being edited). */
		docs: readonly TripDoc[];
		countries: readonly ContentCountry[];
		/** For a new expense: the budget of the country you are in. */
		currentBudget?: { country?: string; currency?: string } | null;
		onclose: () => void;
	}

	let { target, docs, countries, currentBudget = null, onclose }: Props = $props();

	// The form opens once with the document as it is; later live updates do not overwrite what is being typed.
	const opened = untrack(() => {
		const schema = tripSchema(countries)[target.col];
		const doc = target.id === null ? null : (docs.find((d) => d.id === target.id) ?? null);
		const exists = doc !== null;
		return {
			col: target.col,
			id: target.id,
			schema,
			exists,
			title: formTitle(target.col, schema, target.id, exists),
			initial: initialValues(target.col, schema, doc, { today: localKey(), currentBudget }),
			categories:
				target.col === 'bag'
					? [
							...new Set(
								docs
									.map((d) => d['category'])
									.filter((c): c is string => typeof c === 'string' && c !== ''),
							),
						]
					: [],
		};
	});
	const { col, id, schema, exists, title, initial, categories } = opened;

	let values: FormValues = $state({ ...initial });
	let delArmed = $state(false);
	let busy = $state(false);
	const legType = $derived(values['type'] ?? '');
	const canDelete = exists && col !== 'settings';

	/** A new document: focus the first field (the old sheet did); an edit keeps focus on the sheet. */
	function focusFirst(node: HTMLFormElement): void {
		if (!exists) node.querySelector<HTMLElement>('input, textarea')?.focus();
	}

	async function submit(e: SubmitEvent): Promise<void> {
		e.preventDefault();
		if (busy) return;
		const result = submitArgs(col, schema, id, exists, values, initial);
		if (result === null) {
			onclose();
			return;
		}
		if (!result.ok) {
			toast.error(result.message);
			return;
		}
		busy = true;
		const outcome = await write('trip.write', result.args);
		busy = false;
		if (outcome.ok) toast.success(exists ? 'Saved' : 'Added');
		// Frozen keeps the write in the outbox: the change is not lost, so the sheet can close.
		if (outcome.ok || outcome.reason === 'frozen') onclose();
	}

	async function del(): Promise<void> {
		if (!delArmed) {
			delArmed = true;
			return;
		}
		if (id === null || busy) return;
		busy = true;
		const outcome = await write('trip.write', { col, op: 'delete', id });
		busy = false;
		if (outcome.ok) toast.success('Deleted');
		if (outcome.ok || outcome.reason === 'frozen') onclose();
	}
</script>

<TripSheet open {title} {onclose}>
	<form
		{@attach focusFirst}
		novalidate
		class="flex flex-col gap-5"
		data-testid="trip-form"
		data-col={col}
		onsubmit={submit}
	>
		<Field.Group class="grid grid-cols-1 md:grid-cols-2">
			{#each schema.fields as field (field.key)}
				{@const fid = `f-${col}-${field.key}`}
				<Field.Field
					class={cn(field.full && 'md:col-span-2')}
					hidden={col === 'legs' && !fieldShown(field, legType)}
				>
					<Field.Label for={fid}>{field.label}</Field.Label>
					{#if field.type === 'select'}
						<NativeSelect.Root
							id={fid}
							name={field.key}
							class="w-full"
							bind:value={values[field.key]}
						>
							{#each field.options ?? [] as o (o.value)}
								<NativeSelect.Option value={o.value}>{o.label}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					{:else if field.type === 'textarea'}
						<Textarea id={fid} name={field.key} rows={4} bind:value={values[field.key]} />
					{:else if field.type === 'number'}
						<Input
							id={fid}
							name={field.key}
							type="number"
							min="0"
							step="any"
							inputmode="decimal"
							bind:value={values[field.key]}
						/>
					{:else}
						<Input
							id={fid}
							name={field.key}
							type={field.type}
							list={field.key === 'category' && categories.length > 0
								? 'trip-form-categories'
								: undefined}
							bind:value={values[field.key]}
						/>
					{/if}
				</Field.Field>
			{/each}
		</Field.Group>
		{#if categories.length > 0}
			<datalist id="trip-form-categories">
				{#each categories as c (c)}<option value={c}></option>{/each}
			</datalist>
		{/if}
		<div
			class="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center gap-2 border-t border-border/70 bg-popover px-4 py-4 md:-mx-6 md:-mb-5 md:px-6 3xl:-mx-8 3xl:px-8"
		>
			{#if canDelete}
				<Button type="button" variant="destructive" disabled={busy} onclick={del}>Delete</Button>
				{#if delArmed}<span class="text-sm text-destructive" role="status"
						>Tap Delete again to remove it.</span
					>{/if}
			{/if}
			<span class="flex-1"></span>
			<Button type="button" variant="outline" onclick={onclose}>Cancel</Button>
			<Button type="submit" disabled={busy}
				>{#if busy}<Spinner data-icon="inline-start" />{/if}Save</Button
			>
		</div>
	</form>
</TripSheet>
