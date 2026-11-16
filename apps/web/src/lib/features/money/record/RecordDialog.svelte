<!--
	The add / edit sheet of the Money and Prep screens (old trip.js openEdit / submitEdit and the #tsheet dialog):
	one form per collection, Save, Cancel, and Delete that asks for a second tap. Writes are pessimistic, as on the
	old site: the sheet closes, the write goes through #lib/sync/write.ts, and a toast says how it went. Background
	refreshes are held while it is open.
-->
<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { holdRefresh } from '#lib/components/shell/refresh.svelte.js';
	import type { ContentCountry } from '#lib/content/types.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { write } from '#lib/sync/write.js';
	import { cn } from '#lib/utils.js';
	import type { TripData } from '../trip-docs.ts';
	import {
		bagCategories,
		initialValues,
		recordSchema,
		submitData,
		type FormValues,
		type NewSpendDefaults,
		type RecordTarget,
	} from './schema.ts';

	interface Props {
		target: RecordTarget | null;
		trip: TripData;
		countries: readonly ContentCountry[];
		spendDefaults: NewSpendDefaults;
		onclose: () => void;
	}

	let { target, trip, countries, spendDefaults, onclose }: Props = $props();

	let values: FormValues = $state({});
	let initial: FormValues = $state({});
	let delArmed = $state(false);
	let formEl: HTMLFormElement | null = $state(null);

	const open = $derived(target !== null);
	const schema = $derived(target === null ? null : recordSchema(target.col, countries));
	const doc = $derived.by(() => {
		const id = target?.id ?? null;
		if (target === null || id === null) return null;
		return trip[target.col].find((d) => d.id === id) ?? null;
	});
	const exists = $derived(doc !== null);
	const categories = $derived(target?.col === 'bag' ? bagCategories(trip.bag) : []);
	const listId = 'record-bag-categories';

	// A new target fills the form once (later live updates of the document do not overwrite what is being typed).
	let filledFor: RecordTarget | null = null;
	$effect.pre(() => {
		if (target === filledFor) return;
		filledFor = target;
		delArmed = false;
		if (target === null || schema === null) return;
		const v = initialValues(schema, target.col, doc, spendDefaults);
		values = { ...v };
		initial = { ...v };
	});

	$effect(() => {
		if (!open) return;
		return holdRefresh();
	});

	function close(): void {
		onclose();
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (target === null || schema === null) return;
		// Read everything before close(): closing clears `target`, and `exists` with it.
		const { col } = target;
		const editing = exists;
		const id = col === 'settings' ? 'main' : editing ? target.id : null;
		const result = submitData(schema, values, editing ? initial : null);
		if (!result.ok) {
			toast.error(result.message);
			return;
		}
		close();
		if (result.data === null) return;
		const outcome = await write('trip.write', {
			col,
			op: editing ? 'update' : 'set',
			data: result.data,
			...(id === null ? {} : { id }),
		});
		if (outcome.ok) toast.success(editing ? 'Saved' : 'Added');
	}

	async function remove(): Promise<void> {
		const id = target?.id ?? null;
		if (target === null || id === null) return;
		if (!delArmed) {
			delArmed = true;
			return;
		}
		const { col } = target;
		close();
		const outcome = await write('trip.write', { col, op: 'delete', id });
		if (outcome.ok) toast.success('Deleted');
	}

	function autoFocus(event: Event): void {
		event.preventDefault();
		if (exists) formEl?.focus();
		else formEl?.querySelector<HTMLElement>('input, textarea, select')?.focus();
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) close();
	}}
>
	<Dialog.Content class="max-h-svh overflow-y-auto" onOpenAutoFocus={autoFocus}>
		{#if target !== null && schema !== null}
			<Dialog.Header>
				<Dialog.Title>{exists ? 'Edit' : 'Add'} {schema.name}</Dialog.Title>
				<Dialog.Description class="sr-only">
					{exists ? 'Change the fields and save.' : 'Fill in the fields and save.'}
				</Dialog.Description>
			</Dialog.Header>
			<form bind:this={formEl} tabindex="-1" novalidate class="outline-none" onsubmit={save}>
				<Field.FieldGroup class="grid sm:grid-cols-2">
					{#each schema.fields as f (f.key)}
						{@const fid = `f-${target.col}-${f.key}`}
						<Field.Field class={cn(f.full === true && 'sm:col-span-2')}>
							<Field.FieldLabel for={fid}>{f.label}</Field.FieldLabel>
							{#if f.type === 'select'}
								<NativeSelect.Root id={fid} name={f.key} class="w-full" bind:value={values[f.key]}>
									{#each f.options ?? [] as o (o.value)}
										<NativeSelect.Option value={o.value}>{o.label}</NativeSelect.Option>
									{/each}
								</NativeSelect.Root>
							{:else if f.type === 'textarea'}
								<Textarea id={fid} name={f.key} rows={4} bind:value={values[f.key]} />
							{:else if f.type === 'number'}
								<Input
									id={fid}
									name={f.key}
									type="number"
									min="0"
									step="any"
									inputmode="decimal"
									bind:value={() => values[f.key] ?? '', (v) => (values[f.key] = String(v ?? ''))}
								/>
							{:else}
								<Input
									id={fid}
									name={f.key}
									type={f.type}
									list={f.key === 'category' && categories.length > 0 ? listId : undefined}
									bind:value={values[f.key]}
								/>
							{/if}
						</Field.Field>
					{/each}
				</Field.FieldGroup>
				{#if categories.length > 0}
					<datalist id={listId}>
						{#each categories as c (c)}<option value={c}></option>{/each}
					</datalist>
				{/if}
				<div class="mt-6 flex flex-wrap items-center gap-2">
					{#if exists && target.col !== 'settings'}
						<Button type="button" variant="destructive" onclick={remove}>Delete</Button>
						{#if delArmed}
							<span class="text-sm text-muted-foreground" role="status"
								>Tap Delete again to remove it.</span
							>
						{/if}
					{/if}
					<span class="flex-1"></span>
					<Button type="button" variant="ghost" onclick={close}>Cancel</Button>
					<Button type="submit">Save</Button>
				</div>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
