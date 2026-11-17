<!--
	The add / edit sheet of the Money and Prep screens (old trip.js openEdit / submitEdit and the #tsheet dialog):
	one form per collection, Save, Cancel, and Delete that asks for a second tap. Writes are pessimistic, as on the
	old site: the sheet closes, the write goes through #lib/sync/write.ts, and a toast says how it went. Background
	refreshes are held while it is open.
-->
<script lang="ts">
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
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
	import { plural } from '../model.ts';
	import { sortedByOrder, str, type TripData } from '../trip-docs.ts';
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
		/** Open the sheet on another document (a task's step); without it the steps cannot be edited from here. */
		onretarget?: (target: RecordTarget) => void;
		onclose: () => void;
	}

	let { target, trip, countries, spendDefaults, onretarget, onclose }: Props = $props();

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
	// A task that belongs to another one is a step.
	const isStep = $derived(
		target?.col === 'tasks' &&
			(target.preset?.['parent'] !== undefined ||
				(typeof doc?.['parent'] === 'string' && doc['parent'] !== '')),
	);
	const stepCount = $derived(
		target?.col === 'tasks' && doc !== null
			? trip.tasks.filter((t) => t['parent'] === doc.id).length
			: 0,
	);
	// The steps of the task being edited, in order; added and opened from this sheet.
	const steps = $derived(
		target?.col === 'tasks' && doc !== null && !isStep
			? sortedByOrder(trip.tasks.filter((t) => t['parent'] === doc.id))
			: [],
	);
	const canHaveSteps = $derived(target?.col === 'tasks' && doc !== null && !isStep);
	let newStep = $state('');
	let addingStep = $state(false);

	async function addStep(): Promise<void> {
		const title = newStep.trim();
		if (doc === null || title === '' || addingStep) return;
		addingStep = true;
		const outcome = await write('trip.write', {
			col: 'tasks',
			op: 'set',
			data: { title, status: 'todo', parent: doc.id },
		});
		addingStep = false;
		if (outcome.ok) newStep = '';
	}

	const noun = $derived(isStep ? 'step' : (schema?.name ?? ''));
	const categories = $derived(target?.col === 'bag' ? bagCategories(trip.bag) : []);
	const listId = 'record-bag-categories';

	// A new target fills the form once (later live updates of the document do not overwrite what is being typed).
	let filledFor: RecordTarget | null = null;
	$effect.pre(() => {
		if (target === filledFor) return;
		filledFor = target;
		delArmed = false;
		newStep = '';
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
		const { col, preset } = target;
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
			data: editing ? result.data : { ...result.data, ...preset },
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
	<!-- On a phone the sheet sits at the bottom, in reach of the thumb; elsewhere it is centred. -->
	<Dialog.Content
		class="max-h-svh overflow-y-auto max-md:top-auto max-md:bottom-3 max-md:translate-y-0 sm:max-w-lg"
		onOpenAutoFocus={autoFocus}
	>
		{#if target !== null && schema !== null}
			<Dialog.Header>
				<Dialog.Title>
					<span class="font-serif text-2xl font-semibold tracking-tight"
						>{exists ? 'Edit' : 'Add'} {noun}</span
					>
				</Dialog.Title>
				<Dialog.Description class="sr-only">
					{exists ? 'Change the fields and save.' : 'Fill in the fields and save.'}
				</Dialog.Description>
			</Dialog.Header>
			<form bind:this={formEl} tabindex="-1" novalidate class="outline-none" onsubmit={save}>
				<Field.FieldGroup class="grid grid-cols-2">
					{#each schema.fields as f (f.key)}
						{@const fid = `f-${target.col}-${f.key}`}
						<Field.Field class={cn(f.full === true && 'col-span-2')}>
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
							{#if f.hint !== undefined}
								<Field.FieldDescription>{f.hint}</Field.FieldDescription>
							{/if}
						</Field.Field>
					{/each}
				</Field.FieldGroup>
				{#if canHaveSteps}
					<section class="mt-6 flex flex-col gap-2" aria-labelledby="record-steps">
						<h3 id="record-steps" class="eyebrow">Steps</h3>
						{#if steps.length > 0}
							<ul
								class="flex flex-col divide-y divide-border/70 rounded-xl border border-border/80"
							>
								{#each steps as s (s.id)}
									<li class="flex items-center gap-2 py-1 pr-1 pl-3" data-testid="record-step">
										<span
											class={cn(
												'min-w-0 flex-1 text-sm',
												s['status'] === 'done' && 'text-muted-foreground line-through',
											)}>{str(s, 'title')}</span
										>
										{#if onretarget !== undefined}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												class="size-9 shrink-0"
												aria-label={`Edit step: ${str(s, 'title')}`}
												title="Edit step"
												onclick={() => {
													onretarget({ col: 'tasks', id: s.id });
												}}
											>
												<PencilIcon />
											</Button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
						<div class="flex gap-2">
							<Input
								aria-label="New step"
								placeholder="Add a step"
								bind:value={newStep}
								onkeydown={(e: KeyboardEvent) => {
									if (e.key !== 'Enter') return;
									e.preventDefault();
									void addStep();
								}}
							/>
							<Button
								type="button"
								variant="secondary"
								disabled={newStep.trim() === '' || addingStep}
								onclick={() => void addStep()}
							>
								<PlusIcon data-icon="inline-start" />Add step
							</Button>
						</div>
						<p class="text-xs text-muted-foreground">
							A task with steps is done when all of them are. Open a step with its pen to give it
							notes or dates.
						</p>
					</section>
				{/if}
				{#if categories.length > 0}
					<datalist id={listId}>
						{#each categories as c (c)}<option value={c}></option>{/each}
					</datalist>
				{/if}
				<div class="mt-7 flex flex-wrap items-center gap-2 border-t border-border/70 pt-5">
					{#if exists && target.col !== 'settings'}
						<Button type="button" variant="destructive" class="max-md:h-11" onclick={remove}
							>Delete</Button
						>
						{#if delArmed}
							<span class="text-sm text-muted-foreground" role="status"
								>{stepCount > 0
									? `Tap Delete again to remove it and its ${plural(stepCount, 'step')}.`
									: 'Tap Delete again to remove it.'}</span
							>
						{/if}
					{/if}
					<span class="flex-1"></span>
					<Button type="button" variant="ghost" class="max-md:h-11" onclick={close}>Cancel</Button>
					<Button type="submit" class="min-w-24 max-md:h-11">Save</Button>
				</div>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
